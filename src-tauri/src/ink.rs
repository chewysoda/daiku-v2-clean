//! Turns handwriting into text using the recogniser built into Windows, so it's free and offline.
//! It works from the pen strokes rather than a picture of them, which reads handwriting far better.

/// Each stroke is a list of [x, y] points, in the order they were written.
#[tauri::command]
pub async fn ink_to_text(strokes: Vec<Vec<[f32; 2]>>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || recognize(&strokes))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn recognize(strokes: &[Vec<[f32; 2]>]) -> Result<String, String> {
    use windows::{
        Foundation::Point,
        UI::Input::Inking::{InkManager, InkRecognitionTarget, InkStrokeBuilder},
    };
    use windows_collections::IIterable;

    let read = || -> windows::core::Result<Result<String, String>> {
        let manager = InkManager::new()?;
        if manager.GetRecognizers()?.Size()? == 0 {
            return Ok(Err("no handwriting language".into()));
        }
        let builder = InkStrokeBuilder::new()?;
        for stroke in strokes {
            let points: Vec<Point> = stroke.iter().map(|p| Point { X: p[0], Y: p[1] }).collect();
            if points.is_empty() {
                continue;
            }
            let iterable: IIterable<Point> = points.into();
            manager.AddStroke(&builder.CreateStroke(&iterable)?)?;
        }
        let results = manager.RecognizeAsync(InkRecognitionTarget::All)?.join()?;
        let mut words = Vec::new();
        for result in results {
            let candidates = result.GetTextCandidates()?;
            if candidates.Size()? > 0 {
                words.push(candidates.GetAt(0)?.to_string());
            }
        }
        Ok(Ok(words.join(" ")))
    };
    read().map_err(|e| format!("Windows couldn't read the handwriting: {e}"))?
}

#[cfg(not(windows))]
fn recognize(_strokes: &[Vec<[f32; 2]>]) -> Result<String, String> {
    Err("Reading handwriting is only available on Windows for now.".into())
}
