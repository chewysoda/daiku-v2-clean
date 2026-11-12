//! Assets are ordinary files in a folder the user chooses. SQLite only holds their metadata.
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    net::IpAddr,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use url::{Host, Url};

use crate::explore::parse_web_url;

const MAX_DOWNLOAD_BYTES: usize = 64 * 1024 * 1024;
const MAX_TEXT_BYTES: usize = 8 * 1024 * 1024;
const USER_AGENT: &str = concat!("Daiku/", env!("CARGO_PKG_VERSION"), " (local desktop app)");
/// The only hosts scholar_get may talk to: free, open scholarly indexes.
const SCHOLAR_HOSTS: [&str; 4] = [
    "api.openalex.org",
    "api.semanticscholar.org",
    "export.arxiv.org",
    "api.crossref.org",
];

/// The only hosts github_get may talk to: GitHub's public API and its raw file host.
const GITHUB_HOSTS: [&str; 2] = ["api.github.com", "raw.githubusercontent.com"];
/// One source file or one API answer. Bigger files are usually generated code or data.
const MAX_GITHUB_BYTES: usize = 2 * 1024 * 1024;

#[derive(Default)]
pub struct LibraryState(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
pub struct StoredFile {
    file_path: String,
    sha256: String,
    bytes: u64,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn assets_dir(state: &LibraryState) -> Result<PathBuf, String> {
    let root = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("No library folder is set")?;
    let dir = root.join("assets");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Keeps a short, safe extension; anything else becomes .bin.
fn safe_ext(ext: Option<&str>) -> String {
    let ext = ext.unwrap_or("bin").to_ascii_lowercase();
    if !ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        ext
    } else {
        "bin".into()
    }
}

fn ext_from_mime(mime: &str) -> Option<&'static str> {
    Some(match mime.split(';').next()?.trim() {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/avif" => "avif",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        _ => return None,
    })
}

fn write_content_addressed(dir: &Path, bytes: &[u8], ext: &str) -> Result<StoredFile, String> {
    let sha = hex(&Sha256::digest(bytes));
    let path = dir.join(format!("{sha}.{ext}"));
    if !path.exists() {
        std::fs::write(&path, bytes).map_err(|e| format!("Could not save file: {e}"))?;
    }
    Ok(StoredFile {
        file_path: path.to_string_lossy().into_owned(),
        sha256: sha,
        bytes: bytes.len() as u64,
    })
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || (v4.octets()[0] == 100 && (64..128).contains(&v4.octets()[1]))
        }
        IpAddr::V6(v6) => {
            let first = v6.segments()[0];
            v6.is_loopback()
                || v6.is_unspecified()
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80
                || v6
                    .to_ipv4_mapped()
                    .is_some_and(|v4| is_private_ip(IpAddr::V4(v4)))
        }
    }
}

