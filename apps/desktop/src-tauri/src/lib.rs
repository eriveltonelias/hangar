use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatus {
    clean: bool,
    changes: Vec<String>,
    last_commit_message: Option<String>,
}

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct MobileProvisionInfo {
    file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    uuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    team_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    app_id_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    creation_date: Option<String>,
    /// Filled by the TS layer; "unknown" until then.
    expiration_status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialsJsonInfo {
    file_path: String,
    raw: serde_json::Value,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct CredentialsScanRaw {
    scanned_at: String,
    has_credentials_json: bool,
    credentials_json: Option<CredentialsJsonInfo>,
    provisioning_profiles: Vec<MobileProvisionInfo>,
    keystores: Vec<String>,
    ios_certificates: Vec<String>,
}

#[tauri::command]
fn validate_project_folder(path: String) -> Result<(), String> {
    validate_project_path(&path)?;
    let pkg = Path::new(&path).join("package.json");
    if !pkg.exists() {
        return Err("Selected folder is not a Node.js project (no package.json found).".to_string());
    }
    Ok(())
}

#[tauri::command]
fn is_directory(path: String) -> Result<bool, String> {
    validate_path(&path)?;
    Ok(Path::new(&path).is_dir())
}

#[tauri::command]
fn file_exists(path: String) -> Result<bool, String> {
    validate_path(&path)?;
    Ok(Path::new(&path).exists())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    validate_path(&path)?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err("File too large (max 5MB)".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_dir(path: String) -> Result<Vec<String>, String> {
    validate_path(&path)?;
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() {
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            names.push(name.to_string());
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
fn check_eas_cli(custom_path: Option<String>) -> Result<bool, String> {
    let eas = custom_path.unwrap_or_else(|| "eas".to_string());
    let mut cmd = Command::new(&eas);
    configure_shell_command(&mut cmd, None);
    match cmd.arg("--version").output() {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn check_eas_login(custom_path: Option<String>) -> Result<String, String> {
    let eas = custom_path.unwrap_or_else(|| "eas".to_string());
    if !is_allowed_command(&eas) {
        return Err(format!("Command not allowed: {eas}"));
    }

    let home = std::env::var("HOME").map_err(|_| "Could not determine home directory".to_string())?;

    let mut cmd = Command::new(&eas);
    configure_shell_command(&mut cmd, None);
    let output = cmd
        .args(["whoami", "--non-interactive"])
        .current_dir(&home)
        .output()
        .map_err(|e| format!("Failed to run {eas}: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("{stderr}\n{stdout}"))
    }
}

fn is_allowed_command(command: &str) -> bool {
    let allowed = ["eas", "npx", "expo"];
    if allowed.contains(&command) {
        return true;
    }
    Path::new(command)
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "eas" || name == "eas-cli")
}

fn extract_json_slice(output: &str) -> Option<String> {
    let cleaned = clean_eas_error("", output);
    let start = cleaned.find(['[', '{'])?;
    let slice = &cleaned[start..];
    let bytes = slice.as_bytes();
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;

    for (i, &byte) in bytes.iter().enumerate() {
        let ch = byte as char;
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if ch == '\\' {
                escape = true;
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            continue;
        }
        if ch == '{' || ch == '[' {
            depth += 1;
        }
        if ch == '}' || ch == ']' {
            depth -= 1;
            if depth == 0 {
                return Some(slice[..=i].to_string());
            }
        }
    }

    None
}

fn eas_command_output(stdout: &str, stderr: &str) -> Result<String, String> {
    if let Some(json) = extract_json_slice(stdout) {
        return Ok(json);
    }

    if stdout.trim().is_empty() {
        if let Some(json) = extract_json_slice(stderr) {
            return Ok(json);
        }
    }

    if !stdout.trim().is_empty() {
        return Ok(stdout.to_string());
    }

    Err(clean_eas_error(stderr, stdout))
}

fn shell_tool_path(project_path: Option<&str>) -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
    let mut parts: Vec<String> = Vec::new();

    if let Some(project) = project_path {
        parts.push(format!("{project}/node_modules/.bin"));
    }

    parts.extend([
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{home}/.local/bin"),
        format!("{home}/.npm-global/bin"),
        format!("{home}/.volta/bin"),
        format!("{home}/.asdf/shims"),
        format!("{home}/.local/share/fnm/current/bin"),
    ]);

    if let Some(nvm_bin) = nvm_default_bin(&home) {
        parts.push(nvm_bin);
    }

    if let Ok(entries) = fs::read_dir(format!("{home}/.nvm/versions/node")) {
        let mut version_bins: Vec<String> = entries
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .map(|entry| entry.path().join("bin").to_string_lossy().to_string())
            .collect();
        version_bins.sort_by(|a, b| b.cmp(a));
        parts.extend(version_bins);
    }

    if !current.is_empty() {
        parts.push(current);
    }

    parts.join(":")
}

fn nvm_node_bin(home: &str, version: &str) -> Option<String> {
    let trimmed = version.trim().trim_start_matches('v');
    for candidate in [
        format!("{home}/.nvm/versions/node/v{trimmed}/bin"),
        format!("{home}/.nvm/versions/node/{trimmed}/bin"),
        format!("{home}/.nvm/versions/node/{}/bin", version.trim()),
    ] {
        if Path::new(&candidate).is_dir() {
            return Some(candidate);
        }
    }
    None
}

fn nvm_default_bin(home: &str) -> Option<String> {
    let alias_path = format!("{home}/.nvm/alias/default");
    let version = fs::read_to_string(alias_path).ok()?.trim().to_string();
    if version.is_empty() {
        return None;
    }
    nvm_node_bin(home, &version)
}

fn configure_shell_command(cmd: &mut Command, project_path: Option<&str>) {
    cmd.env("PATH", shell_tool_path(project_path));
}

fn configure_eas_command(cmd: &mut Command, project_path: &str) {
    configure_shell_command(cmd, Some(project_path));
}

fn clean_eas_error(stderr: &str, stdout: &str) -> String {
    let combined = format!("{stderr}\n{stdout}");
    combined
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.starts_with('★')
                && !line.contains("eas-cli@")
                && !line.contains("Proceeding with outdated")
                && *line != "To upgrade, run:"
                && *line != "npm install -g eas-cli"
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[tauri::command]
fn check_git_status(project_path: String) -> Result<GitStatus, String> {
    validate_project_path(&project_path)?;

    let mut rev_cmd = Command::new("git");
    configure_shell_command(&mut rev_cmd, Some(&project_path));
    let rev_parse = rev_cmd
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !rev_parse.status.success() {
        return Err("This project is not a git repository.".to_string());
    }

    let inside = String::from_utf8_lossy(&rev_parse.stdout).trim().to_string();
    if inside != "true" {
        return Err("This project is not a git repository.".to_string());
    }

    let mut status_cmd = Command::new("git");
    configure_shell_command(&mut status_cmd, Some(&project_path));
    let output = status_cmd
        .args(["status", "--porcelain"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let changes: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(str::to_string)
        .collect();

    let last_commit_message = if changes.is_empty() {
        let mut log_cmd = Command::new("git");
        configure_shell_command(&mut log_cmd, Some(&project_path));
        log_cmd
            .args(["log", "-1", "--format=%B"])
            .current_dir(&project_path)
            .output()
            .ok()
            .filter(|result| result.status.success())
            .map(|result| String::from_utf8_lossy(&result.stdout).trim().to_string())
            .filter(|message| !message.is_empty())
    } else {
        None
    };

    Ok(GitStatus {
        clean: changes.is_empty(),
        changes,
        last_commit_message,
    })
}

#[derive(Clone, Serialize)]
struct CommandLogEvent {
    job_id: String,
    line: String,
    stream: String,
}

fn pipe_command_output(
    app: &AppHandle,
    job_id: &str,
    reader: impl BufRead,
    stream: &str,
) -> String {
    let mut collected = String::new();
    for line in reader.lines().map_while(Result::ok) {
        let _ = app.emit(
            "eas-command-log",
            CommandLogEvent {
                job_id: job_id.to_string(),
                line: line.clone(),
                stream: stream.to_string(),
            },
        );
        collected.push_str(&line);
        collected.push('\n');
    }
    collected
}

fn run_streaming_command(
    app: AppHandle,
    project_path: String,
    command: String,
    args: Vec<String>,
    job_id: String,
) -> Result<String, String> {
    let mut cmd = Command::new(&command);
    configure_eas_command(&mut cmd, &project_path);
    let mut child = cmd
        .args(&args)
        .current_dir(&project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run {command}: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    let stdout_app = app.clone();
    let stdout_job = job_id.clone();
    let stdout_handle = thread::spawn(move || {
        pipe_command_output(&stdout_app, &stdout_job, BufReader::new(stdout), "stdout")
    });

    let stderr_app = app.clone();
    let stderr_job = job_id;
    let stderr_handle = thread::spawn(move || {
        pipe_command_output(&stderr_app, &stderr_job, BufReader::new(stderr), "stderr")
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    let stdout = stdout_handle.join().unwrap_or_default();
    let stderr = stderr_handle.join().unwrap_or_default();

    if status.success() {
        eas_command_output(&stdout, &stderr)
    } else if extract_json_slice(&stdout).is_some() || extract_json_slice(&stderr).is_some() {
        eas_command_output(&stdout, &stderr)
    } else {
        Err(clean_eas_error(&stderr, &stdout))
    }
}

#[tauri::command]
async fn run_command_streaming(
    app: AppHandle,
    project_path: String,
    command: String,
    args: Vec<String>,
    job_id: String,
) -> Result<String, String> {
    validate_project_path(&project_path)?;

    if !is_allowed_command(&command) {
        return Err(format!("Command not allowed: {command}"));
    }

    tauri::async_runtime::spawn_blocking(move || {
        run_streaming_command(app, project_path, command, args, job_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn run_command(project_path: String, command: String, args: Vec<String>) -> Result<String, String> {
    validate_project_path(&project_path)?;

    if !is_allowed_command(&command) {
        return Err(format!("Command not allowed: {command}"));
    }

    let mut cmd = Command::new(&command);
    configure_eas_command(&mut cmd, &project_path);
    let output = cmd
        .args(&args)
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run {command}: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        eas_command_output(&stdout, &stderr)
    } else if extract_json_slice(&stdout).is_some() || extract_json_slice(&stderr).is_some() {
        eas_command_output(&stdout, &stderr)
    } else {
        Err(clean_eas_error(&stderr, &stdout))
    }
}

#[tauri::command]
fn reveal_in_file_manager(path: String) -> Result<(), String> {
    validate_path(&path)?;
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {path}"));
    }

    let spawn_result = if cfg!(target_os = "macos") {
        // `open -R` reveals the item in Finder rather than opening it.
        let mut cmd = Command::new("open");
        configure_shell_command(&mut cmd, None);
        cmd.args(["-R", &path]).spawn()
    } else if cfg!(target_os = "windows") {
        // `explorer /select,<path>` opens Explorer with the file pre-selected.
        let mut cmd = Command::new("explorer");
        configure_shell_command(&mut cmd, None);
        cmd.arg(format!("/select,{path}")).spawn()
    } else {
        // Linux has no portable "reveal" — open the parent directory instead.
        let parent = p
            .parent()
            .map(|q| q.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string());
        let mut cmd = Command::new("xdg-open");
        configure_shell_command(&mut cmd, None);
        cmd.arg(parent).spawn()
    };

    spawn_result
        .map(|_| ())
        .map_err(|e| format!("Could not reveal in file manager: {e}"))
}

#[tauri::command]
fn open_in_editor(file_path: String, editor: String) -> Result<(), String> {
    validate_path(&file_path)?;

    let editors: Vec<(&str, Vec<String>)> = match editor.as_str() {
        "cursor" => vec![
            ("cursor", vec![file_path.clone()]),
            ("code", vec![file_path.clone()]),
        ],
        "vscode" => vec![("code", vec![file_path.clone()])],
        _ => return Ok(()),
    };

    for (cmd, args) in editors {
        let mut command = Command::new(cmd);
        configure_shell_command(&mut command, None);
        if command.args(&args).spawn().is_ok() {
            return Ok(());
        }
    }

    Err("Could not open editor".to_string())
}

/// Extract a single plist <string>/<date> value following a given key.
/// The plist payload embedded in a .mobileprovision is plain-text XML inside a
/// CMS-signed binary container, so a UTF-8 lossy read + substring search is
/// sufficient to pull metadata fields.
fn extract_plist_value(plist: &str, key: &str) -> Option<String> {
    let needle = format!("<key>{key}</key>");
    let idx = plist.find(&needle)?;
    let rest = &plist[idx + needle.len()..];
    // Find the next opening tag (skip whitespace).
    let open_lt = rest.find('<')?;
    let after_open = &rest[open_lt..];
    let open_gt = after_open.find('>')?;
    let content_start = open_lt + open_gt + 1;
    let close_lt = rest[content_start..].find('<')?;
    Some(rest[content_start..content_start + close_lt].to_string())
}

fn parse_mobileprovision(path: &Path) -> MobileProvisionInfo {
    let file_path = path.to_string_lossy().to_string();
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(_) => {
            return MobileProvisionInfo {
                file_path,
                expiration_status: "unknown".to_string(),
                ..Default::default()
            };
        }
    };
    let lossy = String::from_utf8_lossy(&bytes);
    let start = lossy.find("<?xml").or_else(|| lossy.find("<plist"));
    let end = lossy.rfind("</plist>");
    let plist: &str = match (start, end) {
        (Some(s), Some(e)) if e > s => &lossy[s..e + "</plist>".len()],
        _ => &lossy[..],
    };

    MobileProvisionInfo {
        file_path,
        name: extract_plist_value(plist, "Name"),
        uuid: extract_plist_value(plist, "UUID"),
        team_name: extract_plist_value(plist, "TeamName"),
        app_id_name: extract_plist_value(plist, "AppIDName"),
        expires_at: extract_plist_value(plist, "ExpirationDate"),
        creation_date: extract_plist_value(plist, "CreationDate"),
        expiration_status: "unknown".to_string(),
    }
}

fn is_skipped_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | ".git"
            | ".expo"
            | "dist"
            | "build"
            | ".next"
            | ".turbo"
            | "ios.xcworkspace"
            | "Pods"
            | ".gradle"
            | ".idea"
    )
}

fn walk_for_credentials(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    report: &mut CredentialsScanRaw,
) {
    if depth > max_depth {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };

        if path.is_dir() {
            if is_skipped_dir(name) {
                continue;
            }
            walk_for_credentials(&path, depth + 1, max_depth, report);
            continue;
        }

        let lower = name.to_lowercase();
        let path_str = path.to_string_lossy().to_string();

        if lower == "credentials.json" {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(raw) = serde_json::from_str::<serde_json::Value>(&content) {
                    report.has_credentials_json = true;
                    report.credentials_json = Some(CredentialsJsonInfo {
                        file_path: path_str.clone(),
                        raw,
                    });
                }
            }
        } else if lower.ends_with(".mobileprovision") {
            report.provisioning_profiles.push(parse_mobileprovision(&path));
        } else if lower.ends_with(".keystore") || lower.ends_with(".jks") {
            report.keystores.push(path_str);
        } else if lower.ends_with(".p12")
            || lower.ends_with(".cer")
            || lower.ends_with(".pem")
            || lower.ends_with(".der")
        {
            report.ios_certificates.push(path_str);
        }
    }
}

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct BundleFile {
    path: String,
    relative_path: String,
    bytes: u64,
    category: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct BundleSizeRaw {
    bundle_dir: String,
    total_bytes: u64,
    file_count: u64,
    files: Vec<BundleFile>,
}

fn classify_extension(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    let dot = lower.rfind('.');
    let ext = match dot {
        Some(i) if i + 1 < lower.len() => &lower[i + 1..],
        _ => return "other",
    };
    match ext {
        "js" | "mjs" | "cjs" | "jsbundle" | "hbc" | "map" => "javascript",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "ico" | "bmp" => "images",
        "ttf" | "otf" | "woff" | "woff2" | "eot" => "fonts",
        "mp3" | "mp4" | "wav" | "m4a" | "mov" | "webm" | "ogg" => "media",
        "json" => "data",
        _ => "other",
    }
}

fn walk_bundle(dir: &Path, root: &Path, report: &mut BundleSizeRaw) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_bundle(&path, root, report);
            continue;
        }
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let bytes = meta.len();
        let path_str = path.to_string_lossy().to_string();
        let rel = path
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path_str.clone());
        let category = classify_extension(&rel).to_string();
        report.total_bytes += bytes;
        report.file_count += 1;
        report.files.push(BundleFile {
            path: path_str,
            relative_path: rel,
            bytes,
            category,
        });
    }
}

#[tauri::command]
fn scan_bundle_size(project_path: String) -> Result<Option<BundleSizeRaw>, String> {
    validate_project_path(&project_path)?;

    // Candidate output directories that `expo export` (or eas build local hooks)
    // commonly produce. First one that exists wins.
    let candidates = ["dist", ".expo/bundle-output", "web-build"];
    let root = Path::new(&project_path);
    let bundle_dir = candidates
        .iter()
        .map(|c| root.join(c))
        .find(|p| p.is_dir());

    let Some(dir) = bundle_dir else {
        return Ok(None);
    };

    let mut report = BundleSizeRaw {
        bundle_dir: dir.to_string_lossy().to_string(),
        ..Default::default()
    };
    walk_bundle(&dir, &dir, &mut report);
    Ok(Some(report))
}

#[tauri::command]
fn scan_credentials(project_path: String) -> Result<CredentialsScanRaw, String> {
    validate_project_path(&project_path)?;

    let mut report = CredentialsScanRaw::default();
    walk_for_credentials(Path::new(&project_path), 0, 6, &mut report);
    Ok(report)
}

fn validate_path(path: &str) -> Result<(), String> {
    let p = PathBuf::from(path);
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Path traversal not allowed".to_string());
    }
    Ok(())
}

fn validate_project_path(path: &str) -> Result<(), String> {
    validate_path(path)?;
    if !Path::new(path).is_dir() {
        return Err("Project path must be a directory".to_string());
    }
    Ok(())
}

#[derive(Default)]
struct WatchState {
    watcher: Option<RecommendedWatcher>,
    project_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFilesChanged {
    project_path: String,
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {e}"))?;
    let cache = dir.join("cache");
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    Ok(cache)
}

fn cache_key(project_path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    project_path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn cache_file_path(app: &AppHandle, project_path: &str, cache_kind: &str) -> Result<PathBuf, String> {
    Ok(cache_dir(app)?.join(format!("{}-{cache_kind}.json", cache_key(project_path))))
}

fn is_relevant_watch_path(path: &Path, project_path: &str) -> bool {
    let path_str = path.to_string_lossy();
    if path_str.contains("node_modules")
        || path_str.contains("/.git/")
        || path_str.ends_with("/.git")
        || path_str.contains("/.expo/")
        || path_str.contains("/dist/")
        || path_str.contains("/build/")
    {
        return false;
    }

    let root = Path::new(project_path);
    if path.starts_with(root.join("app")) || path.starts_with(root.join("src").join("app")) {
        return true;
    }

    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            matches!(
                name,
                "package.json"
                    | "app.json"
                    | "app.config.js"
                    | "app.config.ts"
                    | "app.config.json"
                    | "eas.json"
                    | ".env"
                    | ".env.production"
                    | ".env.local"
            )
        })
}

fn should_emit_watch_event(event: &Event, project_path: &str) -> bool {
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }

    event
        .paths
        .iter()
        .any(|path| is_relevant_watch_path(path, project_path))
}

#[tauri::command]
fn read_cache(app: AppHandle, project_path: String, cache_kind: String) -> Result<Option<String>, String> {
    validate_project_path(&project_path)?;
    let path = cache_file_path(&app, &project_path, &cache_kind)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_cache(
    app: AppHandle,
    project_path: String,
    cache_kind: String,
    content: String,
) -> Result<(), String> {
    validate_project_path(&project_path)?;
    let path = cache_file_path(&app, &project_path, &cache_kind)?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_cache(app: AppHandle, project_path: String) -> Result<(), String> {
    validate_project_path(&project_path)?;
    for kind in ["project", "eas"] {
        let path = cache_file_path(&app, &project_path, kind)?;
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn watch_project(
    app: AppHandle,
    state: tauri::State<'_, Mutex<WatchState>>,
    project_path: String,
) -> Result<(), String> {
    validate_project_path(&project_path)?;

    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.watcher = None;

    let app_handle = app.clone();
    let watched_path = project_path.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            if let Ok(event) = result {
                if should_emit_watch_event(&event, &watched_path) {
                    let _ = app_handle.emit(
                        "project-files-changed",
                        ProjectFilesChanged {
                            project_path: watched_path.clone(),
                        },
                    );
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&project_path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    for relative in ["app", "src/app"] {
        let dir = Path::new(&project_path).join(relative);
        if dir.is_dir() {
            watcher
                .watch(&dir, RecursiveMode::Recursive)
                .map_err(|e| e.to_string())?;
        }
    }

    guard.watcher = Some(watcher);
    guard.project_path = Some(project_path);
    Ok(())
}

#[tauri::command]
fn unwatch_project(state: tauri::State<'_, Mutex<WatchState>>) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.watcher = None;
    guard.project_path = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(WatchState::default()))
        .invoke_handler(tauri::generate_handler![
            validate_project_folder,
            file_exists,
            is_directory,
            read_file,
            read_dir,
            check_eas_cli,
            check_eas_login,
            check_git_status,
            scan_credentials,
            scan_bundle_size,
            reveal_in_file_manager,
            run_command,
            run_command_streaming,
            open_in_editor,
            read_cache,
            write_cache,
            delete_cache,
            watch_project,
            unwatch_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ExpoPilot");
}
