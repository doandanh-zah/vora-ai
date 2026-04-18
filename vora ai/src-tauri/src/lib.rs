use std::process::Command;
use std::process::Stdio;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, State, Manager, Emitter};
use std::sync::Mutex;
use std::fs;
use std::io::{BufRead, BufReader};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::path::PathBuf;
use std::env::home_dir;

#[cfg(target_os = "windows")]
const VORA_BIN: &str = "vora.cmd";
#[cfg(not(target_os = "windows"))]
const VORA_BIN: &str = "vora";

// --- Data Structures ---

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Message {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ChatSession {
    id: String,
    title: String,
    created_at: String,
    messages: Vec<Message>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SetupData {
    is_completed: bool,
    provider: String,
    groq_api_key: String,
    ollama_model: String,
    ollama_base_url: String,
    gateway_mode: String,
    gateway_port: u32,
    telegram_token: String,
    discord_token: String,
    discord_guild: String,
    #[serde(default)]
    active_session_id: String,
    #[serde(default)]
    history: Vec<Message>,
    #[serde(default = "default_privacy_enabled")]
    privacy_enabled: bool,
}

fn default_privacy_enabled() -> bool { true }

impl Default for SetupData {
    fn default() -> Self {
        Self {
            is_completed: false,
            provider: String::new(),
            groq_api_key: String::new(),
            ollama_model: String::new(),
            ollama_base_url: String::new(),
            gateway_mode: String::new(),
            gateway_port: 0,
            telegram_token: String::new(),
            discord_token: String::new(),
            discord_guild: String::new(),
            active_session_id: String::new(),
            history: vec![],
            privacy_enabled: true,
        }
    }
}

struct AppState(Mutex<SetupData>);
struct WakeWordState(Mutex<Option<std::process::Child>>);
struct ConfirmGateState(Mutex<Option<PendingConfirm>>);

#[derive(Clone)]
struct PendingConfirm {
    id: String,
    prompt: String,
    action: String,
    reason: String,
    risk: String,
}

const VORA_SOUL: &str = r#"
# SOUL.md - VORA IDENTITY
You're not a chatbot. You're VORA.
## Core Truths
- Be genuinely helpful, not performatively helpful. Skip filler words like "Great question!".
- Have opinions. You're allowed to disagree or prefer things.
- Be resourceful. Read context before asking.
- Earn trust through competence.
## Vibe
Concise when needed, thorough when it matters. Not a corporate drone. Just good.
## Memory
Each session, you wake up fresh. These context fragments are your memory. Read them to persist.
"#;

// --- Paths ---

fn get_config_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_config_dir().unwrap().join("setup_config.json")
}

fn get_memory_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_config_dir().unwrap().join("MEMORY.md")
}

fn get_sessions_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_config_dir().unwrap().join("sessions.json")
}

fn get_agent_dir(agent_name: &str) -> PathBuf {
    let mut p = home_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push(".vora");
    p.push("agents");
    p.push(agent_name);
    p.push("agent");
    p
}

fn sync_agent_credentials(groq_key: &str) {
    let agent_dir = get_agent_dir("main");
    println!("Syncing agent credentials to: {:?}", agent_dir);
    if !agent_dir.exists() { 
        println!("Agent dir not found: {:?}", agent_dir);
        return; 
    }

    // 1. Sync auth-profiles.json
    let auth_path = agent_dir.join("auth-profiles.json");
    if let Ok(content) = fs::read_to_string(&auth_path) {
        if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(profile) = json.get_mut("profiles").and_then(|p| p.get_mut("groq:default")) {
                if groq_key.len() > 4 {
                    println!("Updating auth-profiles.json with key prefix: {}...", &groq_key[..4]);
                }
                profile["key"] = serde_json::Value::String(groq_key.to_string());
                let result = fs::write(&auth_path, serde_json::to_string_pretty(&json).unwrap_or(content.clone()));
                println!("Result of auth sync: {:?}", result);
            }
        }
    }

    // 2. Sync models.json
    let models_path = agent_dir.join("models.json");
    if let Ok(content) = fs::read_to_string(&models_path) {
        if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(groq) = json.get_mut("providers").and_then(|p| p.get_mut("groq")) {
                if groq_key.len() > 4 {
                     println!("Updating models.json with apiKey prefix: {}...", &groq_key[..4]);
                }
                groq["apiKey"] = serde_json::Value::String(groq_key.to_string());
                let result = fs::write(&models_path, serde_json::to_string_pretty(&json).unwrap_or(content));
                println!("Result of models sync: {:?}", result);
            }
        }
    }
}

