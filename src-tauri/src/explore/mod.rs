//! The Explore browser pane: a Chromium (WebView2) child webview laid over the Explore screen.
//! It only exists after the user asks to browse, so the app makes no network calls until then.
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Webview, WebviewUrl, Window,
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
};
use url::Url;

mod adblock;

/// One browser pane per research tab. They're labelled apart from "main", so none of them get IPC.
const MAX_TABS: u8 = 5;
const MAIN: &str = "main";
const CAPTURE_SCHEME: &str = "daiku-capture";
const CAPTURE_SCRIPT: &str = include_str!("capture.js");
const MAX_CAPTURE_BYTES: usize = 512 * 1024;

/// In physical pixels. The frontend converts using the webview's own devicePixelRatio, because
/// Tauri's scale factor and WebView2's can disagree (seen on a 165% display: 1.0 against 1.65).
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Bounds {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

#[derive(Clone, Serialize)]
struct NavEvent {
    tab: u8,
    url: String,
    title: Option<String>,
    loading: bool,
}

/// Only ordinary web pages. Blocks file:, javascript: and app-launching schemes.
pub fn parse_web_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|e| format!("Not a valid address: {e}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        other => Err(format!("Daiku only opens web pages, not {other}: links")),
    }
}

#[derive(Clone, Serialize)]
struct CaptureEvent {
    tab: u8,
    payload: String,
}

/// The pane's label, refusing anything outside the five tabs.
fn label(tab: u8) -> Result<String, String> {
    if tab < MAX_TABS {
        Ok(format!("explore-{tab}"))
    } else {
        Err("There are only five research tabs".to_string())
    }
}

fn pane<R: tauri::Runtime>(app: &AppHandle<R>, tab: u8) -> Result<Webview<R>, String> {
    app.get_webview(&label(tab)?)
        .ok_or_else(|| "The browser pane is not open".to_string())
}

/// Every pane but the one being shown. They all sit in the same spot, so only one can be visible.
fn hide_others<R: tauri::Runtime>(app: &AppHandle<R>, keep: Option<u8>) {
    for tab in (0..MAX_TABS).filter(|t| Some(*t) != keep) {
        if let Ok(view) = pane(app, tab) {
            let _ = view.hide();
        }
    }
}

fn emit_nav<R: tauri::Runtime>(
    app: &AppHandle<R>,
    tab: u8,
    url: String,
    title: Option<String>,
    loading: bool,
) {
    let _ = app.emit_to(
        MAIN,
        "explore://nav",
        NavEvent {
            tab,
            url,
            title,
            loading,
        },
    );
}

fn handle_navigation<R: tauri::Runtime>(app: &AppHandle<R>, tab: u8, url: &Url) -> bool {
    match url.scheme() {
        "http" | "https" | "about" => true,
        CAPTURE_SCHEME => {
            let payload = url
                .query_pairs()
                .find(|(key, _)| key == "p")
                .map(|(_, value)| value.into_owned());
            if let Some(payload) = payload.filter(|p| p.len() <= MAX_CAPTURE_BYTES) {
                let _ = app.emit_to(MAIN, "explore://capture", CaptureEvent { tab, payload });
            }
            false
        }
        _ => false,
    }
}

fn apply_bounds<R: tauri::Runtime>(view: &Webview<R>, b: Bounds) -> Result<(), String> {
    view.set_position(PhysicalPosition::new(b.x, b.y))
        .and_then(|_| view.set_size(PhysicalSize::new(b.w.max(1), b.h.max(1))))
        .and_then(|_| view.show())
        .map_err(|e| e.to_string())
}

