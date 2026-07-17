//! ACP (Agent Client Protocol) bridge to `grok agent stdio`.
//!
//! Spawns the official Grok Build binary, speaks JSON-RPC over pipes,
//! emits Tauri events for session updates, and surfaces permission
//! requests to the UI.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use tokio::sync::oneshot;

#[derive(Debug, Error)]
pub enum AcpError {
    #[error("{0}")]
    Msg(String),
    #[error("request timed out")]
    Timeout,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

impl Serialize for AcpError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, AcpError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokStatus {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub agent_version: Option<String>,
    pub model_id: Option<String>,
    pub subscription_tier: Option<String>,
    pub auth_email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub cwd: String,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOption {
    pub option_id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
    pub request_id: u64,
    pub session_id: Option<String>,
    pub tool_call: Option<Value>,
    pub options: Vec<PermissionOption>,
    pub raw: Value,
}

pub struct SharedAgent {
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
    session_id: Mutex<Option<String>>,
    cwd: Mutex<Option<String>>,
    info: Mutex<AgentInfo>,
    child: Mutex<Child>,
}

impl SharedAgent {
    pub fn grok_status() -> GrokStatus {
        match which::which("grok") {
            Ok(path) => {
                let version = Command::new(&path)
                    .arg("--version")
                    .output()
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .map(|s| s.trim().to_string());
                GrokStatus {
                    available: true,
                    path: Some(path.display().to_string()),
                    version,
                }
            }
            Err(_) => GrokStatus {
                available: false,
                path: None,
                version: None,
            },
        }
    }

    pub fn spawn(app: AppHandle) -> Result<Arc<Self>> {
        let grok = which::which("grok").map_err(|_| {
            AcpError::Msg(
                "grok binary not found on PATH. Install: curl -fsSL https://x.ai/cli/install.sh | bash"
                    .into(),
            )
        })?;

        let mut child = Command::new(&grok)
            .args(["agent", "stdio"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AcpError::Msg("no stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AcpError::Msg("no stdout".into()))?;

        if let Some(stderr) = child.stderr.take() {
            let app2 = app.clone();
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().flatten() {
                    let _ = app2.emit("acp://stderr", line);
                }
            });
        }

        let agent = Arc::new(SharedAgent {
            stdin: Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            session_id: Mutex::new(None),
            cwd: Mutex::new(None),
            info: Mutex::new(AgentInfo {
                agent_version: None,
                model_id: None,
                subscription_tier: None,
                auth_email: None,
            }),
            child: Mutex::new(child),
        });

        {
            let agent_r = agent.clone();
            let app_r = app.clone();
            thread::spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    let Ok(line) = line else { break };
                    if line.trim().is_empty() {
                        continue;
                    }
                    handle_line(&agent_r, &app_r, &line);
                }
                let _ = app_r.emit(
                    "acp://status",
                    json!({ "running": false, "reason": "stdout closed" }),
                );
            });
        }

        Ok(agent)
    }

    fn write_line(&self, msg: &Value) -> Result<()> {
        let line = serde_json::to_string(msg)?;
        let mut stdin = self.stdin.lock();
        stdin.write_all(line.as_bytes())?;
        stdin.write_all(b"\n")?;
        stdin.flush()?;
        Ok(())
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().insert(id, tx);

        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        if let Err(e) = self.write_line(&msg) {
            self.pending.lock().remove(&id);
            return Err(e);
        }

        match tokio::time::timeout(Duration::from_secs(300), rx).await {
            Ok(Ok(v)) => {
                if let Some(err) = v.get("error") {
                    return Err(AcpError::Msg(err.to_string()));
                }
                Ok(v.get("result").cloned().unwrap_or(Value::Null))
            }
            Ok(Err(_)) => Err(AcpError::Msg("response channel closed".into())),
            Err(_) => {
                self.pending.lock().remove(&id);
                Err(AcpError::Timeout)
            }
        }
    }