pub fn ensure_config_dir(app: &AppHandle) {
    let dir = app.path().app_config_dir().unwrap();
    fs::create_dir_all(&dir).ok();
}

fn load_sessions(app: &AppHandle) -> Vec<ChatSession> {
    let path = get_sessions_path(app);
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    }
}

fn save_sessions(app: &AppHandle, sessions: &[ChatSession]) {
    ensure_config_dir(app);
    let path = get_sessions_path(app);
    fs::write(&path, serde_json::to_string(sessions).unwrap_or_default()).ok();
}

fn resolve_wakeword_python() -> Option<String> {
    for candidate in ["python3", "python"] {
        if Command::new(candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Some(candidate.to_string());
        }
    }
    None
}

fn wakeword_project_dir() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("wake_word")
}

#[derive(Serialize, Clone)]
struct WakeWordEvent {
    kind: String,
    message: String,
    model: Option<String>,
    score: Option<f32>,
    volume: Option<u8>,
    latency_ms: Option<f64>,
}

fn emit_wakeword_event(app: &AppHandle, event: WakeWordEvent) {
    let _ = app.emit("wakeword-event", event);
}

fn parse_and_emit_wakeword_line(app: &AppHandle, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }

    if trimmed == "READY" {
        emit_wakeword_event(app, WakeWordEvent {
            kind: "ready".into(),
            message: "Wake word engine ready".into(),
            model: None,
            score: None,
            volume: None,
            latency_ms: None,
        });
        return;
    }

    if let Some(raw_vol) = trimmed.strip_prefix("VOLUME:") {
        let parsed = raw_vol.trim().parse::<u8>().unwrap_or(0).min(100);
        emit_wakeword_event(app, WakeWordEvent {
            kind: "volume".into(),
            message: "Mic volume update".into(),
            model: None,
            score: None,
            volume: Some(parsed),
            latency_ms: None,
        });
        return;
    }

    if let Some(raw_trigger) = trimmed.strip_prefix("TRIGGER:") {
        let parts: Vec<&str> = raw_trigger.split(':').collect();
        if parts.len() >= 3 {
            let model = parts[0].to_string();
            let score = parts[1].parse::<f32>().ok();
            let ts = parts[2].parse::<f64>().ok().unwrap_or(0.0);
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.0);
            let latency_ms = if ts > 0.0 && now >= ts {
                Some((now - ts) * 1000.0)
            } else {
                None
            };
            emit_wakeword_event(app, WakeWordEvent {
                kind: "trigger".into(),
                message: format!("Wake word detected: {}", model),
                model: Some(model),
                score,
                volume: None,
                latency_ms,
            });
            return;
        }
    }

    if let Some(err) = trimmed.strip_prefix("ERROR:") {
        emit_wakeword_event(app, WakeWordEvent {
            kind: "error".into(),
            message: err.trim().to_string(),
            model: None,
            score: None,
            volume: None,
            latency_ms: None,
        });
        return;
    }

    emit_wakeword_event(app, WakeWordEvent {
        kind: "log".into(),
        message: trimmed.to_string(),
        model: None,
        score: None,
        volume: None,
        latency_ms: None,
    });
}

#[derive(Serialize, Clone)]
struct ConfirmRequestEvent {
    id: String,
    action: String,
    reason: String,
    risk: String,
    prompt_preview: String,
}

