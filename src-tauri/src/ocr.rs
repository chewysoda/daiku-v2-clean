//! Reads text out of images using the recogniser built into Windows, so it's free, works offline,
//! and needs nothing bundled. It reads the languages installed in Windows.

/// Takes the image as a raw request body, and returns the lines of text it found.
#[tauri::command]
pub async fn ocr_image(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected image data".into());
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || recognize(&bytes))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn recognize(bytes: &[u8]) -> Result<String, String> {
    use windows::{
        Graphics::Imaging::BitmapDecoder,
        Media::Ocr::OcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    };
    let read = || -> windows::core::Result<Result<String, String>> {
        let stream = InMemoryRandomAccessStream::new()?;
        let writer = DataWriter::CreateDataWriter(&stream)?;
        writer.WriteBytes(bytes)?;
        writer.StoreAsync()?.join()?;
        writer.FlushAsync()?.join()?;
        writer.DetachStream()?;
        stream.Seek(0)?;

        let decoder = BitmapDecoder::CreateAsync(&stream)?.join()?;
        let bitmap = decoder.GetSoftwareBitmapAsync()?.join()?;
        let limit = OcrEngine::MaxImageDimension()? as i32;
        if bitmap.PixelWidth()? > limit || bitmap.PixelHeight()? > limit {
            return Ok(Err(format!(
                "That image is too large to read. The limit is {limit} pixels a side."
            )));
        }
        // Fails when Windows has no language with text recognition installed.
        let Ok(engine) = OcrEngine::TryCreateFromUserProfileLanguages() else {
            return Ok(Err(
                "Windows has no text recognition language installed. Add one in Settings > Time & language > Language.".into(),
            ));
        };
        let result = engine.RecognizeAsync(&bitmap)?.join()?;
        let mut lines = Vec::new();
        for line in result.Lines()? {
            lines.push(line.Text()?.to_string());
        }
        Ok(Ok(lines.join("\n")))
    };
    read().map_err(|e| format!("Couldn't read that image: {e}"))?
}

#[cfg(not(windows))]
fn recognize(_bytes: &[u8]) -> Result<String, String> {
    Err("Reading text from images is only available on Windows for now.".into())
}
