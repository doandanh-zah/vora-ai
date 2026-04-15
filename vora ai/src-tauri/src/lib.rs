use std::process::Command;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, State, Manager};
use std::sync::Mutex;
use std::fs;

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

#[derive(Serialize, Deserialize, Clone, Default)]
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
}

struct AppState(Mutex<SetupData>);

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

fn ensure_config_dir(app: &AppHandle) {
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
        g.provider = provider;
        g.groq_api_key = groq_api_key;
        g.ollama_model = ollama_model;
        g.ollama_base_url = ollama_base_url;
        g.gateway_mode = gateway_mode;
        g.gateway_port = gateway_port;
        g.telegram_token = telegram_token;
        g.discord_token = discord_token;
        g.discord_guild = discord_guild;
    }
    let data = state.0.lock().unwrap().clone();
    ensure_config_dir(&app);
    fs::write(get_config_path(&app), serde_json::to_string(&data).unwrap()).ok();
    Ok("Settings saved".into())
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
async fn send_chat(app: AppHandle, state: State<'_, AppState>, prompt: String) -> Result<String, String> {
    let (data, memory_path, session_id_for_context) = {
        let g = state.0.lock().unwrap();
        (g.clone(), get_memory_path(&app), g.active_session_id.clone())
    };

    let long_term_memory = if memory_path.exists() {
        fs::read_to_string(&memory_path).unwrap_or_default()
    } else { String::new() };

    // Build cross-session context (memories from other sessions)
    let cross_session_ctx = build_cross_session_context(&app, &session_id_for_context);

    let system_prompt = format!(
        "{}\n\n## Long-term Memory (RAG)\n{}\n\n{}\n\nRespond as VORA. You have continuity across sessions — use the previous session context to remember the user's preferences, name, and past topics.",
        VORA_SOUL, long_term_memory, cross_session_ctx
    );

    let mut messages = vec![Message { role: "system".into(), content: system_prompt }];
    for msg in data.history.iter().rev().take(20).rev() {
        messages.push(msg.clone());
    }
    messages.push(Message { role: "user".into(), content: prompt.clone() });

    let ollama_model = if data.ollama_model.is_empty() { "llama3.2".to_string() } else { data.ollama_model.clone() };
    let ollama_url = if data.ollama_base_url.is_empty() { "http://localhost:11434".to_string() } else { data.ollama_base_url.clone() };

    let client = reqwest::Client::new();
    let reply = if data.provider == "groq" {
        let resp = client.post("https://api.groq.com/openai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", data.groq_api_key))
            .json(&serde_json::json!({ "model": "llama-3.3-70b-versatile", "messages": messages }))
            .send().await;
        match resp {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                let json: Result<serde_json::Value, _> = serde_json::from_str(&text);
                match json {
                    Ok(json) => json["choices"][0]["message"]["content"].as_str().unwrap_or(&format!("API Error: {text}")).to_string(),
                    Err(_) => format!("API Error (status {}): {text}", status),
                }
            },
            Err(e) => format!("Request Error: {}", e),
        }
    } else {
        let resp = client.post(format!("{}/api/chat", ollama_url))
            .json(&serde_json::json!({ "model": ollama_model, "messages": messages, "stream": false }))
            .send().await;
        match resp {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                let json: Result<serde_json::Value, _> = serde_json::from_str(&text);
                match json {
                    Ok(json) => json["message"]["content"].as_str().unwrap_or(&format!("API Error: {text}")).to_string(),
                    Err(_) => format!("API Error (status {}): {text}", status),
                }
            },
            Err(e) => format!("Request Error: {}", e),
        }
    };

    // Save to state
    let session_id = {
        let mut g = state.0.lock().unwrap();
        g.history.push(Message { role: "user".into(), content: prompt.clone() });
        g.history.push(Message { role: "assistant".into(), content: reply.clone() });
        g.active_session_id.clone()
    };

    // Save to session file
    if !session_id.is_empty() {
        let mut sessions = load_sessions(&app);
        if let Some(s) = sessions.iter_mut().find(|s| s.id == session_id) {
            s.messages.push(Message { role: "user".into(), content: prompt.clone() });
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

// --- Keep old hatch_test_prompt as alias ---
#[tauri::command]
async fn hatch_test_prompt(app: AppHandle, state: State<'_, AppState>, prompt: String) -> Result<String, String> {
    send_chat(app, state, prompt).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState(Mutex::new(SetupData::default())))
        .invoke_handler(tauri::generate_handler![
            get_setup_status, start_setup_session, select_gateway_mode,
            set_gateway_port, install_gateway_service, select_model_provider,
            save_groq_api_key, verify_ollama_installed, commit_setup_config,
            update_settings, list_sessions, create_session, load_session,
            delete_session, send_chat, hatch_test_prompt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