    pub async fn initialize_and_auth(&self) -> Result<AgentInfo> {
        let init = self
            .request(
                "initialize",
                json!({
                    "protocolVersion": 1,
                    "clientCapabilities": {
                        "fs": { "readTextFile": true, "writeTextFile": true },
                        "terminal": true
                    },
                    "clientInfo": {
                        "name": "grok-desk",
                        "version": "0.1.0"
                    },
                    "_meta": {
                        "clientType": "grok-desk",
                        "clientVersion": "0.1.0"
                    }
                }),
            )
            .await?;

        let agent_version = init
            .get("_meta")
            .and_then(|m| m.get("agentVersion"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let model_id = init
            .pointer("/_meta/modelState/currentModelId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let default_auth = init
            .pointer("/_meta/defaultAuthMethodId")
            .and_then(|v| v.as_str())
            .unwrap_or("cached_token")
            .to_string();

        {
            let mut info = self.info.lock();
            info.agent_version = agent_version;
            info.model_id = model_id;
        }

        let auth = self
            .request("authenticate", json!({ "methodId": default_auth }))
            .await?;

        let email = auth
            .pointer("/_meta/email")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let tier = auth
            .pointer("/_meta/subscription_tier")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        {
            let mut info = self.info.lock();
            info.auth_email = email;
            info.subscription_tier = tier;
        }

        Ok(self.info.lock().clone())
    }

    pub async fn new_session(&self, cwd: &Path) -> Result<SessionInfo> {
        let cwd_str = cwd
            .canonicalize()
            .unwrap_or_else(|_| cwd.to_path_buf())
            .display()
            .to_string();

        let result = self
            .request(
                "session/new",
                json!({
                    "cwd": cwd_str,
                    "mcpServers": []
                }),
            )
            .await?;

        let session_id = result
            .get("sessionId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AcpError::Msg(format!("no sessionId in response: {result}")))?
            .to_string();

        let model_id = result
            .pointer("/models/currentModelId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        *self.session_id.lock() = Some(session_id.clone());
        *self.cwd.lock() = Some(cwd_str.clone());
        if model_id.is_some() {
            self.info.lock().model_id = model_id.clone();
        }

        Ok(SessionInfo {
            session_id,
            cwd: cwd_str,
            model_id,
        })
    }

    pub async fn prompt(&self, text: &str) -> Result<Value> {
        let session_id = self
            .session_id
            .lock()
            .clone()
            .ok_or_else(|| AcpError::Msg("no active session — create one first".into()))?;

        self.request(
            "session/prompt",
            json!({
                "sessionId": session_id,
                "prompt": [{ "type": "text", "text": text }]
            }),
        )
        .await
    }

    pub fn cancel(&self) -> Result<()> {
        let session_id = self
            .session_id
            .lock()
            .clone()
            .ok_or_else(|| AcpError::Msg("no active session".into()))?;

        let msg = json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": { "sessionId": session_id }
        });
        self.write_line(&msg)
    }

    pub fn respond_permission(&self, request_id: u64, option_id: Option<String>) -> Result<()> {
        let result = if let Some(id) = option_id {
            json!({ "outcome": { "outcome": "selected", "optionId": id } })
        } else {
            json!({ "outcome": { "outcome": "cancelled" } })
        };

        let msg = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result
        });
        self.write_line(&msg)
    }

    pub fn kill(&self) {
        if let Some(mut child) = self.child.try_lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
        for (_, tx) in self.pending.lock().drain() {
            let _ = tx.send(json!({ "error": { "message": "agent stopped" } }));
        }
    }

    pub fn info(&self) -> AgentInfo {
        self.info.lock().clone()
    }

    pub fn session(&self) -> Option<SessionInfo> {
        let sid = self.session_id.lock().clone()?;
        Some(SessionInfo {
            session_id: sid,
            cwd: self.cwd.lock().clone().unwrap_or_default(),
            model_id: self.info.lock().model_id.clone(),
        })
    }
}

fn handle_line(agent: &SharedAgent, app: &AppHandle, line: &str) {
    let Ok(msg) = serde_json::from_str::<Value>(line) else {
        let _ = app.emit("acp://raw", line);
        return;
    };

    if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
        if msg.get("method").is_some() {
            handle_agent_request(agent, app, id, &msg);
            return;
        }
        if let Some(tx) = agent.pending.lock().remove(&id) {
            let _ = tx.send(msg);
        }
        return;
    }

    if let Some(method) = msg.get("method").and_then(|v| v.as_str()) {
        match method {
            "session/update" => {
                let params = msg.get("params").cloned().unwrap_or(Value::Null);
                let _ = app.emit("acp://session-update", params);
            }
            _ => {
                let _ = app.emit(
                    "acp://notification",
                    json!({ "method": method, "params": msg.get("params") }),
                );
            }
        }
    }
}

fn handle_agent_request(agent: &SharedAgent, app: &AppHandle, id: u64, msg: &Value) {
    let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or(Value::Null);

    match method {
        "session/request_permission" => {
            let options = params
                .get("options")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|o| {
                            Some(PermissionOption {
                                option_id: o
                                    .get("optionId")
                                    .or_else(|| o.get("option_id"))
                                    .and_then(|v| v.as_str())?
                                    .to_string(),
                                name: o
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("option")
                                    .to_string(),
                                kind: o
                                    .get("kind")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            let session_id = params
                .get("sessionId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let req = PermissionRequest {
                request_id: id,
                session_id,
                tool_call: params.get("toolCall").cloned(),
                options,
                raw: params,
            };
            let _ = app.emit("acp://permission", req);
        }
        "fs/read_text_file" => {
            let path = params.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let result = match std::fs::read_to_string(path) {
                Ok(text) => json!({ "jsonrpc": "2.0", "id": id, "result": { "text": text } }),
                Err(e) => json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e.to_string() }
                }),
            };
            let _ = agent.write_line(&result);
        }
        "fs/write_text_file" => {
            let path = params.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let content = params
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let result = match std::fs::write(path, content) {
                Ok(()) => json!({ "jsonrpc": "2.0", "id": id, "result": {} }),
                Err(e) => json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e.to_string() }
                }),
            };
            let _ = agent.write_line(&result);
        }
        other => {
            let _ = app.emit(
                "acp://agent-request",
                json!({ "id": id, "method": other, "params": params }),
            );
            let _ = agent.write_line(&json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {
                    "code": -32601,
                    "message": format!("Method not implemented by grok-desk: {other}")
                }
            }));
        }
    }
}
