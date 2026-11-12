//! Makes a viewable copy of image formats the web view can't show, such as TIFF and HEIC, using the
//! decoders Windows has installed. The original is never changed.

#[cfg(windows)]
pub fn to_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use windows::{
        Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapEncoder, BitmapPixelFormat, SoftwareBitmap},
        Storage::Streams::{DataReader, DataWriter, InMemoryRandomAccessStream},
    };
    let run = || -> windows::core::Result<Vec<u8>> {
        let input = InMemoryRandomAccessStream::new()?;
        let writer = DataWriter::CreateDataWriter(&input)?;
        writer.WriteBytes(bytes)?;
        writer.StoreAsync()?.join()?;
        writer.FlushAsync()?.join()?;
        writer.DetachStream()?;
        input.Seek(0)?;

        let decoder = BitmapDecoder::CreateAsync(&input)?.join()?;
        let frame = decoder.GetSoftwareBitmapAsync()?.join()?;
        let bgra = SoftwareBitmap::ConvertWithAlpha(&frame, BitmapPixelFormat::Bgra8, BitmapAlphaMode::Premultiplied)?;

        let output = InMemoryRandomAccessStream::new()?;
        let encoder = BitmapEncoder::CreateAsync(BitmapEncoder::PngEncoderId()?, &output)?.join()?;
        encoder.SetSoftwareBitmap(&bgra)?;
        encoder.FlushAsync()?.join()?;

        let size = output.Size()? as u32;
        output.Seek(0)?;
        let reader = DataReader::CreateDataReader(&output)?;
        reader.LoadAsync(size)?.join()?;
        let mut png = vec![0u8; size as usize];
        reader.ReadBytes(&mut png)?;
        Ok(png)
    };
    run().map_err(|e| format!("Windows can't read this image: {e}"))
}

#[cfg(not(windows))]
pub fn to_png(_bytes: &[u8]) -> Result<Vec<u8>, String> {
    Err("Reading this image format is only available on Windows for now.".into())
}
