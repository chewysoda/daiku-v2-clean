//! The math-reading model is 120 MB, most of the installer, and only handwriting math uses it. So it
//! isn't shipped: it downloads the first time someone reads a formula, pinned to one revision and
//! checked by hash, and stays on this PC after that.
//!
//! Pix2Text MFR 1.5 by breezedeus, MIT licence: https://huggingface.co/breezedeus/pix2text-mfr-1.5

use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{ipc::Channel, AppHandle, Manager};

const REVISION: &str = "1cef9f0bdcd6a4c63df7de1311fb0894593340cc";
/// Name, SHA-256 and size of each file, matching `scripts/fetch-models.mjs`.
const FILES: [(&str, &str, u64); 3] = [
    ("encoder_model.onnx", "080a3f660f08bc9ebcacdd96e34be6b6400f8c7e62d7cd0dd8251badc37f610b", 87_510_770),
    ("decoder_model.onnx", "917deb98e91a0453c5f234f58a0f32f9fb037de8527c7eb4ed394daf9e692f2a", 32_026_253),
    ("tokenizer.json", "4ffbeb2143e6a38324bb6111b7a8109530d38a076a8439aa5777535f0a32758a", 113_168),
];
/// Written once every file has passed its hash check, so later starts don't re-hash 120 MB.
const CHECKED: &str = "checked.txt";

/// Where downloaded models live. Also allowed for the asset protocol at startup.
pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|d| d.join("models"))
        .map_err(|e| e.to_string())
}

fn mfr_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join("mfr"))
}

fn ready(dir: &PathBuf) -> bool {
    dir.join(CHECKED).exists()
        && FILES.iter().all(|(name, _, size)| std::fs::metadata(dir.join(name)).map(|m| m.len() == *size).unwrap_or(false))
}

/// The folder holding the math model, or nothing if it hasn't been downloaded yet.
#[tauri::command]
pub fn math_model_dir(app: AppHandle) -> Result<Option<String>, String> {
    let dir = mfr_dir(&app)?;
    Ok(ready(&dir).then(|| dir.to_string_lossy().into_owned()))
}

/// Downloads the math model, reporting how many bytes have arrived so far, and returns its folder.
#[tauri::command]
pub async fn math_model_download(app: AppHandle, on_progress: Channel<u64>) -> Result<String, String> {
    let dir = mfr_dir(&app)?;
    if ready(&dir) {
        return Ok(dir.to_string_lossy().into_owned());
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't make the model folder: {e}"))?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("Daiku/", env!("CARGO_PKG_VERSION"), " (local desktop app)"))
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut done: u64 = 0;
    for (name, hash, size) in FILES {
        let path = dir.join(name);
        let have = std::fs::read(&path).ok();
        if have.as_ref().is_some_and(|b| b.len() as u64 == size && hex(&Sha256::digest(b)) == hash) {
            done += size;
            let _ = on_progress.send(done);
            continue;
        }
        let url = format!("https://huggingface.co/breezedeus/pix2text-mfr-1.5/resolve/{REVISION}/{name}");
        let mut response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Couldn't download the math reader. Check the internet connection. ({e})"))?;
        if !response.status().is_success() {
            return Err(format!("Couldn't download the math reader ({})", response.status()));
        }
        let mut bytes = Vec::with_capacity(size as usize);
        let mut hasher = Sha256::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("The math reader download stopped. Try again. ({e})"))?
        {
            hasher.update(&chunk);
            bytes.extend_from_slice(&chunk);
            if bytes.len() as u64 > size {
                return Err("The math reader download was bigger than expected, so it wasn't kept.".into());
            }
            let _ = on_progress.send(done + bytes.len() as u64);
        }
        if hex(&hasher.finalize()) != hash {
            return Err(format!("{name} didn't match its expected hash, so it wasn't kept. Try again."));
        }
        // Written beside and then renamed, so a half-finished file never looks complete.
        let part = dir.join(format!("{name}.part"));
        std::fs::write(&part, &bytes).map_err(|e| format!("Couldn't save the math reader: {e}"))?;
        std::fs::rename(&part, &path).map_err(|e| format!("Couldn't save the math reader: {e}"))?;
        done += size;
    }
    std::fs::write(
        dir.join("NOTICE.txt"),
        format!("Pix2Text MFR 1.5, by breezedeus. MIT licence.\nhttps://huggingface.co/breezedeus/pix2text-mfr-1.5 (revision {REVISION})\n"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(dir.join(CHECKED), REVISION).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_add_up_to_about_120_mb() {
        let total: u64 = FILES.iter().map(|(_, _, s)| s).sum();
        assert_eq!(total, 119_650_191);
        assert!(FILES.iter().all(|(_, h, _)| h.len() == 64));
    }
}
