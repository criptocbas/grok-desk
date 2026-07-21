//! User-assigned session display names for Grok Desk.
//!
//! Stored at `~/.config/grok-desk/session-titles.json` so renames survive
//! restarts and are not clobbered by Grok's auto `session_summary` / recap.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TitlesFile {
    /// sessionId → custom display title
    #[serde(default)]
    titles: HashMap<String, String>,
}

fn config_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(PathBuf::from(home).join(".config").join("grok-desk"))
}

fn titles_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("session-titles.json"))
}

fn load_file() -> Result<TitlesFile, String> {
    let path = titles_path()?;
    if !path.is_file() {
        return Ok(TitlesFile::default());
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(TitlesFile::default());
    }
    serde_json::from_str(&text).map_err(|e| format!("session-titles.json: {e}"))
}

fn save_file(file: &TitlesFile) -> Result<(), String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = titles_path()?;
    let tmp = dir.join("session-titles.json.tmp");
    let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_session_title(session_id: &str) -> Result<Option<String>, String> {
    let file = load_file()?;
    Ok(file.titles.get(session_id).cloned())
}

/// Set or clear a custom title. Empty/whitespace clears the override.
pub fn set_session_title(session_id: String, title: String) -> Result<Option<String>, String> {
    if session_id.trim().is_empty() {
        return Err("sessionId required".into());
    }
    let mut file = load_file()?;
    let trimmed = title.trim().to_string();
    let out = if trimmed.is_empty() {
        file.titles.remove(&session_id);
        None
    } else {
        // Soft length cap for UI
        let capped = if trimmed.chars().count() > 80 {
            trimmed.chars().take(80).collect::<String>()
        } else {
            trimmed
        };
        file.titles.insert(session_id.clone(), capped.clone());
        Some(capped)
    };
    save_file(&file)?;
    // Keep pin bookmark titles in sync when present
    let _ = crate::pins::update_pin_title(&session_id, out.clone());
    Ok(out)
}

/// Prefer custom Desk title, else `fallback`.
pub fn resolve_title(session_id: &str, fallback: Option<String>) -> Option<String> {
    match get_session_title(session_id) {
        Ok(Some(t)) if !t.is_empty() => Some(t),
        _ => fallback,
    }
}
