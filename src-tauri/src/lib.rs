mod acp;
mod git;
mod pins;

use std::path::PathBuf;
use std::sync::Arc;

use acp::{AgentInfo, DiskSession, GrokStatus, SessionInfo, SharedAgent};
use git::{GitDiffResult, GitStatusResult};
use parking_lot::Mutex;
use pins::SessionPin;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

struct AppState {
    agent: Mutex<Option<Arc<SharedAgent>>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            agent: Mutex::new(None),
        }
    }

    fn agent(&self) -> Result<Arc<SharedAgent>, String> {
        self.agent
            .lock()
            .clone()
            .ok_or_else(|| "Agent not running. Click Connect first.".into())
    }
}

#[tauri::command]
fn grok_status() -> GrokStatus {
    SharedAgent::grok_status()
}

#[tauri::command]
async fn agent_start(app: AppHandle, state: State<'_, AppState>) -> Result<AgentInfo, String> {
    {
        let g = state.agent.lock();
        if let Some(agent) = g.as_ref() {
            return Ok(agent.info());
        }
    }

    let agent = SharedAgent::spawn(app.clone()).map_err(|e| e.to_string())?;
    let info = agent
        .initialize_and_auth()
        .await
        .map_err(|e| e.to_string())?;
    *state.agent.lock() = Some(agent);
    let _ = app.emit("acp://status", serde_json::json!({ "running": true }));
    Ok(info)
}

#[tauri::command]
fn agent_stop(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(agent) = state.agent.lock().take() {
        agent.kill();
    }
    let _ = app.emit("acp://status", serde_json::json!({ "running": false }));
    Ok(())
}

#[tauri::command]
fn agent_info(state: State<'_, AppState>) -> Result<Option<AgentInfo>, String> {
    Ok(state.agent.lock().as_ref().map(|a| a.info()))
}

#[tauri::command]
fn agent_session(state: State<'_, AppState>) -> Result<Option<SessionInfo>, String> {
    Ok(state.agent.lock().as_ref().and_then(|a| a.session()))
}

