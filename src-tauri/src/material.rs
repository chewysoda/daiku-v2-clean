//! The window's material. Windows 11 with transparency on gets Mica behind the page; everything else
//! (Windows 10, transparency off) keeps the page's own solid background, so nothing shows through.
use std::sync::atomic::{AtomicBool, Ordering};

static MICA: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
fn read_reg(root: windows::Win32::System::Registry::HKEY, key: &str, name: &str, flags: windows::Win32::System::Registry::REG_ROUTINE_FLAGS) -> Option<Vec<u16>> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::RegGetValueW;
    let mut size: u32 = 0;
    let (key, name) = (HSTRING::from(key), HSTRING::from(name));
    unsafe {
        if RegGetValueW(root, &key, &name, flags, None, None, Some(&mut size)).is_err() || size == 0 {
            return None;
        }
        let mut buf = vec![0u16; (size as usize).div_ceil(2)];
        RegGetValueW(root, &key, &name, flags, None, Some(buf.as_mut_ptr().cast()), Some(&mut size)).ok().ok()?;
        Some(buf)
    }
}

/// Windows 11 is build 22000 or later, and Mica only makes sense with transparency effects on.
#[cfg(windows)]
pub fn supported() -> bool {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ};
    let build = read_reg(HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "CurrentBuildNumber", RRF_RT_REG_SZ)
        .map(|b| String::from_utf16_lossy(&b).trim_end_matches('\0').trim().parse::<u32>().unwrap_or(0))
        .unwrap_or(0);
    // No value means the default, which is on.
    let transparency = read_reg(HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "EnableTransparency", RRF_RT_REG_DWORD)
        .map(|b| b.first().copied().unwrap_or(1) != 0)
        .unwrap_or(true);
    build >= 22000 && transparency
}

#[cfg(not(windows))]
pub fn supported() -> bool {
    false
}

/// Called once at startup. A failure just leaves the solid window.
pub fn apply(window: &tauri::WebviewWindow) {
    use tauri::window::{Effect, EffectsBuilder};
    if supported() && window.set_effects(EffectsBuilder::new().effect(Effect::Mica).build()).is_ok() {
        MICA.store(true, Ordering::Relaxed);
    }
}

/// Whether Mica is behind the page, so the page knows to let it show through.
#[tauri::command]
pub fn window_material() -> &'static str {
    if MICA.load(Ordering::Relaxed) { "mica" } else { "solid" }
}