/// A web page must not be able to make the app fetch things from the user's own network.
fn host_is_blocked_literal(url: &Url) -> bool {
    match url.host() {
        Some(Host::Ipv4(ip)) => is_private_ip(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => is_private_ip(IpAddr::V6(ip)),
        Some(Host::Domain(d)) => {
            let d = d.to_ascii_lowercase();
            d == "localhost" || d.ends_with(".localhost") || d.ends_with(".local")
        }
        None => true,
    }
}

async fn ensure_public(url: &Url) -> Result<(), String> {
    if host_is_blocked_literal(url) {
        return Err("Daiku won't download from local network addresses".into());
    }
    if let Some(Host::Domain(domain)) = url.host() {
        let port = url.port_or_known_default().unwrap_or(443);
        let addrs = tokio::net::lookup_host((domain, port))
            .await
            .map_err(|e| format!("Could not resolve {domain}: {e}"))?;
        if addrs.into_iter().any(|a| is_private_ip(a.ip())) {
            return Err("Daiku won't download from local network addresses".into());
        }
    }
    Ok(())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let web = matches!(attempt.url().scheme(), "http" | "https");
            if attempt.previous().len() > 5 {
                attempt.error("too many redirects")
            } else if !web || host_is_blocked_literal(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}

async fn read_limited(response: reqwest::Response, limit: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        if bytes.len() + chunk.len() > limit {
            return Err(format!(
                "File is larger than the {} MB limit",
                limit / (1024 * 1024)
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

#[tauri::command]
pub fn library_default_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("Daiku Library");
    Ok(dir.to_string_lossy().into_owned())
}

/// Sets the library folder and lets the webview display files inside it (and nothing else).
#[tauri::command]
pub fn library_set_dir(
    app: AppHandle,
    state: State<'_, LibraryState>,
    path: String,
) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    if !dir.is_absolute() {
        return Err("The library folder must be an absolute path".into());
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create {path}: {e}"))?;
    app.asset_protocol_scope()
        .allow_directory(&dir, true)
        .map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(dir);
    Ok(())
}

#[tauri::command]
pub async fn library_import_file(
    state: State<'_, LibraryState>,
    source: String,
) -> Result<StoredFile, String> {
    let dir = assets_dir(&state)?;
    let source = PathBuf::from(source);
    let ext = safe_ext(source.extension().and_then(|e| e.to_str()));
    let bytes =
        std::fs::read(&source).map_err(|e| format!("Could not read {}: {e}", source.display()))?;
    write_content_addressed(&dir, &bytes, &ext)
}

/// Stores a snip the user just cropped. It arrives as a raw PNG body, as JSON would be enormous.
#[tauri::command]
pub async fn library_store_png(
    state: State<'_, LibraryState>,
    request: tauri::ipc::Request<'_>,
) -> Result<StoredFile, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected image data".into());
    };
    if !is_png(bytes) {
        return Err("That isn't a PNG image".into());
    }
    write_content_addressed(&assets_dir(&state)?, bytes, "png")
}

/// Stores a file from a backup being restored. It arrives as a raw body, with its extension in the
/// `x-ext` header; the extension is checked and the name comes from the content, as for every library file.
#[tauri::command]
pub async fn library_store_file(
    state: State<'_, LibraryState>,
    request: tauri::ipc::Request<'_>,
) -> Result<StoredFile, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected file data".into());
    };
    let ext = safe_ext(request.headers().get("x-ext").and_then(|v| v.to_str().ok()));
    write_content_addressed(&assets_dir(&state)?, bytes, &ext)
}

/// Makes a viewable PNG beside a stored image the web view can't show, such as a TIFF or HEIC.
/// Only for files in the library, and the original is left exactly as it is.
#[tauri::command]
pub async fn library_image_preview(state: State<'_, LibraryState>, path: String) -> Result<String, String> {
    let dir = assets_dir(&state)?.canonicalize().map_err(|e| e.to_string())?;
    let source = PathBuf::from(&path).canonicalize().map_err(|e| e.to_string())?;
    if source.parent() != Some(dir.as_path()) {
        return Err("That file isn't in the library".into());
    }
    let target = format!("{path}.preview.png");
    let to = target.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&source).map_err(|e| e.to_string())?;
        let png = crate::convert::to_png(&bytes)?;
        std::fs::write(&to, png).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(target)
}

/// Stores SVG code pasted into a board. It's kept as text, and only ever shown through an image tag.
#[tauri::command]
pub async fn library_store_svg(
    state: State<'_, LibraryState>,
    request: tauri::ipc::Request<'_>,
) -> Result<StoredFile, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected image data".into());
    };
    if !is_svg(bytes) {
        return Err("That isn't an SVG".into());
    }
    write_content_addressed(&assets_dir(&state)?, bytes, "svg")
}

fn is_svg(bytes: &[u8]) -> bool {
    std::str::from_utf8(bytes).is_ok_and(|text| text.contains("<svg"))
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A])
}

/// Downloads one image the user reviewed in the capture tray. Sends the page as Referer
/// because many image hosts refuse requests without it.
#[tauri::command]
pub async fn library_save_url(
    state: State<'_, LibraryState>,
    url: String,
    referer: Option<String>,
) -> Result<StoredFile, String> {
    let dir = assets_dir(&state)?;
    let target = parse_web_url(&url)?;
    ensure_public(&target).await?;
    let mut request = client()?.get(target.clone());
    if let Some(referer) = referer.and_then(|r| parse_web_url(&r).ok()) {
        request = request.header(reqwest::header::REFERER, referer.as_str());
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "The site refused the download ({})",
            response.status()
        ));
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !mime.is_empty()
        && !mime.starts_with("image/")
        && !mime.starts_with("application/octet-stream")
    {
        return Err(format!("That link is not an image ({mime})"));
    }
    let path_ext = Path::new(target.path())
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_owned);
    let ext = ext_from_mime(&mime)
        .map(str::to_owned)
        .unwrap_or_else(|| safe_ext(path_ext.as_deref()));
    let bytes = read_limited(response, MAX_DOWNLOAD_BYTES).await?;
    write_content_addressed(&dir, &bytes, &ext)
}