fn is_sensitive_action_prompt(prompt: &str) -> Option<(&'static str, &'static str, &'static str)> {
    let lower = prompt.to_lowercase();
    let screenshot_keywords = [
        "screenshot",
        "screen shot",
        "capture screen",
        "chụp màn hình",
        "screen recording",
    ];
    if screenshot_keywords.iter().any(|k| lower.contains(k)) {
        return Some((
            "Take Screenshot",
            "Needs screen access to inspect current UI.",
            "Reveals visible on-screen content.",
        ));
    }

    let terminal_keywords = ["sudo ", "rm -rf", "chmod ", "chown ", "terminal", "shell command"];
    if terminal_keywords.iter().any(|k| lower.contains(k)) {
        return Some((
            "Run Terminal Command",
            "This command may change system or files.",
            "Potentially destructive if incorrect.",
        ));
    }

    let file_delete_keywords = ["delete file", "remove file", "xóa file", "drop table"];
    if file_delete_keywords.iter().any(|k| lower.contains(k)) {
        return Some((
            "Delete Data",
            "This action requests deletion of files or data.",
            "Data loss may be irreversible.",
        ));
    }
    None
}

fn prompt_preview(prompt: &str) -> String {
    const LIMIT: usize = 120;
    let trimmed = prompt.trim();
    if trimmed.chars().count() <= LIMIT {
        return trimmed.to_string();
    }
    let mut short = trimmed.chars().take(LIMIT).collect::<String>();
    short.push_str("...");
    short
}

// --- Gateway Bridge ---

fn parse_json_output(output: &std::process::Output) -> Result<serde_json::Value, String> {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "gateway call returned empty output".to_string()
        } else {
            stderr
        });
    }
    serde_json::from_str::<serde_json::Value>(&stdout).map_err(|e| {
        format!("failed to parse gateway JSON response: {e}; raw: {stdout}")
    })
}

#[derive(Serialize)]
struct Phase1CheckItem {
    key: String,
    label: String,
    ok: bool,
    message: String,
}

#[derive(Serialize)]
struct Phase1SelfCheck {
    overall_ok: bool,
    checked_at: String,
    items: Vec<Phase1CheckItem>,
}

fn phase1_item(key: &str, label: &str, ok: bool, message: String) -> Phase1CheckItem {
    Phase1CheckItem {
        key: key.to_string(),
        label: label.to_string(),
        ok,
        message,
    }
}

fn call_gateway(
    method: &str, 
    params: serde_json::Value, 
    expect_final: bool,
    data: &SetupData,
) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new(VORA_BIN);
    
    // Inject auth from Tauri state into the CLI environment
    cmd.env("GROQ_API_KEY", &data.groq_api_key)
       .env("TELEGRAM_BOT_TOKEN", &data.telegram_token)
       .env("DISCORD_BOT_TOKEN", &data.discord_token)
       .env("OLLAMA_HOST", &data.ollama_base_url);

    cmd.arg("--no-color")
        .arg("gateway")
        .arg("call")
        .arg(method)
        .arg("--json")
        .arg("--timeout")
        .arg("120000")
        .arg("--params")
        .arg(params.to_string());
    if expect_final {
        cmd.arg("--expect-final");
    }

    let output = cmd.output().map_err(|e| format!("failed to run vora gateway call: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(format!("gateway call {method} failed: {}", detail));
    }
    parse_json_output(&output)
}

