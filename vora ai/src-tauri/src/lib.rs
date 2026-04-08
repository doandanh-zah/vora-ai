use std::process::{Command, Stdio};
use std::os::windows::process::CommandExt;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone)]
struct SetupEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "stepId")]
    step_id: String,
    status: String,
    progress: u32,
    message: String,
    timestamp: String,
}

fn emit_setup_event(app: &AppHandle, event: SetupEvent) {
    let _ = app.emit("setup-event", event);
}

#[tauri::command]
async fn start_setup_session() -> Result<String, String> {
    Ok("session-".to_string() + &uuid::Uuid::new_v4().to_string())
}

#[tauri::command]
async fn select_gateway_mode(mode: String) -> Result<String, String> {
    println!(">>> VORA: Selected Gateway Mode: {}", mode);
    Ok(format!("Gateway mode set to {}", mode))
}

#[tauri::command]
async fn set_gateway_port(port: u32) -> Result<String, String> {
    println!(">>> VORA: Set Gateway Port: {}", port);
    // Add logic to check if port is free
    Ok(format!("Gateway port set to {}", port))
}

#[tauri::command]
async fn install_gateway_service(app: AppHandle, session_id: String) -> Result<String, String> {
    emit_setup_event(&app, SetupEvent {
        session_id: session_id.clone(),
        step_id: "gateway.installService".into(),
        status: "running".into(),
        progress: 0,
        message: "Installing Gateway Service...".into(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    // Mock installation
    std::thread::sleep(std::time::Duration::from_secs(2));

    emit_setup_event(&app, SetupEvent {
        session_id,
        step_id: "gateway.installService".into(),
        status: "success".into(),
        progress: 100,
        message: "Gateway Service installed.".into(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });

    Ok("Service installed".into())
}

#[tauri::command]
async fn select_model_provider(provider: String) -> Result<String, String> {
    println!(">>> VORA: Selected Provider: {}", provider);
    Ok(format!("Provider {} selected", provider))
}

#[tauri::command]
async fn save_groq_api_key(key: String) -> Result<String, String> {
    println!(">>> VORA: Saving Groq API Key...");
    Ok("Key saved".into())
}

#[tauri::command]
async fn verify_ollama_installed(app: AppHandle, session_id: String) -> Result<bool, String> {
    let output = Command::new("ollama")
        .arg("--version")
        .output();
    
    match output {
        Ok(out) => Ok(out.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn hatch_test_prompt(prompt: String) -> Result<String, String> {
    println!(">>> VORA: Hatch testing with prompt: {}", prompt);
    // Mock response
    Ok("VORA Assistant: I'm awake and ready to help!".into())
}

#[tauri::command]
async fn commit_setup_config() -> Result<String, String> {
    println!(">>> VORA: Committing config...");
    Ok("Config committed successfully".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_setup_session,
            select_gateway_mode,
            set_gateway_port,
            install_gateway_service,
            select_model_provider,
            save_groq_api_key,
            verify_ollama_installed,
            hatch_test_prompt,
            commit_setup_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
