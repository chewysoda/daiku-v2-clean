//! The local model (Ollama) for Extract. It is only ever reached on this computer, only at the few
//! paths Extract needs, and never with tools: the model gets text and gives text back.

use std::time::Duration;

const ENDPOINT: &str = "http://127.0.0.1:11434";
/// Listing models, listing loaded models, asking, and unloading.
const PATHS: [&str; 4] = ["/api/tags", "/api/ps", "/api/chat", "/api/generate"];
const MAX_REPLY_BYTES: usize = 4 * 1024 * 1024;
/// One passage. A laptop on battery can slow the model right down, and one passage must never hold up a
/// run for long: past this it's given up on, reported, and the run moves on.
const CHAT_LIMIT: Duration = Duration::from_secs(120);

/// Takes out anything that would give the model a way to act, so a request can only ever be text.
pub fn clean_body(body: &str) -> Result<String, String> {
    let mut value: serde_json::Value = serde_json::from_str(body).map_err(|e| format!("not JSON: {e}"))?;
    let object = value.as_object_mut().ok_or("the request must be a JSON object")?;
    object.remove("tools");
    object.remove("tool_choice");
    if !object.get("model").is_some_and(|m| m.is_string()) {
        return Err("the request must name a model".into());
    }
    Ok(value.to_string())
}

#[tauri::command]
pub async fn local_model_call(path: String, body: Option<String>) -> Result<String, String> {
    if !PATHS.contains(&path.as_str()) {
        return Err(format!("{path} is not something Extract asks the local model for"));
    }
    let client = reqwest::Client::builder()
        // The model is on this computer, so a system proxy must never see the request.
        .no_proxy()
        .connect_timeout(Duration::from_secs(3))
        .timeout(if path == "/api/chat" { CHAT_LIMIT } else { Duration::from_secs(15) })
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{ENDPOINT}{path}");
    let request = match body {
        Some(body) => client.post(url).header("Content-Type", "application/json").body(clean_body(&body)?),
        None => client.get(url),
    };
    let response = request.send().await.map_err(|e| {
        if e.is_connect() {
            "Ollama isn't running on this computer".to_string()
        } else if e.is_timeout() {
            format!("the model took longer than {} seconds, so this passage was skipped", CHAT_LIMIT.as_secs())
        } else {
            e.to_string()
        }
    })?;
    let status = response.status();
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_REPLY_BYTES {
        return Err("the local model's reply was too large".into());
    }
    let text = String::from_utf8_lossy(&bytes).into_owned();
    if !status.is_success() {
        return Err(format!("Ollama returned {status}: {}", text.chars().take(300).collect::<String>()));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tools_and_needs_a_model() {
        let out = clean_body(r#"{"model":"m","messages":[],"tools":[{"type":"function"}],"tool_choice":"auto"}"#).unwrap();
        assert!(!out.contains("tools"));
        assert!(!out.contains("tool_choice"));
        assert!(clean_body(r#"{"messages":[]}"#).is_err());
        assert!(clean_body("[1]").is_err());
        assert!(clean_body("not json").is_err());
    }
}
