//! Custom fonts and background media. They live in the app's data folder rather than the library,
//! because they're how the app looks and not research material.
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const ALLOWED: [&str; 12] = [
    "ttf", "otf", "woff", "woff2", "png", "jpg", "jpeg", "webp", "avif", "gif", "mp4", "webm",
];

fn allowed_ext(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    ALLOWED.contains(&ext.as_str()).then_some(ext)
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("appearance"))
}

/// Creates the folder and lets the page load files from it. Runs at startup.
pub fn prepare(app: &AppHandle) -> Result<(), String> {
    let dir = dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(&dir, true)
        .map_err(|e| e.to_string())
}

/// Copies a file the user picked into the folder, under a new name, and returns its path.
#[tauri::command]
pub async fn appearance_import(app: AppHandle, source: String) -> Result<String, String> {
    let source = PathBuf::from(source);
    let ext = allowed_ext(&source).ok_or("Daiku can't use that file type here.")?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let target = dir(&app)?.join(format!("{stamp}.{ext}"));
    // A background video can be large, so the copy stays off the async runtime's threads.
    let to = target.clone();
    tauri::async_runtime::spawn_blocking(move || std::fs::copy(&source, &to))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Could not copy the file: {e}"))?;
    Ok(target.to_string_lossy().into_owned())
}

/// Deletes one file, but only from this folder, whatever path the page asks for.
#[tauri::command]
pub fn appearance_remove(app: AppHandle, path: String) -> Result<(), String> {
    let root = dir(&app)?.canonicalize().map_err(|e| e.to_string())?;
    let Ok(file) = PathBuf::from(path).canonicalize() else {
        return Ok(()); // Already gone.
    };
    if !is_inside(&root, &file) {
        return Err("That file isn't one of Daiku's appearance files.".into());
    }
    std::fs::remove_file(&file).map_err(|e| e.to_string())
}

fn is_inside(root: &Path, file: &Path) -> bool {
    file.parent() == Some(root) && allowed_ext(file).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_fonts_images_and_video_only() {
        for good in ["a.ttf", "a.WOFF2", "a.jpg", "a.mp4", "a.webm"] {
            assert!(allowed_ext(Path::new(good)).is_some(), "{good}");
        }
        for bad in ["a.exe", "a.svg", "a.html", "a", "a.mp4.bat"] {
            assert!(allowed_ext(Path::new(bad)).is_none(), "{bad}");
        }
    }

    #[test]
    fn removal_stays_inside_the_folder() {
        let root = Path::new("C:/data/appearance");
        assert!(is_inside(root, Path::new("C:/data/appearance/1.mp4")));
        assert!(!is_inside(root, Path::new("C:/data/daiku.db")));
        assert!(!is_inside(root, Path::new("C:/data/appearance/sub/1.mp4")));
        assert!(!is_inside(root, Path::new("C:/data/appearance/1.exe")));
    }
}
