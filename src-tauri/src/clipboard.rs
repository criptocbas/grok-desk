//! System clipboard image read (Linux/Wayland/X11).
//!
//! WebKitGTK often does not expose screenshot pixels via `clipboardData` on
//! paste under Wayland. Fall back to `wl-paste` / `xclip`.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImage {
    pub mime_type: String,
    /// Raw base64 (no data: URL prefix)
    pub data: String,
    pub name: String,
}

/// Read an image from the system clipboard, if one is present.
pub fn read_image() -> Result<Option<ClipboardImage>, String> {
    if let Some(img) = try_wl_paste()? {
        return Ok(Some(img));
    }
    if let Some(img) = try_xclip()? {
        return Ok(Some(img));
    }
    Ok(None)
}

fn try_wl_paste() -> Result<Option<ClipboardImage>, String> {
    if which::which("wl-paste").is_err() {
        return Ok(None);
    }

    // Prefer listing types so we pick a real image MIME.
    let list = Command::new("wl-paste")
        .args(["-l"])
        .output()
        .map_err(|e| format!("wl-paste -l: {e}"))?;
    if !list.status.success() {
        return Ok(None);
    }
    let types = String::from_utf8_lossy(&list.stdout);
    let mime = pick_image_mime(types.lines().map(|s| s.trim()).filter(|s| !s.is_empty()));
    let Some(mime) = mime else {
        return Ok(None);
    };

    let out = Command::new("wl-paste")
        .args(["-t", &mime])
        .output()
        .map_err(|e| format!("wl-paste -t {mime}: {e}"))?;
    if !out.status.success() || out.stdout.is_empty() {
        return Ok(None);
    }
    // Reject tiny / non-image payloads
    if out.stdout.len() < 32 {
        return Ok(None);
    }

    Ok(Some(ClipboardImage {
        mime_type: mime.clone(),
        data: B64.encode(&out.stdout),
        name: default_name(&mime),
    }))
}

fn try_xclip() -> Result<Option<ClipboardImage>, String> {
    if which::which("xclip").is_err() {
        return Ok(None);
    }

    let targets = Command::new("xclip")
        .args(["-selection", "clipboard", "-t", "TARGETS", "-o"])
        .output()
        .map_err(|e| format!("xclip TARGETS: {e}"))?;
    if !targets.status.success() {
        return Ok(None);
    }
    let types = String::from_utf8_lossy(&targets.stdout);
    let mime = pick_image_mime(types.lines().map(|s| s.trim()).filter(|s| !s.is_empty()));
    let Some(mime) = mime else {
        return Ok(None);
    };

    let out = Command::new("xclip")
        .args(["-selection", "clipboard", "-t", &mime, "-o"])
        .output()
        .map_err(|e| format!("xclip -t {mime}: {e}"))?;
    if !out.status.success() || out.stdout.len() < 32 {
        return Ok(None);
    }

    Ok(Some(ClipboardImage {
        mime_type: mime.clone(),
        data: B64.encode(&out.stdout),
        name: default_name(&mime),
    }))
}

fn pick_image_mime<'a>(types: impl Iterator<Item = &'a str>) -> Option<String> {
    let preferred = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/gif",
        "image/bmp",
    ];
    let collected: Vec<&str> = types.collect();
    for p in preferred {
        if collected.iter().any(|t| t.eq_ignore_ascii_case(p)) {
            return Some(p.to_string());
        }
    }
    // Any image/*
    collected
        .into_iter()
        .find(|t| t.to_ascii_lowercase().starts_with("image/"))
        .map(|s| s.to_string())
}

fn default_name(mime: &str) -> String {
    let ext = match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        _ => "png",
    };
    format!("paste-{}.{}", chrono_ms(), ext)
}

fn chrono_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