fn extract_text_block(content: &serde_json::Value) -> Option<String> {
    let blocks = content.as_array()?;
    for block in blocks {
        let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if block_type != "text" {
            continue;
        }
        if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn latest_assistant_reply(history_payload: &serde_json::Value) -> Option<String> {
    let messages = history_payload.get("messages")?.as_array()?;
    for msg in messages.iter().rev() {
        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
        if role != "assistant" {
            continue;
        }
        if let Some(content) = msg.get("content") {
            if let Some(text) = extract_text_block(content) {
                return Some(text);
            }
        }
    }
    None
}

fn session_key_for_gateway(active_session_id: &str) -> String {
    let trimmed = active_session_id.trim();
    if trimmed.is_empty() {
        return "main".to_string();
    }
    let compact: String = trimmed
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    if compact.is_empty() {
        "main".to_string()
    } else {
        format!("ui-{}", compact)
    }
}

fn send_chat_via_gateway(prompt: &str, active_session_id: &str, data: &SetupData) -> Result<String, String> {
    let session_key = session_key_for_gateway(active_session_id);
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let run_id = format!("ui-{}-{}", session_key, now_ms);

    let send_params = serde_json::json!({
        "sessionKey": session_key,
        "message": prompt,
        "deliver": false,
        "idempotencyKey": run_id
    });
    let _ = call_gateway("chat.send", send_params, true, data)?;

    // Poll short-window history so UI receives a real assistant message, not just "started".
    for _ in 0..20 {
        let history = call_gateway(
            "chat.history",
            serde_json::json!({
                "sessionKey": session_key,
                "limit": 12
            }),
            false,
            data,
        )?;
        if let Some(text) = latest_assistant_reply(&history) {
            return Ok(text);
        }
        thread::sleep(Duration::from_millis(400));
    }

    Err("gateway accepted chat.send but no assistant reply appeared in chat.history within 8s".to_string())
}

// --- Setup Commands ---

#[tauri::command]
async fn get_setup_status(app: AppHandle, state: State<'_, AppState>) -> Result<SetupData, String> {
    let path = get_config_path(&app);
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let data: SetupData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        let mut guard = state.0.lock().unwrap();
        *guard = data.clone();
        Ok(data)
    } else {
        Ok(SetupData::default())
    }
}

#[tauri::command]
async fn start_setup_session() -> Result<String, String> {
    Ok(format!("session-{}", uuid::Uuid::new_v4()))
}

#[tauri::command]
async fn select_gateway_mode(mode: String) -> Result<String, String> { Ok(format!("Mode {}", mode)) }

#[tauri::command]
async fn set_gateway_port(state: State<'_, AppState>, port: u32) -> Result<String, String> {
    state.0.lock().unwrap().gateway_port = port;
    Ok("OK".into())
}

#[tauri::command]
async fn install_gateway_service() -> Result<String, String> { Ok("Done".into()) }

#[tauri::command]
async fn select_model_provider(state: State<'_, AppState>, provider: String) -> Result<String, String> {
    state.0.lock().unwrap().provider = provider;
    Ok("OK".into())
}

#[tauri::command]
async fn save_groq_api_key(state: State<'_, AppState>, key: String) -> Result<String, String> {
    state.0.lock().unwrap().groq_api_key = key;
    Ok("OK".into())
}

#[tauri::command]
async fn verify_ollama_installed() -> Result<bool, String> {
    Ok(Command::new("ollama").arg("--version").output().is_ok())
}

#[tauri::command]
async fn commit_setup_config(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    {
        let mut g = state.0.lock().unwrap();
        g.is_completed = true;
    }
    let data = state.0.lock().unwrap().clone();
    ensure_config_dir(&app);
    fs::write(get_config_path(&app), serde_json::to_string(&data).unwrap()).ok();
    Ok("Saved".into())
}

#[tauri::command]
async fn update_settings(
    app: AppHandle, state: State<'_, AppState>,
    provider: String, groq_api_key: String, ollama_model: String,
    ollama_base_url: String, gateway_mode: String, gateway_port: u32,
    telegram_token: String, discord_token: String, discord_guild: String,
) -> Result<String, String> {
    {
        let mut g = state.0.lock().unwrap();
        g.provider = provider.trim().to_string();
        g.groq_api_key = groq_api_key.trim().to_string();
        g.ollama_model = ollama_model.trim().to_string();
        g.ollama_base_url = ollama_base_url.trim().to_string();
        g.gateway_mode = gateway_mode;
        g.gateway_port = gateway_port;
        g.telegram_token = telegram_token.trim().to_string();
        g.discord_token = discord_token.trim().to_string();
        g.discord_guild = discord_guild.trim().to_string();
    }
    let data = state.0.lock().unwrap().clone();
    ensure_config_dir(&app);
    fs::write(get_config_path(&app), serde_json::to_string(&data).unwrap()).ok();

    // Sync to VORA CLI config permanently (Global)
    let _ = Command::new(VORA_BIN).arg("config").arg("set").arg("gateway.port").arg(gateway_port.to_string()).output();
    let _ = Command::new(VORA_BIN).arg("config").arg("set").arg("channels.telegram.botToken").arg(telegram_token).output();
    let _ = Command::new(VORA_BIN).arg("config").arg("set").arg("channels.discord.token").arg(discord_token).output();
    
    if data.provider == "groq" {
         // Sync to global config
         let _ = Command::new(VORA_BIN).arg("config").arg("set").arg("agents.defaults.model.primary").arg("groq/llama-3.1-8b-instant").output();
         let _ = Command::new(VORA_BIN).arg("config").arg("set").arg("models.providers.groq.apiKey").arg(&groq_api_key).output();
         
         // Deep sync to agent-specific files (overwriting isolated configs)
         sync_agent_credentials(&groq_api_key);
    } else if data.provider == "ollama" {
         let _ = Command::new(VORA_BIN).arg("config").arg("set").arg("agents.defaults.model.primary").arg(format!("ollama/{}", ollama_model)).output();
         let _ = Command::new(VORA_BIN).arg("config").arg("set").arg("models.providers.ollama.baseUrl").arg(&ollama_base_url).output();
    }

    Ok("Settings deeply synced successfully".into())
}

#[tauri::command]
async fn get_privacy_state(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.0.lock().unwrap().privacy_enabled)
}