#[tauri::command]
async fn session_new(state: State<'_, AppState>, cwd: String) -> Result<SessionInfo, String> {
    let agent = state.agent()?;
    let path = PathBuf::from(&cwd);
    if !path.is_dir() {
        return Err(format!("Not a directory: {cwd}"));
    }
    agent.new_session(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn session_load(
    state: State<'_, AppState>,
    session_id: String,
    cwd: String,
) -> Result<SessionInfo, String> {
    let agent = state.agent()?;
    let path = PathBuf::from(&cwd);
    if !path.is_dir() {
        return Err(format!("Not a directory: {cwd}"));
    }
    agent
        .load_session(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn session_prompt(
    state: State<'_, AppState>,
    session_id: String,
    text: String,
) -> Result<Value, String> {
    if text.trim().is_empty() {
        return Err("Empty prompt".into());
    }
    let agent = state.agent()?;
    agent
        .prompt(&session_id, &text)
        .await
        .map_err(|e| e.to_string())
}

/// `images`: [{ mimeType, data (base64), name? }]
#[tauri::command]
async fn session_prompt_with_images(
    state: State<'_, AppState>,
    session_id: String,
    text: String,
    images: Vec<PromptImage>,
) -> Result<Value, String> {
    if text.trim().is_empty() && images.is_empty() {
        return Err("Empty prompt".into());
    }
    let agent = state.agent()?;
    let mut blocks = Vec::new();
    if !text.trim().is_empty() {
        blocks.push(serde_json::json!({ "type": "text", "text": text }));
    }
    for (i, img) in images.iter().enumerate() {
        let mime = if img.mime_type.is_empty() {
            "image/png".into()
        } else {
            img.mime_type.clone()
        };
        // Prefer embedded resource (agent advertises embeddedContext: true).
        // Also include image block for clients/agents that accept it.
        let name = img
            .name
            .clone()
            .unwrap_or_else(|| format!("paste-{i}.png"));
        let uri = format!("file:///grok-desk-paste/{name}");
        blocks.push(serde_json::json!({
            "type": "resource",
            "resource": {
                "uri": uri,
                "mimeType": mime,
                "blob": img.data
            }
        }));
        blocks.push(serde_json::json!({
            "type": "image",
            "mimeType": mime,
            "data": img.data
        }));
    }
    if text.trim().is_empty() && !images.is_empty() {
        blocks.insert(
            0,
            serde_json::json!({
                "type": "text",
                "text": format!("[User attached {} image(s)]", images.len())
            }),
        );
    }
    agent
        .prompt_blocks(&session_id, blocks)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptImage {
    mime_type: String,
    /// Base64 without data: URL prefix
    data: String,
    name: Option<String>,
}

#[tauri::command]
fn session_cancel(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let agent = state.agent()?;
    agent.cancel(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn permission_respond(
    state: State<'_, AppState>,
    request_id: u64,
    option_id: Option<String>,
) -> Result<(), String> {
    let agent = state.agent()?;
    agent
        .respond_permission(request_id, option_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn plan_approval_respond(
    state: State<'_, AppState>,
    request_id: u64,
    outcome: String,
    feedback: Option<String>,
) -> Result<(), String> {
    let agent = state.agent()?;
    let outcome = match outcome.as_str() {
        "approved" | "cancelled" | "abandoned" => outcome,
        _ => return Err(format!("invalid plan outcome: {outcome}")),
    };
    agent
        .respond_plan_approval(request_id, &outcome, feedback)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_disk_sessions(limit: Option<usize>) -> Result<Vec<DiskSession>, String> {
    SharedAgent::list_disk_sessions(limit.unwrap_or(40)).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_plan_doc(session_id: String, cwd: String) -> Option<String> {
    SharedAgent::read_plan_doc(&session_id, &cwd)
}

#[tauri::command]
fn git_status(cwd: String) -> GitStatusResult {
    git::git_status(&cwd)
}

#[tauri::command]
fn git_diff(cwd: String, path: Option<String>) -> GitDiffResult {
    git::git_diff(&cwd, path)
}

#[tauri::command]
fn default_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "/home".into())
}

/// Switch model and/or reasoning effort for an open session (`session/set_model`).
#[tauri::command]
async fn session_set_model(
    state: State<'_, AppState>,
    session_id: String,
    model_id: String,
    reasoning_effort: Option<String>,
) -> Result<SessionInfo, String> {
    let agent = state.agent()?;
    agent
        .set_model(
            &session_id,
            &model_id,
            reasoning_effort.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

/// OS notification (background turn finished, etc.). Linux: notify-send.
#[tauri::command]
fn show_notification(title: String, body: String) -> Result<(), String> {
    acp::show_notification(&title, &body).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_pins() -> Result<Vec<SessionPin>, String> {
    pins::list_pins()
}

#[tauri::command]
fn pin_session(
    session_id: String,
    cwd: String,
    title: Option<String>,
) -> Result<Vec<SessionPin>, String> {
    pins::pin_session(session_id, cwd, title)
}

#[tauri::command]
fn unpin_session(
    session_id: String,
    cwd: Option<String>,
) -> Result<Vec<SessionPin>, String> {
    pins::unpin_session(session_id, cwd)
}

#[tauri::command]
fn reorder_pins(session_ids: Vec<String>) -> Result<Vec<SessionPin>, String> {
    pins::reorder_pins(session_ids)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            grok_status,
            agent_start,
            agent_stop,
            agent_info,
            agent_session,
            session_new,
            session_load,
            session_prompt,
            session_prompt_with_images,
            session_cancel,
            session_set_model,
            permission_respond,
            plan_approval_respond,
            list_disk_sessions,
            read_plan_doc,
            git_status,
            git_diff,
            default_cwd,
            show_notification,
            list_pins,
            pin_session,
            unpin_session,
            reorder_pins,
        ])
        .setup(|app| {
            if let Ok(home) = std::env::var("HOME") {
                let grok_bin = format!("{home}/.grok/bin");
                let path = std::env::var("PATH").unwrap_or_default();
                if !path.split(':').any(|p| p == grok_bin) {
                    // SAFETY: single-threaded at setup; only extends PATH
                    unsafe {
                        std::env::set_var("PATH", format!("{grok_bin}:{path}"));
                    }
                }
            }
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running grok-desk");
}
