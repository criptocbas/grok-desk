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
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub from_disk: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSession {
    pub session_id: String,
    pub cwd: String,
    pub title: Option<String>,
    pub model_id: Option<String>,
    pub updated_at: Option<String>,
    pub num_chat_messages: Option<u64>,
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

/// Pending `x.ai/exit_plan_mode` reverse-request (plan ready for approval).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanApprovalRequest {
    pub request_id: u64,
    pub session_id: String,
    pub tool_call_id: Option<String>,
    pub plan_content: Option<String>,
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
        // IMPORTANT: Do NOT advertise client `fs` / `terminal` capabilities.
        // When those are true, Grok routes read_file / shell through ACP
        // methods on the *client* (us). Our Phase-0 stubs returned the wrong
        // JSON shape (`text` instead of `content`) and left terminal/*
        // unimplemented, so tools failed with deserialize / method-not-found
        // even though the agent was healthy.
        //
        // With fs/terminal off, the agent uses its own local filesystem and
        // shell — same path as the normal TUI, and the right default for a
        // desktop shell that co-resides with the project files.
        let init = self
            .request(
                "initialize",
                json!({
                    "protocolVersion": 1,
                    "clientCapabilities": {
                        "fs": { "readTextFile": false, "writeTextFile": false },
                        "terminal": false
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

        // Track last-used for convenience; multi-session uses explicit ids.
        *self.session_id.lock() = Some(session_id.clone());
        *self.cwd.lock() = Some(cwd_str.clone());
        if model_id.is_some() {
            self.info.lock().model_id = model_id.clone();
        }

        let title = folder_title(&cwd_str);
        Ok(SessionInfo {
            session_id,
            cwd: cwd_str,
            model_id,
            title: Some(title),
            updated_at: None,
            from_disk: false,
        })
    }

    /// Load an existing on-disk session (replays history via session/update).
    pub async fn load_session(&self, session_id: &str, cwd: &Path) -> Result<SessionInfo> {
        let cwd_str = cwd
            .canonicalize()
            .unwrap_or_else(|_| cwd.to_path_buf())
            .display()
            .to_string();

        // Replay streams as session/update notifications before this returns.
        let _ = self
            .request(
                "session/load",
                json!({
                    "sessionId": session_id,
                    "cwd": cwd_str,
                    "mcpServers": []
                }),
            )
            .await?;

        *self.session_id.lock() = Some(session_id.to_string());
        *self.cwd.lock() = Some(cwd_str.clone());

        Ok(SessionInfo {
            session_id: session_id.to_string(),
            cwd: cwd_str.clone(),
            model_id: self.info.lock().model_id.clone(),
            title: Some(folder_title(&cwd_str)),
            updated_at: None,
            from_disk: true,
        })
    }

    pub async fn prompt(&self, session_id: &str, text: &str) -> Result<Value> {
        if session_id.trim().is_empty() {
            return Err(AcpError::Msg("session_id required".into()));
        }
        *self.session_id.lock() = Some(session_id.to_string());

        self.request(
            "session/prompt",
            json!({
                "sessionId": session_id,
                "prompt": [{ "type": "text", "text": text }]
            }),
        )
        .await
    }

    pub fn cancel(&self, session_id: &str) -> Result<()> {
        if session_id.trim().is_empty() {
            return Err(AcpError::Msg("session_id required".into()));
        }
        let msg = json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": { "sessionId": session_id }
        });
        self.write_line(&msg)
    }

    /// Read plan.md for a session if present (session root or goal/).
    pub fn read_plan_doc(session_id: &str, cwd: &str) -> Option<String> {
        let home = dirs_home()?;
        let encoded = urlencoding_path(cwd);
        let base = Path::new(&home)
            .join(".grok")
            .join("sessions")
            .join(&encoded)
            .join(session_id);
        for rel in ["plan.md", "goal/plan.md"] {
            let p = base.join(rel);
            if let Ok(text) = std::fs::read_to_string(&p) {
                if !text.trim().is_empty() {
                    return Some(text);
                }
            }
        }
        None
    }

    /// List recent sessions from ~/.grok/sessions (newest first).
    pub fn list_disk_sessions(limit: usize) -> Result<Vec<DiskSession>> {
        let home = dirs_home().ok_or_else(|| AcpError::Msg("HOME not set".into()))?;
        let root = Path::new(&home).join(".grok").join("sessions");
        if !root.is_dir() {
            return Ok(vec![]);
        }

        let mut out: Vec<DiskSession> = Vec::new();
        let mut stack = vec![root];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let summary = path.join("summary.json");
                    if summary.is_file() {
                        if let Ok(text) = std::fs::read_to_string(&summary) {
                            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                                let sid = v
                                    .pointer("/info/id")
                                    .and_then(|x| x.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let cwd = v
                                    .pointer("/info/cwd")
                                    .and_then(|x| x.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if sid.is_empty() || cwd.is_empty() {
                                    continue;
                                }
                                let title = v
                                    .get("session_summary")
                                    .and_then(|x| x.as_str())
                                    .filter(|s| !s.is_empty())
                                    .map(|s| s.to_string())
                                    .or_else(|| Some(folder_title(&cwd)));
                                out.push(DiskSession {
                                    session_id: sid,
                                    cwd,
                                    title,
                                    model_id: v
                                        .get("current_model_id")
                                        .and_then(|x| x.as_str())
                                        .map(|s| s.to_string()),
                                    updated_at: v
                                        .get("updated_at")
                                        .and_then(|x| x.as_str())
                                        .map(|s| s.to_string()),
                                    num_chat_messages: v
                                        .get("num_chat_messages")
                                        .and_then(|x| x.as_u64()),
                                });
                            }
                        }
                    } else {
                        stack.push(path);
                    }
                }
            }
        }

        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        out.truncate(limit.max(1));
        Ok(out)
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

    /// Answer `x.ai/exit_plan_mode`: outcome = approved | cancelled | abandoned.
    pub fn respond_plan_approval(
        &self,
        request_id: u64,
        outcome: &str,
        feedback: Option<String>,
    ) -> Result<()> {
        let mut result = json!({ "outcome": outcome });
        if let Some(fb) = feedback {
            if !fb.trim().is_empty() {
                result["feedback"] = json!(fb);
            }
        }
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
        let cwd = self.cwd.lock().clone().unwrap_or_default();
        Some(SessionInfo {
            session_id: sid,
            title: Some(folder_title(&cwd)),
            cwd,
            model_id: self.info.lock().model_id.clone(),
            updated_at: None,
            from_disk: false,
        })
    }
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}