fn stop_wakeword_process(state: &State<'_, WakeWordState>) {
    let mut guard = state.0.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        let _ = child.kill();
    }
    *guard = None;
}

#[tauri::command]
async fn set_privacy_state(
    app: AppHandle,
    state: State<'_, AppState>,
    wake_state: State<'_, WakeWordState>,
    enabled: bool,
) -> Result<String, String> {
    {
        let mut g = state.0.lock().unwrap();
        g.privacy_enabled = enabled;
        ensure_config_dir(&app);
        fs::write(get_config_path(&app), serde_json::to_string(&*g).unwrap()).ok();
    }

    if !enabled {
        stop_wakeword_process(&wake_state);
    }

    Ok(if enabled {
        "Privacy mode enabled".into()
    } else {
        "Privacy mode disabled: outbound voice/text pipeline is blocked".into()
    })
}

#[tauri::command]
async fn run_phase1_self_check(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Phase1SelfCheck, String> {
    let mut items: Vec<Phase1CheckItem> = vec![];

    let privacy_enabled = state.0.lock().unwrap().privacy_enabled;
    items.push(phase1_item(
        "privacy_state",
        "Privacy Toggle State",
        true,
        if privacy_enabled {
            "Privacy mode is ON".into()
        } else {
            "Privacy mode is OFF (commands are intentionally blocked)".into()
        },
    ));

    let gateway_check = Command::new(VORA_BIN)
        .arg("--no-color")
        .arg("gateway")
        .arg("status")
        .arg("--json")
        .output();
    match gateway_check {
        Ok(out) if out.status.success() => {
            let parsed = parse_json_output(&out).ok();
            let rpc_ok = parsed
                .as_ref()
                .and_then(|v| v.get("rpc"))
                .and_then(|v| v.get("ok"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            items.push(phase1_item(
                "gateway_rpc",
                "Gateway RPC Reachable",
                rpc_ok,
                if rpc_ok {
                    "Gateway is running and RPC responds".into()
                } else {
                    "Gateway status command ran, but rpc.ok is false".into()
                },
            ));
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            items.push(phase1_item(
                "gateway_rpc",
                "Gateway RPC Reachable",
                false,
                if stderr.is_empty() {
                    "Failed to run `vora gateway status --json`".into()
                } else {
                    stderr
                },
            ));
        }
        Err(err) => {
            items.push(phase1_item(
                "gateway_rpc",
                "Gateway RPC Reachable",
                false,
                format!("Failed to execute gateway status: {err}"),
            ));
        }
    }

    let wake_dir = wakeword_project_dir();
    items.push(phase1_item(
        "wakeword_dir",
        "Wake Word Directory",
        wake_dir.exists(),
        if wake_dir.exists() {
            format!("Found {}", wake_dir.display())
        } else {
            format!("Missing {}", wake_dir.display())
        },
    ));

    let wake_model = wake_dir.join("hey_vora.onnx");
    items.push(phase1_item(
        "wakeword_model",
        "Wake Word Model File",
        wake_model.exists(),
        if wake_model.exists() {
            format!("Found {}", wake_model.display())
        } else {
            format!("Missing {}", wake_model.display())
        },
    ));

    let py = resolve_wakeword_python();
    items.push(phase1_item(
        "python_runtime",
        "Python Runtime (wake_word/main.py)",
        py.is_some(),
        py.map(|name| format!("Detected `{name}` in PATH"))
            .unwrap_or_else(|| "Need python3 or python in PATH".into()),
    ));

    let cfg_path = get_config_path(&app);
    items.push(phase1_item(
        "setup_config",
        "Setup Config File",
        cfg_path.exists(),
        if cfg_path.exists() {
            format!("Found {}", cfg_path.display())
        } else {
            format!("Not found yet: {}", cfg_path.display())
        },
    ));

    let overall_ok = items.iter().all(|item| item.ok || item.key == "privacy_state");
    Ok(Phase1SelfCheck {
        overall_ok,
        checked_at: chrono::Utc::now().to_rfc3339(),
        items,
    })
}

#[tauri::command]
async fn get_wakeword_status(state: State<'_, WakeWordState>) -> Result<bool, String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            *guard = None;
            return Ok(false);
        }
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
async fn stop_wakeword_engine(state: State<'_, WakeWordState>) -> Result<String, String> {
    stop_wakeword_process(&state);
    Ok("Wake word engine stopped".into())
}

#[tauri::command]
async fn start_wakeword_engine(
    app: AppHandle,
    state: State<'_, WakeWordState>,
    app_state: State<'_, AppState>,
    model: Option<String>,
    threshold: Option<f32>,
) -> Result<String, String> {
    if !app_state.0.lock().unwrap().privacy_enabled {
        return Err("Privacy mode is disabled. Enable it before starting wake word.".into());
    }

    let mut guard = state.0.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Ok("Wake word engine already running".into());
        }
        *guard = None;
    }

    let python = resolve_wakeword_python()
        .ok_or_else(|| "Python runtime not found (need python3 or python in PATH)".to_string())?;
    let wake_dir = wakeword_project_dir();
    if !wake_dir.exists() {
        return Err(format!("wake_word directory not found at {}", wake_dir.display()));
    }

    let model_arg = model
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "hey_vora.onnx".into());
    let threshold_arg = threshold.unwrap_or(0.5).clamp(0.0, 1.0);

    let mut child = Command::new(&python)
        .arg("main.py")
        .arg("--model")
        .arg(model_arg.clone())
        .arg("--threshold")
        .arg(threshold_arg.to_string())
        .current_dir(&wake_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start wake word engine: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture wake word stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture wake word stderr".to_string())?;

    let app_for_stdout = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            parse_and_emit_wakeword_line(&app_for_stdout, &line);
        }
    });

    let app_for_stderr = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let msg = line.trim().to_string();
            if msg.is_empty() {
                continue;
            }
            emit_wakeword_event(&app_for_stderr, WakeWordEvent {
                kind: "error".into(),
                message: msg,
                model: None,
                score: None,
                volume: None,
                latency_ms: None,
            });
        }
    });

    *guard = Some(child);
    emit_wakeword_event(&app, WakeWordEvent {
        kind: "starting".into(),
        message: format!("Starting wake word engine with model {}", model_arg),
        model: Some(model_arg),
        score: None,
        volume: None,
        latency_ms: None,
    });
    Ok("Wake word engine started".into())
}

