//! Session groups (folders) for Grok Desk.
//!
//! Stored at `~/.config/grok-desk/session-groups.json`.
//! Desk-only organization; Grok session files are unchanged.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const MAX_GROUPS: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionGroup {
    pub id: String,
    pub name: String,
    /// UI collapsed state (persisted).
    #[serde(default)]
    pub collapsed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionGroupsState {
    #[serde(default)]
    pub groups: Vec<SessionGroup>,
    /// sessionId → groupId
    #[serde(default)]
    pub membership: HashMap<String, String>,
}

fn config_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(PathBuf::from(home).join(".config").join("grok-desk"))
}

fn groups_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("session-groups.json"))
}

fn load_file() -> Result<SessionGroupsState, String> {
    let path = groups_path()?;
    if !path.is_file() {
        return Ok(SessionGroupsState::default());
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(SessionGroupsState::default());
    }
    serde_json::from_str(&text).map_err(|e| format!("session-groups.json: {e}"))
}

fn save_file(state: &SessionGroupsState) -> Result<(), String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = groups_path()?;
    let tmp = dir.join("session-groups.json.tmp");
    let text = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("grp-{t:x}")
}

/// Prune membership pointing at deleted groups.
fn sanitize(mut state: SessionGroupsState) -> SessionGroupsState {
    let ids: std::collections::HashSet<String> =
        state.groups.iter().map(|g| g.id.clone()).collect();
    state.membership.retain(|_, gid| ids.contains(gid));
    state
}

pub fn list_session_groups() -> Result<SessionGroupsState, String> {
    let state = sanitize(load_file()?);
    let _ = save_file(&state);
    Ok(state)
}

pub fn create_session_group(name: String) -> Result<SessionGroupsState, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Group name required".into());
    }
    if name.chars().count() > 48 {
        return Err("Group name too long (max 48)".into());
    }
    let mut state = load_file()?;
    if state.groups.len() >= MAX_GROUPS {
        return Err(format!("Group limit reached ({MAX_GROUPS})"));
    }
    if state
        .groups
        .iter()
        .any(|g| g.name.eq_ignore_ascii_case(&name))
    {
        return Err("A group with that name already exists".into());
    }
    state.groups.push(SessionGroup {
        id: new_id(),
        name,
        collapsed: false,
    });
    save_file(&state)?;
    Ok(state)
}

pub fn rename_session_group(group_id: String, name: String) -> Result<SessionGroupsState, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Group name required".into());
    }
    let mut state = load_file()?;
    if !state.groups.iter().any(|g| g.id == group_id) {
        return Err("Group not found".into());
    }
    if state
        .groups
        .iter()
        .any(|x| x.id != group_id && x.name.eq_ignore_ascii_case(&name))
    {
        return Err("A group with that name already exists".into());
    }
    let capped = if name.chars().count() > 48 {
        name.chars().take(48).collect()
    } else {
        name
    };
    if let Some(g) = state.groups.iter_mut().find(|g| g.id == group_id) {
        g.name = capped;
    }
    save_file(&state)?;
    Ok(state)
}

pub fn delete_session_group(group_id: String) -> Result<SessionGroupsState, String> {
    let mut state = load_file()?;
    state.groups.retain(|g| g.id != group_id);
    state.membership.retain(|_, gid| gid != &group_id);
    save_file(&state)?;
    Ok(state)
}

pub fn set_group_collapsed(
    group_id: String,
    collapsed: bool,
) -> Result<SessionGroupsState, String> {
    let mut state = load_file()?;
    let Some(g) = state.groups.iter_mut().find(|g| g.id == group_id) else {
        return Err("Group not found".into());
    };
    g.collapsed = collapsed;
    save_file(&state)?;
    Ok(state)
}

/// Assign session to a group, or pass empty group_id to ungroup.
pub fn set_session_group(
    session_id: String,
    group_id: Option<String>,
) -> Result<SessionGroupsState, String> {
    if session_id.trim().is_empty() {
        return Err("sessionId required".into());
    }
    let mut state = load_file()?;
    match group_id {
        None => {
            state.membership.remove(&session_id);
        }
        Some(gid) if gid.trim().is_empty() || gid == "ungrouped" => {
            state.membership.remove(&session_id);
        }
        Some(gid) => {
            if !state.groups.iter().any(|g| g.id == gid) {
                return Err("Group not found".into());
            }
            state.membership.insert(session_id, gid);
        }
    }
    save_file(&state)?;
    Ok(state)
}

pub fn reorder_session_groups(group_ids: Vec<String>) -> Result<SessionGroupsState, String> {
    let mut state = load_file()?;
    let mut next = Vec::new();
    for id in &group_ids {
        if let Some(pos) = state.groups.iter().position(|g| &g.id == id) {
            next.push(state.groups.remove(pos));
        }
    }
    next.append(&mut state.groups);
    state.groups = next;
    save_file(&state)?;
    Ok(state)
}