fn folder_title(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(cwd)
        .to_string()
}

/// Match Grok's session dir encoding (`/` → `%2F`).
fn urlencoding_path(cwd: &str) -> String {
    cwd.replace('%', "%25").replace('/', "%2F")
}

/// Apply optional 1-based `line` start and `limit` line count (ACP fs/read_text_file).
fn apply_line_limit(text: &str, line: Option<u64>, limit: Option<u64>) -> String {
    if line.is_none() && limit.is_none() {
        return text.to_string();
    }
    let lines: Vec<&str> = text.lines().collect();
    let start = line.unwrap_or(1).saturating_sub(1) as usize;
    if start >= lines.len() {
        return String::new();
    }
    let end = match limit {
        Some(n) => (start + n as usize).min(lines.len()),
        None => lines.len(),
    };
    lines[start..end].join("\n")
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

/// Unwrap gateway ext form: `_x.ai/foo` + nested method/params → (`x.ai/foo`, inner params).
fn normalize_agent_method(method: &str, params: Value) -> (String, Value) {
    if let Some(stripped) = method.strip_prefix('_') {
        if let Some(inner_m) = params.get("method").and_then(|m| m.as_str()) {
            let inner_p = params
                .get("params")
                .cloned()
                .unwrap_or(Value::Null);
            return (inner_m.to_string(), inner_p);
        }
        return (stripped.to_string(), params);
    }
    (method.to_string(), params)
}

fn handle_agent_request(agent: &SharedAgent, app: &AppHandle, id: u64, msg: &Value) {
    let raw_method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let raw_params = msg.get("params").cloned().unwrap_or(Value::Null);
    let (method, params) = normalize_agent_method(raw_method, raw_params);

    match method.as_str() {
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
        // Plan ready — client must respond with approved / cancelled / abandoned
        "x.ai/exit_plan_mode" => {
            let session_id = params
                .get("sessionId")
                .or_else(|| params.get("session_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_call_id = params
                .get("toolCallId")
                .or_else(|| params.get("tool_call_id"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let plan_content = params
                .get("planContent")
                .or_else(|| params.get("plan_content"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let req = PlanApprovalRequest {
                request_id: id,
                session_id: session_id.clone(),
                tool_call_id,
                plan_content: plan_content.clone(),
            };
            let _ = app.emit("acp://plan-approval", req);

            // Also surface content on the plan pane via session-update-like event
            if let Some(content) = plan_content {
                let _ = app.emit(
                    "acp://session-update",
                    json!({
                        "sessionId": session_id,
                        "update": {
                            "sessionUpdate": "plan_doc",
                            "content": content
                        }
                    }),
                );
            }
        }
        // Kept for correctness if we re-enable clientCapabilities.fs later.
        // ACP requires result field name `content` (not `text`).
        "fs/read_text_file" => {
            let path = params.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let line = params.get("line").and_then(|v| v.as_u64());
            let limit = params.get("limit").and_then(|v| v.as_u64());
            let result = match std::fs::read_to_string(path) {
                Ok(text) => {
                    let content = apply_line_limit(&text, line, limit);
                    json!({ "jsonrpc": "2.0", "id": id, "result": { "content": content } })
                }
                Err(e) => {
                    let code = if e.kind() == std::io::ErrorKind::NotFound {
                        -32002 // ResourceNotFound-ish; agent maps by message too
                    } else {
                        -32000
                    };
                    json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": code, "message": e.to_string() }
                    })
                }
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
                // Spec: empty result on success (`null`)
                Ok(()) => json!({ "jsonrpc": "2.0", "id": id, "result": null }),
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
