//! Persistent session pins for Grok Desk.
//!
//! Stored at `~/.config/grok-desk/pins.json` (Desk UI preference only).
//! Session content still lives in `~/.grok/sessions` and is resumed via ACP
//! `session/load`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Soft cap so startup auto-resume stays snappy.
pub const MAX_PINS: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPin {
    pub session_id: String,
    pub cwd: String,
    #[serde(default)]
    pub title: Option<String>,
    /// ISO-8601 when the user pinned this session.
    #[serde(default)]
    pub pinned_at: Option<String>,
    /// True when the session directory/summary no longer exists on disk.
    #[serde(default)]
    pub missing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PinsFile {
    #[serde(default)]
    pins: Vec<SessionPin>,
}

fn config_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(PathBuf::from(home).join(".config").join("grok-desk"))
}

fn pins_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("pins.json"))
}

fn urlencoding_path(cwd: &str) -> String {
    cwd.replace('%', "%25").replace('/', "%2F")
}

/// Whether a Grok session still exists on disk (summary.json present).
pub fn session_exists_on_disk(session_id: &str, cwd: &str) -> bool {
    let Ok(home) = std::env::var("HOME") else {
        return false;
    };
    let summary = Path::new(&home)
        .join(".grok")
        .join("sessions")
        .join(urlencoding_path(cwd))
        .join(session_id)
        .join("summary.json");
    summary.is_file()
}

fn read_title_from_disk(session_id: &str, cwd: &str) -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let summary = Path::new(&home)
        .join(".grok")
        .join("sessions")
        .join(urlencoding_path(cwd))
        .join(session_id)
        .join("summary.json");
    let text = fs::read_to_string(summary).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    v.get("session_summary")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            v.get("generated_title")
                .and_then(|x| x.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        })
}

fn load_file() -> Result<PinsFile, String> {
    let path = pins_path()?;
    if !path.is_file() {
        return Ok(PinsFile::default());
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(PinsFile::default());
    }
    serde_json::from_str(&text).map_err(|e| format!("pins.json parse error: {e}"))
}

fn save_file(file: &PinsFile) -> Result<(), String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = pins_path()?;
    let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    // Atomic-ish write
    let tmp = dir.join("pins.json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn enrich(mut pin: SessionPin) -> SessionPin {
    let exists = session_exists_on_disk(&pin.session_id, &pin.cwd);
    pin.missing = !exists;
    if exists {
        if let Some(t) = read_title_from_disk(&pin.session_id, &pin.cwd) {
            // Prefer live disk title when pin title is empty or stale folder name
            if pin.title.as_deref().unwrap_or("").is_empty() {
                pin.title = Some(t);
            } else if pin.title.as_deref() == Path::new(&pin.cwd).file_name().and_then(|s| s.to_str())
            {
                pin.title = Some(t);
            }
        }
    }
    pin
}

/// List pins (order preserved), refreshing missing flags / titles from disk.
pub fn list_pins() -> Result<Vec<SessionPin>, String> {
    let mut file = load_file()?;
    file.pins = file.pins.into_iter().map(enrich).collect();
    // Persist missing flags so UI and next boot agree
    let _ = save_file(&file);
    Ok(file.pins)
}

pub fn pin_session(
    session_id: String,
    cwd: String,
    title: Option<String>,
) -> Result<Vec<SessionPin>, String> {
    if session_id.trim().is_empty() || cwd.trim().is_empty() {
        return Err("sessionId and cwd required".into());
    }
    let mut file = load_file()?;
    // Already pinned → move to front and refresh title
    if let Some(pos) = file
        .pins
        .iter()
        .position(|p| p.session_id == session_id && p.cwd == cwd)
    {
        let mut existing = file.pins.remove(pos);
        if title.as_ref().map(|t| !t.is_empty()).unwrap_or(false) {
            existing.title = title;
        }
        existing.missing = !session_exists_on_disk(&session_id, &cwd);
        file.pins.insert(0, existing);
    } else {
        if file.pins.len() >= MAX_PINS {
            return Err(format!(
                "Pin limit reached ({MAX_PINS}). Unpin one before adding another."
            ));
        }
        let pinned_at = chrono_lite_now();
        file.pins.insert(
            0,
            SessionPin {
                session_id: session_id.clone(),
                cwd: cwd.clone(),
                title,
                pinned_at: Some(pinned_at),
                missing: !session_exists_on_disk(&session_id, &cwd),
            },
        );
    }
    file.pins = file.pins.into_iter().map(enrich).collect();
    save_file(&file)?;
    Ok(file.pins)
}

pub fn unpin_session(session_id: String, cwd: Option<String>) -> Result<Vec<SessionPin>, String> {
    let mut file = load_file()?;
    file.pins.retain(|p| {
        if p.session_id != session_id {
            return true;
        }
        // If cwd provided, match both; else unpin all matches for that id
        match &cwd {
            Some(c) if !c.is_empty() => p.cwd != *c,
            _ => false,
        }
    });
    save_file(&file)?;
    Ok(file.pins.into_iter().map(enrich).collect())
}

/// Reorder pins by a full list of sessionIds (stable for unknown ids).
pub fn reorder_pins(session_ids: Vec<String>) -> Result<Vec<SessionPin>, String> {
    let mut file = load_file()?;
    let mut next = Vec::new();
    for id in &session_ids {
        if let Some(pos) = file.pins.iter().position(|p| &p.session_id == id) {
            next.push(file.pins.remove(pos));
        }
    }
    // Append any not mentioned
    next.append(&mut file.pins);
    file.pins = next.into_iter().map(enrich).collect();
    save_file(&file)?;
    Ok(file.pins)
}

fn chrono_lite_now() -> String {
    // RFC3339-ish without extra deps: use system time
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Store as unix seconds string is fine; frontend can display loosely.
    // Prefer ISO if we can format simply:
    format!("{secs}")
}