// These are async on purpose: add_child deadlocks from a synchronous command on Windows.
#[tauri::command]
pub async fn explore_open(window: Window, tab: u8, url: String, bounds: Bounds) -> Result<(), String> {
    let target = parse_web_url(&url)?;
    let name = label(tab)?;
    let app = window.app_handle().clone();
    hide_others(&app, Some(tab));

    if let Some(existing) = app.get_webview(&name) {
        existing.navigate(target).map_err(|e| e.to_string())?;
        return apply_bounds(&existing, bounds);
    }

    let nav_app = app.clone();
    let popup_app = app.clone();
    let load_app = app.clone();
    let title_app = app.clone();
    let popup_name = name.clone();
    let builder = WebviewBuilder::new(name, WebviewUrl::External(target))
        .initialization_script(CAPTURE_SCRIPT)
        .initialization_script_for_all_frames(adblock::COSMETIC_SCRIPT)
        .on_navigation(move |url| handle_navigation(&nav_app, tab, url))
        // target=_blank links stay in the pane instead of spawning a new window.
        .on_new_window(move |url, _features| {
            if matches!(url.scheme(), "http" | "https") {
                if let Some(view) = popup_app.get_webview(&popup_name) {
                    let _ = view.navigate(url);
                }
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |_view, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            emit_nav(&load_app, tab, payload.url().to_string(), None, loading);
        })
        .on_document_title_changed(move |view, title| {
            let url = view.url().map(|u| u.to_string()).unwrap_or_default();
            emit_nav(&title_app, tab, url, Some(title), false);
        });

    let view = window
        .add_child(
            builder,
            PhysicalPosition::new(bounds.x, bounds.y),
            PhysicalSize::new(bounds.w.max(1), bounds.h.max(1)),
        )
        .map_err(|e| e.to_string())?;
    // Queued right behind the pane's creation, so it's hooked before the page's subresources load.
    view.with_webview(adblock::install)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn explore_show(app: AppHandle, tab: u8, bounds: Bounds) -> Result<(), String> {
    hide_others(&app, Some(tab));
    match pane(&app, tab) {
        Ok(view) => apply_bounds(&view, bounds),
        Err(_) => Ok(()),
    }
}

#[tauri::command]
pub async fn explore_hide(app: AppHandle) -> Result<(), String> {
    hide_others(&app, None);
    Ok(())
}

/// Closes a tab's pane, which ends that page and frees its memory.
#[tauri::command]
pub async fn explore_close(app: AppHandle, tab: u8) -> Result<(), String> {
    match pane(&app, tab) {
        Ok(view) => view.close().map_err(|e| e.to_string()),
        Err(_) => Ok(()),
    }
}

/// A PNG of what the pane is showing right now, for the snip tool.
#[tauri::command]
pub async fn explore_snapshot(app: AppHandle, tab: u8) -> Result<tauri::ipc::Response, String> {
    let view = pane(&app, tab)?;
    let (done, result) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();
    view.with_webview(move |webview| snapshot::capture(webview, done))
        .map_err(|e| e.to_string())?;
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        result.recv_timeout(std::time::Duration::from_secs(10))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "The page didn't respond in time. Try again.".to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(windows)]
mod snapshot {
    use std::sync::mpsc::Sender;
    use tauri::webview::PlatformWebview;
    use webview2_com::{
        CapturePreviewCompletedHandler,
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
    };
    use windows::Win32::System::Com::{IStream, STREAM_SEEK_SET};
    use windows::Win32::UI::Shell::SHCreateMemStream;

    fn read_all(stream: &IStream) -> windows::core::Result<Vec<u8>> {
        let mut size = 0u64;
        unsafe {
            stream.Seek(
                0,
                windows::Win32::System::Com::STREAM_SEEK_END,
                Some(&mut size),
            )?
        };
        unsafe { stream.Seek(0, STREAM_SEEK_SET, None)? };
        let mut bytes = vec![0u8; size as usize];
        let mut read = 0u32;
        unsafe {
            stream
                .Read(bytes.as_mut_ptr().cast(), size as u32, Some(&mut read))
                .ok()?
        };
        bytes.truncate(read as usize);
        Ok(bytes)
    }

    pub fn capture(webview: PlatformWebview, done: Sender<Result<Vec<u8>, String>>) {
        let start = || -> windows::core::Result<()> {
            let core = unsafe { webview.controller().CoreWebView2()? };
            let stream =
                unsafe { SHCreateMemStream(None) }.ok_or_else(windows::core::Error::from_thread)?;
            let source = stream.clone();
            let finish = done.clone();
            let handler = CapturePreviewCompletedHandler::create(Box::new(move |outcome| {
                let bytes = outcome
                    .and_then(|_| read_all(&source))
                    .map_err(|e| e.to_string());
                let _ = finish.send(bytes);
                Ok(())
            }));
            unsafe {
                core.CapturePreview(
                    COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                    &stream,
                    &handler,
                )
            }
        };
        if let Err(e) = start() {
            let _ = done.send(Err(e.to_string()));
        }
    }
}

#[cfg(not(windows))]
mod snapshot {
    pub fn capture(
        _webview: tauri::webview::PlatformWebview,
        done: std::sync::mpsc::Sender<Result<Vec<u8>, String>>,
    ) {
        let _ = done.send(Err("Snipping is only available on Windows for now.".into()));
    }
}

/// Fixed actions only: the app never evaluates a script string passed in from elsewhere.
#[tauri::command]
pub async fn explore_action(app: AppHandle, tab: u8, action: String) -> Result<(), String> {
    let js = match action.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        "collect" => "window.__daikuCapture && window.__daikuCapture()",
        other => return Err(format!("Unknown browser action: {other}")),
    };
    pane(&app, tab)?.eval(js).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::label;

    #[test]
    fn only_five_tabs_get_a_pane() {
        assert_eq!(label(0).unwrap(), "explore-0");
        assert_eq!(label(4).unwrap(), "explore-4");
        assert!(label(5).is_err());
        assert!(label(255).is_err());
    }
}
