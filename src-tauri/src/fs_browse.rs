//! Project file-tree helpers for the explorer pane.
//! Read-only directory listing — open-in-editor uses the opener plugin on the frontend.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Names skipped when listing (noise + huge trees). Always case-sensitive.
const SKIP_NAMES: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    ".git",
    ".hg",
    ".svn",
    "__pycache__",
    ".next",
    ".turbo",
    ".cache",
    "build",
    ".venv",
    "venv",
    ".grok",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirResult {
    pub path: String,
    pub entries: Vec<FsEntry>,
    pub error: Option<String>,
}

fn is_skipped(name: &str) -> bool {
    SKIP_NAMES.iter().any(|s| *s == name)
}

/// Ensure `path` is under `root` (after canonicalize). Blocks path traversal.
fn resolve_under_root(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let root_can = fs::canonicalize(root).map_err(|e| format!("root: {e}"))?;
    let candidate = if path.is_absolute() {
        path.to_path_buf()
    } else {
        root_can.join(path)
    };
    let can = fs::canonicalize(&candidate).map_err(|e| format!("path: {e}"))?;
    if !can.starts_with(&root_can) {
        return Err("Path is outside project root".into());
    }
    Ok(can)
}

/// List one directory under `root`. `path` may be absolute under root or relative to root.
/// Dotfiles are omitted unless `show_hidden` is true.
pub fn list_dir(root: &str, path: Option<&str>, show_hidden: bool) -> ListDirResult {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return ListDirResult {
            path: root.to_string(),
            entries: vec![],
            error: Some(format!("Not a directory: {root}")),
        };
    }

    let target = match path {
        Some(p) if !p.is_empty() => match resolve_under_root(root_path, Path::new(p)) {
            Ok(p) => p,
            Err(e) => {
                return ListDirResult {
                    path: p.to_string(),
                    entries: vec![],
                    error: Some(e),
                };
            }
        },
        _ => match fs::canonicalize(root_path) {
            Ok(p) => p,
            Err(e) => {
                return ListDirResult {
                    path: root.to_string(),
                    entries: vec![],
                    error: Some(format!("root: {e}")),
                };
            }
        },
    };

    if !target.is_dir() {
        return ListDirResult {
            path: target.display().to_string(),
            entries: vec![],
            error: Some("Not a directory".into()),
        };
    }

    let read = match fs::read_dir(&target) {
        Ok(r) => r,
        Err(e) => {
            return ListDirResult {
                path: target.display().to_string(),
                entries: vec![],
                error: Some(format!("read_dir: {e}")),
            };
        }
    };

    let mut entries: Vec<FsEntry> = Vec::new();
    for ent in read.flatten() {
        let name = ent.file_name().to_string_lossy().to_string();
        if name == "." || name == ".." {
            continue;
        }
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        if is_skipped(&name) {
            continue;
        }
        let meta = match ent.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let full = ent.path();
        entries.push(FsEntry {
            name,
            path: full.display().to_string(),
            is_dir: meta.is_dir(),
        });
    }

    // Directories first, then files; name-sorted.
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    ListDirResult {
        path: target.display().to_string(),
        entries,
        error: None,
    }
}