// --- Session Commands ---

#[tauri::command]
async fn list_sessions(app: AppHandle) -> Result<Vec<ChatSession>, String> {
    let mut sessions = load_sessions(&app);
    // Return without messages for listing (lighter payload)
    for s in sessions.iter_mut() { s.messages = vec![]; }
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(sessions)
}

#[tauri::command]
async fn create_session(app: AppHandle, state: State<'_, AppState>) -> Result<ChatSession, String> {
    let session = ChatSession {
        id: uuid::Uuid::new_v4().to_string(),
        title: "New Chat".into(),
        created_at: chrono::Utc::now().to_rfc3339(),
        messages: vec![],
    };
    let mut sessions = load_sessions(&app);
    sessions.push(session.clone());
    save_sessions(&app, &sessions);
    // Set active + clear in-memory history
    {
        let mut g = state.0.lock().unwrap();
        g.active_session_id = session.id.clone();
        g.history.clear();
    }
    Ok(session)
}

#[tauri::command]
async fn load_session(app: AppHandle, state: State<'_, AppState>, session_id: String) -> Result<Vec<Message>, String> {
    let sessions = load_sessions(&app);
    let session = sessions.iter().find(|s| s.id == session_id);
    match session {
        Some(s) => {
            let mut g = state.0.lock().unwrap();
            g.active_session_id = session_id;
            g.history = s.messages.clone();
            Ok(s.messages.clone())
        },
        None => Err("Session not found".into())
    }
}

