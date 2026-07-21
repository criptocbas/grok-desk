//! Session groups (folders) for Grok Desk.
//!
//! Stored at `~/.config/grok-desk/session-groups.json`.
//! Desk-only organization; Grok session files are unchanged.
//!
//! Groups may be **pinned**: on Connect, Desk resumes every member session
//! (using stored cwd refs) so you need not pin each conversation.

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
    /// When true, all member sessions auto-resume on Connect.
    #[serde(default)]
    pub pinned: bool,
}

/// Last-known path/title for a session so group-pin resume works when the tab is closed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRef {
    pub cwd: String,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionGroupsState {
    #[serde(default)]
    pub groups: Vec<SessionGroup>,
    /// sessionId → groupId
    #[serde(default)]
    pub membership: HashMap<String, String>,
    /// sessionId → cwd/title for resume
    #[serde(default)]
    pub session_refs: HashMap<String, SessionRef>,
}

/// One session to resume for a pinned group (frontend convenience).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupResumeTarget {
    pub session_id: String,
    pub cwd: String,
    pub title: Option<String>,
    pub group_id: String,
    pub group_name: String,
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

/// Prune membership / refs pointing at deleted groups; drop empty refs.
fn sanitize(mut state: SessionGroupsState) -> SessionGroupsState {
    let ids: std::collections::HashSet<String> =
        state.groups.iter().map(|g| g.id.clone()).collect();
    state.membership.retain(|_, gid| ids.contains(gid));
    // Keep session_refs for members (and a bit of history); drop orphans not in membership
    let member_ids: std::collections::HashSet<String> =
        state.membership.keys().cloned().collect();
    state.session_refs.retain(|sid, _| member_ids.contains(sid));
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
        pinned: false,
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
    // session_refs cleaned in sanitize
    state = sanitize(state);
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

pub fn set_group_pinned(group_id: String, pinned: bool) -> Result<SessionGroupsState, String> {
    let mut state = load_file()?;
    let Some(g) = state.groups.iter_mut().find(|g| g.id == group_id) else {
        return Err("Group not found".into());
    };
    g.pinned = pinned;
    save_file(&state)?;
    Ok(state)
}

/// Assign session to a group, or pass empty group_id to ungroup.
/// Optional cwd/title keep group-pin resume working after tabs close.
pub fn set_session_group(
    session_id: String,
    group_id: Option<String>,
    cwd: Option<String>,
    title: Option<String>,
) -> Result<SessionGroupsState, String> {
    if session_id.trim().is_empty() {
        return Err("sessionId required".into());
    }
    let mut state = load_file()?;
    match group_id {
        None => {
            state.membership.remove(&session_id);
            // keep session_refs if useful; drop on ungroup to avoid bloat
            state.session_refs.remove(&session_id);
        }
        Some(gid) if gid.trim().is_empty() || gid == "ungrouped" => {
            state.membership.remove(&session_id);
            state.session_refs.remove(&session_id);
        }
        Some(gid) => {
            if !state.groups.iter().any(|g| g.id == gid) {
                return Err("Group not found".into());
            }
            state.membership.insert(session_id.clone(), gid);
            if let Some(c) = cwd.filter(|c| !c.trim().is_empty()) {
                let prev = state.session_refs.get(&session_id).cloned();
                state.session_refs.insert(
                    session_id,
                    SessionRef {
                        cwd: c,
                        title: title
                            .filter(|t| !t.trim().is_empty())
                            .or(prev.and_then(|p| p.title)),
                    },
                );
            }
        }
    }
    save_file(&state)?;
    Ok(state)
}

/// Touch cwd/title for a session already in a group (e.g. after rename / open).
pub fn touch_session_ref(
    session_id: String,
    cwd: String,
    title: Option<String>,
) -> Result<SessionGroupsState, String> {
    if session_id.trim().is_empty() || cwd.trim().is_empty() {
        return Err("sessionId and cwd required".into());
    }
    let mut state = load_file()?;
    if !state.membership.contains_key(&session_id) {
        return Ok(state);
    }
    let prev_title = state
        .session_refs
        .get(&session_id)
        .and_then(|r| r.title.clone());
    state.session_refs.insert(
        session_id,
        SessionRef {
            cwd,
            title: title.filter(|t| !t.trim().is_empty()).or(prev_title),
        },
    );
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

/// Sessions that should auto-resume because their group is pinned.
pub fn list_pinned_group_resume_targets() -> Result<Vec<GroupResumeTarget>, String> {
    let state = load_file()?;
    let pinned: HashMap<String, String> = state
        .groups
        .iter()
        .filter(|g| g.pinned)
        .map(|g| (g.id.clone(), g.name.clone()))
        .collect();
    if pinned.is_empty() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for (session_id, group_id) in &state.membership {
        let Some(group_name) = pinned.get(group_id) else {
            continue;
        };
        let Some(r) = state.session_refs.get(session_id) else {
            continue;
        };
        if r.cwd.trim().is_empty() {
            continue;
        }
        // Prefer custom Desk title if any
        let title = crate::session_titles::get_session_title(session_id)
            .ok()
            .flatten()
            .or_else(|| r.title.clone());
        out.push(GroupResumeTarget {
            session_id: session_id.clone(),
            cwd: r.cwd.clone(),
            title,
            group_id: group_id.clone(),
            group_name: group_name.clone(),
        });
    }
    Ok(out)
}