/// Reads from the open scholarly indexes. Rust does this because some of them don't allow
/// browser (CORS) requests, and the allow-list keeps it from being a general web proxy.
#[tauri::command]
pub async fn scholar_get(url: String) -> Result<String, String> {
    let target = parse_web_url(&url)?;
    let allowed = target.scheme() == "https"
        && target
            .host_str()
            .is_some_and(|h| SCHOLAR_HOSTS.contains(&h));
    if !allowed {
        return Err(format!("{url} is not one of the allowed scholarly indexes"));
    }
    let response = client()?
        .get(target)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    if status.as_u16() == 429 {
        return Err("rate limited, try again in a minute".into());
    }
    if !status.is_success() {
        return Err(format!("returned {status}"));
    }
    let bytes = read_limited(response, MAX_TEXT_BYTES).await?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

/// Whether github_get may fetch this address: https, and only GitHub's public hosts.
fn is_github_url(url: &Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some_and(|h| GITHUB_HOSTS.contains(&h))
}

/// Reads public repository files and listings from GitHub, so code can be saved as a source.
/// Rust does this because the app's content policy blocks web requests from the page, and the
/// allow-list keeps it from being a general web proxy. No token is sent: public data only.
#[tauri::command]
pub async fn github_get(url: String) -> Result<String, String> {
    let target = parse_web_url(&url)?;
    if !is_github_url(&target) {
        return Err(format!("{url} is not a GitHub address"));
    }
    let response = client()?
        .get(target)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    match status.as_u16() {
        403 | 429 => return Err("GitHub's hourly limit for public requests is used up. Try again later.".into()),
        404 => return Err("Not found. Check the link, and that the repository is public.".into()),
        _ if !status.is_success() => return Err(format!("GitHub returned {status}")),
        _ => {}
    }
    let bytes = read_limited(response, MAX_GITHUB_BYTES).await?;
    String::from_utf8(bytes).map_err(|_| "That file isn't text".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_stores_real_svgs() {
        assert!(is_svg(b"<?xml version=\"1.0\"?><svg></svg>"));
        assert!(!is_svg(b"<html></html>"));
        assert!(!is_svg(&[0xff, 0xfe, 0x00]));
    }

    #[test]
    fn only_stores_real_pngs() {
        assert!(is_png(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0]));
        assert!(!is_png(b"<html>"));
        assert!(!is_png(&[]));
    }

    #[test]
    fn github_get_only_reaches_github() {
        for ok in ["https://api.github.com/repos/a/b", "https://raw.githubusercontent.com/a/b/main/x.ts"] {
            assert!(is_github_url(&Url::parse(ok).unwrap()), "{ok}");
        }
        for bad in [
            "http://api.github.com/repos/a/b",
            "https://github.com.evil.example/a",
            "https://gist.github.com/a",
            "https://localhost/a",
        ] {
            assert!(!is_github_url(&Url::parse(bad).unwrap()), "{bad}");
        }
    }

    #[test]
    fn blocks_local_addresses() {
        for u in [
            "http://localhost/a.png",
            "http://127.0.0.1/a",
            "http://192.168.1.4/a",
            "http://10.0.0.1/a",
            "http://169.254.169.254/latest",
            "http://[::1]/a",
            "http://printer.local/a",
        ] {
            assert!(host_is_blocked_literal(&Url::parse(u).unwrap()), "{u}");
        }
        assert!(!host_is_blocked_literal(
            &Url::parse("https://example.com/a.png").unwrap()
        ));
    }

    #[test]
    fn only_web_schemes_open() {
        assert!(parse_web_url("https://example.com").is_ok());
        for u in [
            "file:///C:/Windows/win.ini",
            "javascript:alert(1)",
            "ms-settings:display",
            "daiku-capture://c/",
        ] {
            assert!(parse_web_url(u).is_err(), "{u}");
        }
    }

    #[test]
    fn extensions_are_sanitised() {
        assert_eq!(safe_ext(Some("PNG")), "png");
        assert_eq!(safe_ext(Some("../../evil")), "bin");
        assert_eq!(safe_ext(None), "bin");
    }
}
