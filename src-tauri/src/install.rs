//! Local install metadata + GitHub update check + self-update via install script.

use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;

use serde::{Deserialize, Serialize};
use serde_json::Value;

const BUILD_COMMIT: &str = env!("GROK_DESK_GIT_COMMIT");
const BUILD_COMMIT_SHORT: &str = env!("GROK_DESK_GIT_COMMIT_SHORT");
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstallMeta {
    pub version: Option<String>,
    pub commit: Option<String>,
    pub commit_short: Option<String>,
    pub branch: Option<String>,
    pub repo_path: Option<String>,
    pub installed_at: Option<String>,
    pub binary_path: Option<String>,
    pub github_repo: Option<String>,
    pub github_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionInfo {
    pub version: String,
    pub commit: String,
    pub commit_short: String,
    /// True when running an install from install-local.sh (meta file present).
    pub is_installed: bool,
    pub install_meta: Option<InstallMeta>,
    pub repo_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub update_available: bool,
    pub current_commit: String,
    pub current_commit_short: String,
    pub remote_commit: Option<String>,
    pub remote_commit_short: Option<String>,
    pub remote_message: Option<String>,
    pub github_repo: String,
    pub github_branch: String,
    pub error: Option<String>,
    pub can_auto_update: bool,
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn meta_path() -> Option<PathBuf> {
    home().map(|h| h.join(".local/share/grok-desk/install-meta.json"))
}

pub fn load_install_meta() -> Option<InstallMeta> {
    let path = meta_path()?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Prefer install-meta repoPath; else walk up from cwd looking for .git + package.json.
fn resolve_repo_path(meta: &Option<InstallMeta>) -> Option<PathBuf> {
    if let Some(p) = meta.as_ref().and_then(|m| m.repo_path.as_ref()) {
        let pb = PathBuf::from(p);
        if pb.join("scripts/install-local.sh").is_file() {
            return Some(pb);
        }
    }
    // Dev fallback: current dir or parents
    let mut dir = std::env::current_dir().ok()?;
    for _ in 0..8 {
        if dir.join("scripts/install-local.sh").is_file()
            && dir.join("package.json").is_file()
            && dir.join("src-tauri").is_dir()
        {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

pub fn app_version_info() -> AppVersionInfo {
    let meta = load_install_meta();
    let is_installed = meta.is_some();
    // Prefer meta commit if present (matches installed binary intent), else build-time
    let commit = meta
        .as_ref()
        .and_then(|m| m.commit.clone())
        .filter(|c| !c.is_empty() && c != "unknown")
        .unwrap_or_else(|| BUILD_COMMIT.to_string());
    let commit_short = meta
        .as_ref()
        .and_then(|m| m.commit_short.clone())
        .unwrap_or_else(|| BUILD_COMMIT_SHORT.to_string());
    let version = meta
        .as_ref()
        .and_then(|m| m.version.clone())
        .unwrap_or_else(|| APP_VERSION.to_string());
    let repo_path = resolve_repo_path(&meta).map(|p| p.display().to_string());

    AppVersionInfo {
        version,
        commit,
        commit_short,
        is_installed,
        install_meta: meta,
        repo_path,
    }
}

fn github_repo(meta: &Option<InstallMeta>) -> String {
    meta.as_ref()
        .and_then(|m| m.github_repo.clone())
        .unwrap_or_else(|| "criptocbas/grok-desk".into())
}

fn github_branch(meta: &Option<InstallMeta>) -> String {
    meta.as_ref()
        .and_then(|m| m.github_branch.clone())
        .unwrap_or_else(|| "main".into())
}

/// Compare running/installed commit to GitHub branch HEAD.
pub fn check_for_updates() -> UpdateCheckResult {
    let info = app_version_info();
    let meta = &info.install_meta;
    let repo = github_repo(meta);
    let branch = github_branch(meta);
    let current = info.commit.clone();
    let can_auto = resolve_repo_path(meta).is_some();

    let url = format!("https://api.github.com/repos/{repo}/commits/{branch}");
    match http_get_json(&url) {
        Ok(v) => {
            let remote = v
                .get("sha")
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_string();
            let msg = v
                .pointer("/commit/message")
                .and_then(|s| s.as_str())
                .map(|s| s.lines().next().unwrap_or(s).to_string());
            let short = if remote.len() >= 7 {
                remote[..7].to_string()
            } else {
                remote.clone()
            };
            let available = !remote.is_empty()
                && current != "unknown"
                && !remote.eq_ignore_ascii_case(&current);
            UpdateCheckResult {
                update_available: available,
                current_commit: current,
                current_commit_short: info.commit_short,
                remote_commit: if remote.is_empty() {
                    None
                } else {
                    Some(remote)
                },
                remote_commit_short: if short.is_empty() { None } else { Some(short) },
                remote_message: msg,
                github_repo: repo,
                github_branch: branch,
                error: None,
                can_auto_update: can_auto,
            }
        }
        Err(e) => UpdateCheckResult {
            update_available: false,
            current_commit: current,
            current_commit_short: info.commit_short,
            remote_commit: None,
            remote_commit_short: None,
            remote_message: None,
            github_repo: repo,
            github_branch: branch,
            error: Some(e),
            can_auto_update: can_auto,
        },
    }
}

fn http_get_json(url: &str) -> Result<Value, String> {
    // Prefer curl (always on Omarchy); no extra Rust TLS deps.
    let mut cmd = Command::new("curl");
    cmd.args([
        "-fsSL",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "User-Agent: grok-desk-updater",
        "--max-time",
        "15",
        url,
    ]);
    // Optional token for higher rate limits
    if let Ok(token) = std::env::var("GITHUB_TOKEN") {
        if !token.is_empty() {
            cmd.arg("-H").arg(format!("Authorization: Bearer {token}"));
        }
    }
    let out = cmd.output().map_err(|e| format!("curl failed: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "GitHub API error ({}): {}",
            out.status,
            err.trim()
        ));
    }
    let body = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str(&body).map_err(|e| format!("JSON parse: {e}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStartResult {
    pub started: bool,
    pub message: String,
    pub log_path: Option<String>,
}

/// Spawn install-local.sh --update in the background; write log under ~/.local/share/grok-desk/
pub fn start_self_update() -> Result<UpdateStartResult, String> {
    let meta = load_install_meta();
    let repo = resolve_repo_path(&meta).ok_or_else(|| {
        String::from(
            "Cannot find repo (scripts/install-local.sh). Set repoPath in install-meta.json or run from the git checkout.",
        )
    })?;
    let script = repo.join("scripts/install-local.sh");
    if !script.is_file() {
        return Err(format!("install script missing: {}", script.display()));
    }

    let log_dir = home()
        .map(|h| h.join(".local/share/grok-desk"))
        .ok_or_else(|| "HOME not set".to_string())?;
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_path = log_dir.join("update.log");

    // Truncate log
    fs::write(
        &log_path,
        format!(
            "=== Grok Desk update started {} ===\n",
            chrono_now()
        ),
    )
    .map_err(|e| e.to_string())?;

    let script_owned = script.clone();
    let log_owned = log_path.clone();
    let repo_owned = repo.clone();

    thread::spawn(move || {
        let log_file = match fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_owned)
        {
            Ok(f) => f,
            Err(e) => {
                eprintln!("update log open failed: {e}");
                return;
            }
        };
        let log_err = match log_file.try_clone() {
            Ok(f) => f,
            Err(_) => return,
        };
        let status = Command::new("bash")
            .arg(&script_owned)
            .arg("--update")
            .current_dir(&repo_owned)
            .stdout(Stdio::from(log_file))
            .stderr(Stdio::from(log_err))
            .status();
        let footer = match status {
            Ok(s) if s.success() => {
                "\n=== Update finished OK — restart Grok Desk to use the new build ===\n"
                    .to_string()
            }
            Ok(s) => format!("\n=== Update failed (exit {s}) ===\n"),
            Err(e) => format!("\n=== Update spawn error: {e} ===\n"),
        };
        let _ = fs::OpenOptions::new()
            .append(true)
            .open(&log_owned)
            .and_then(|mut f| {
                use std::io::Write;
                f.write_all(footer.as_bytes())
            });
    });

    Ok(UpdateStartResult {
        started: true,
        message: "Update started in the background (git pull + rebuild + reinstall). This can take several minutes. Restart the app when the log says OK.".into(),
        log_path: Some(log_path.display().to_string()),
    })
}

pub fn read_update_log(max_bytes: usize) -> Result<String, String> {
    let path = home()
        .map(|h| h.join(".local/share/grok-desk/update.log"))
        .ok_or_else(|| "HOME not set".to_string())?;
    if !path.is_file() {
        return Ok(String::new());
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    if data.len() <= max_bytes {
        return String::from_utf8(data).map_err(|e| e.to_string());
    }
    let slice = &data[data.len() - max_bytes..];
    Ok(format!(
        "…\n{}",
        String::from_utf8_lossy(slice)
    ))
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}
