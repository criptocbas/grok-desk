use std::process::Command;

fn main() {
    // Embed git commit for update checks (override with GROK_DESK_GIT_COMMIT).
    let commit = std::env::var("GROK_DESK_GIT_COMMIT").unwrap_or_else(|_| {
        Command::new("git")
            .args(["rev-parse", "HEAD"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "unknown".into())
    });
    let short = std::env::var("GROK_DESK_GIT_COMMIT_SHORT").unwrap_or_else(|_| {
        if commit.len() >= 7 && commit != "unknown" {
            commit[..7].to_string()
        } else {
            commit.clone()
        }
    });
    println!("cargo:rustc-env=GROK_DESK_GIT_COMMIT={commit}");
    println!("cargo:rustc-env=GROK_DESK_GIT_COMMIT_SHORT={short}");
    println!("cargo:rerun-if-env-changed=GROK_DESK_GIT_COMMIT");
    println!("cargo:rerun-if-changed=../.git/HEAD");

    tauri_build::build()
}