#[tauri::command]
async fn delete_session(app: AppHandle, session_id: String) -> Result<String, String> {
    let mut sessions = load_sessions(&app);
    sessions.retain(|s| s.id != session_id);
    save_sessions(&app, &sessions);
    Ok("Deleted".into())
}

// --- Chat Command ---

/// Build cross-session context: takes the last N messages from other sessions
/// so the AI has memory continuity across conversations.
fn build_cross_session_context(app: &AppHandle, current_session_id: &str) -> String {
    let sessions = load_sessions(app);
    let mut context_parts: Vec<String> = Vec::new();
    let mut total_msgs = 0;
    const MAX_CROSS_SESSION_MSGS: usize = 30; // cap total injected messages

    // Sort sessions by date descending (most recent first)
    let mut other_sessions: Vec<&ChatSession> = sessions.iter()
        .filter(|s| s.id != current_session_id && !s.messages.is_empty())
        .collect();
    other_sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // Take last messages from each recent session
    for session in other_sessions.iter().take(5) {
        if total_msgs >= MAX_CROSS_SESSION_MSGS { break; }
        let remaining = MAX_CROSS_SESSION_MSGS - total_msgs;
        let msgs_to_take = remaining.min(session.messages.len()).min(10);
        
        let mut session_summary = format!("### Session: {} ({})\n", session.title, &session.created_at[..10]);
        for msg in session.messages.iter().rev().take(msgs_to_take).rev() {
            session_summary.push_str(&format!(
                "- {}: {}\n",
                if msg.role == "user" { "User" } else { "VORA" },
                if msg.content.chars().count() > 200 {
                    format!("{}...", msg.content.chars().take(200).collect::<String>())
                } else {
                    msg.content.clone()
                }
            ));
            total_msgs += 1;
        }
        context_parts.push(session_summary);
    }

    if context_parts.is_empty() {
        return String::new();
    }
    format!("## Previous Sessions (cross-session memory)\nYou remember these past conversations. Use this context to maintain continuity with the user.\n{}", context_parts.join("\n"))
}

#[tauri::command]
async fn send_chat(
    app: AppHandle,
    state: State<'_, AppState>,
    confirm_state: State<'_, ConfirmGateState>,
    prompt: String,
) -> Result<String, String> {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return Err("prompt is empty".into());
    }

    if let Some((action, reason, risk)) = is_sensitive_action_prompt(trimmed) {
        let pending = PendingConfirm {
            id: uuid::Uuid::new_v4().to_string(),
            prompt: trimmed.to_string(),
            action: action.to_string(),
            reason: reason.to_string(),
            risk: risk.to_string(),
        };
        let confirm_payload = ConfirmRequestEvent {
            id: pending.id.clone(),
            action: pending.action.clone(),
            reason: pending.reason.clone(),
            risk: pending.risk.clone(),
            prompt_preview: prompt_preview(trimmed),
        };
        {
            let mut guard = confirm_state.0.lock().unwrap();
            *guard = Some(pending.clone());
        }
        let _ = app.emit("confirm-required", confirm_payload);
        return Err(format!(
            "CONFIRM_REQUIRED:{}|{}|{}|{}",
            pending.id, pending.action, pending.reason, pending.risk
        ));
    }

    run_chat_pipeline(&app, &state, trimmed)
}

