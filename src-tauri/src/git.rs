//! Read-only git helpers for the Diff pane (local process, not ACP terminal).

use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub is_repo: bool,
    pub files: Vec<GitFileStatus>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub path: Option<String>,
    pub patch: String,
    pub is_repo: bool,
    pub error: Option<String>,
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("failed to spawn git: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            format!("git {:?} failed", args)
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn is_git_repo(cwd: &Path) -> bool {
    run_git(cwd, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s.trim() == "true")
        .unwrap_or(false)
}

/// Porcelain status: tracked changes + untracked.
pub fn git_status(cwd: &str) -> GitStatusResult {
    let path = Path::new(cwd);
    if !path.is_dir() {
        return GitStatusResult {
            is_repo: false,
            files: vec![],
            error: Some(format!("Not a directory: {cwd}")),
        };
    }
    if !is_git_repo(path) {
        return GitStatusResult {
            is_repo: false,
            files: vec![],
            error: None,
        };
    }

    match run_git(path, &["status", "--porcelain", "-u"]) {
        Ok(out) => {
            let mut files = Vec::new();
            for line in out.lines() {
                if line.len() < 4 {
                    continue;
                }
                // XY PATH or XY ORIG -> PATH for renames
                let status = line[..2].trim().to_string();
                let rest = line[3..].trim();
                let file_path = if let Some((_, to)) = rest.split_once(" -> ") {
                    to.to_string()
                } else {
                    rest.trim_matches('"').to_string()
                };
                if file_path.is_empty() {
                    continue;
                }
                files.push(GitFileStatus {
                    path: file_path,
                    status: if status.is_empty() {
                        "??".into()
                    } else {
                        status
                    },
                });
            }
            GitStatusResult {
                is_repo: true,
                files,
                error: None,
            }
        }
        Err(e) => GitStatusResult {
            is_repo: true,
            files: vec![],
            error: Some(e),
        },
    }
}

/// Unified diff for one path, or full working tree if path is None/empty.
/// Includes unstaged + staged via `git diff HEAD -- path` when path set;
/// for untracked files, synthesizes a simple "new file" view via `git diff --no-index`.
pub fn git_diff(cwd: &str, path: Option<String>) -> GitDiffResult {
    let root = Path::new(cwd);
    if !root.is_dir() {
        return GitDiffResult {
            path,
            patch: String::new(),
            is_repo: false,
            error: Some(format!("Not a directory: {cwd}")),
        };
    }
    if !is_git_repo(root) {
        return GitDiffResult {
            path,
            patch: String::new(),
            is_repo: false,
            error: None,
        };
    }

    let path_ref = path.as_deref().filter(|p| !p.is_empty());

    // Prefer diff against HEAD so staged+unstaged both show for tracked files.
    let result = if let Some(p) = path_ref {
        match run_git(root, &["diff", "HEAD", "--", p]) {
            Ok(patch) if !patch.trim().is_empty() => Ok(patch),
            Ok(_) | Err(_) => {
                // Untracked or empty vs HEAD: try unstaged only, then /dev/null style
                match run_git(root, &["diff", "--", p]) {
                    Ok(patch) if !patch.trim().is_empty() => Ok(patch),
                    _ => {
                        // Untracked file: show as all-added via no-index
                        let full = root.join(p);
                        if full.is_file() {
                            let output = Command::new("git")
                                .args(["diff", "--no-index", "--", "/dev/null", p])
                                .current_dir(root)
                                .output();
                            match output {
                                Ok(o) => {
                                    // git diff --no-index exits 1 when files differ
                                    let patch = String::from_utf8_lossy(&o.stdout).to_string();
                                    if patch.trim().is_empty() {
                                        Err("No diff for this path".into())
                                    } else {
                                        Ok(patch)
                                    }
                                }
                                Err(e) => Err(e.to_string()),
                            }
                        } else {
                            Ok(String::new())
                        }
                    }
                }
            }
        }
    } else {
        // Full tree: staged + unstaged vs HEAD, plus note untracked via status
        run_git(root, &["diff", "HEAD"])
    };

    match result {
        Ok(patch) => GitDiffResult {
            path,
            patch,
            is_repo: true,
            error: None,
        },
        Err(e) => GitDiffResult {
            path,
            patch: String::new(),
            is_repo: true,
            error: Some(e),
        },
    }
}