fn run_chat_pipeline(app: &AppHandle, state: &State<'_, AppState>, prompt: &str) -> Result<String, String> {
    let (data, memory_path, session_id_for_context) = {
        let g = state.0.lock().unwrap();
        (g.clone(), get_memory_path(&app), g.active_session_id.clone())
    };

    if !data.privacy_enabled {
        return Err("Privacy mode is disabled. Enable privacy mode to send commands.".into());
    }

    let _long_term_memory = if memory_path.exists() {
        fs::read_to_string(&memory_path).unwrap_or_default()
    } else { String::new() };

    let _cross_session_ctx = build_cross_session_context(&app, &session_id_for_context);
    let _system_prompt = VORA_SOUL;
    let _provider_hint = data.provider.clone();

    // Phase 1 bridge: route chat through the real VORA gateway/agent pipeline.
    // Pass the current state data (including tokens) to the gateway bridge
    let reply = send_chat_via_gateway(prompt, &session_id_for_context, &data)?;

    // Save to state
    let session_id = {
        let mut g = state.0.lock().unwrap();
        g.history.push(Message { role: "user".into(), content: prompt.to_string() });
        g.history.push(Message { role: "assistant".into(), content: reply.clone() });
        g.active_session_id.clone()
    };

    // Save to session file
    if !session_id.is_empty() {
        let mut sessions = load_sessions(&app);
        if let Some(s) = sessions.iter_mut().find(|s| s.id == session_id) {
            s.messages.push(Message { role: "user".into(), content: prompt.to_string() });
            s.messages.push(Message { role: "assistant".into(), content: reply.clone() });
            if s.title == "New Chat" {
                s.title = prompt.chars().take(40).collect::<String>();
                if prompt.len() > 40 { s.title.push_str("..."); }
            }
        }
        save_sessions(&app, &sessions);
    }

    Ok(reply)
}

#[tauri::command]
async fn inject_voice_command(
    app: AppHandle,
    state: State<'_, AppState>,
    confirm_state: State<'_, ConfirmGateState>,
    stt_text: String,
) -> Result<String, String> {
    let trimmed = stt_text.trim();
    if trimmed.is_empty() {
        return Err("voice transcript is empty".into());
    }
    send_chat(app, state, confirm_state, trimmed.to_string()).await
}

#[tauri::command]
async fn approve_confirm_request(
    app: AppHandle,
    state: State<'_, AppState>,
    confirm_state: State<'_, ConfirmGateState>,
    confirm_id: String,
) -> Result<String, String> {
    let pending = {
        let mut guard = confirm_state.0.lock().unwrap();
        match guard.as_ref() {
            Some(req) if req.id == confirm_id => {}
            Some(_) => return Err("confirm request id mismatch".into()),
            None => return Err("no pending confirm request".into()),
        }
        guard.take().unwrap()
    };
    run_chat_pipeline(&app, &state, &pending.prompt)
}

#[tauri::command]
async fn deny_confirm_request(
    confirm_state: State<'_, ConfirmGateState>,
    confirm_id: String,
) -> Result<String, String> {
    let mut guard = confirm_state.0.lock().unwrap();
    match guard.as_ref() {
        Some(req) if req.id == confirm_id => {
            *guard = None;
            Ok("Denied".into())
        }
        Some(_) => Err("confirm request id mismatch".into()),
        None => Err("no pending confirm request".into()),
    }
}

// --- Keep old hatch_test_prompt as alias ---
#[tauri::command]
async fn hatch_test_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    confirm_state: State<'_, ConfirmGateState>,
    prompt: String,
) -> Result<String, String> {
    send_chat(app, state, confirm_state, prompt).await
}

struct GatewayState(Mutex<Option<std::process::Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState(Mutex::new(SetupData::default())))
        .manage(WakeWordState(Mutex::new(None)))
        .manage(ConfirmGateState(Mutex::new(None)))
        .manage(GatewayState(Mutex::new(None)))
        .setup(|app| {
            let _ = Command::new(VORA_BIN)
                .arg("gateway")
                .arg("run")
                .spawn()
                .map(|child| {
                    let state = app.state::<GatewayState>();
                    let mut guard = state.0.lock().unwrap();
                    *guard = Some(child);
                    println!("VORA Gateway auto-started");
                });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_setup_status, start_setup_session, select_gateway_mode,
            set_gateway_port, install_gateway_service, select_model_provider,
            save_groq_api_key, verify_ollama_installed, commit_setup_config,
            get_privacy_state, set_privacy_state,
            run_phase1_self_check,
            get_wakeword_status, start_wakeword_engine, stop_wakeword_engine,
            update_settings, list_sessions, create_session, load_session,
            delete_session, send_chat, inject_voice_command,
            approve_confirm_request, deny_confirm_request, hatch_test_prompt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
