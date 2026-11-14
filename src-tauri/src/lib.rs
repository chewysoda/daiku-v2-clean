mod appearance;
mod convert;
mod explore;
mod ink;
mod library;
mod local_model;
mod material;
mod models;
mod ocr;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/** Whether this build was made with an update address and key, so Settings can say so plainly. */
#[tauri::command]
fn updates_enabled(app: tauri::AppHandle) -> bool {
    app.config().plugins.0.contains_key("updater")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "records and workflow log",
            sql: include_str!("../migrations/002_records.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "evidence strength",
            sql: include_str!("../migrations/003_evidence_strength.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        // Everything but visibility: the window stays hidden until the page has loaded.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        // Must be the first plugin. Opening Daiku again brings the open window forward, because two
        // copies writing to one database and one library folder would be asking for trouble.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // The window starts hidden and appears once the page, with its splash, is ready. A dark theme
        // would otherwise open with a white flash.
        .on_page_load(|webview, payload| {
            if webview.label() == "main"
                && payload.event() == tauri::webview::PageLoadEvent::Finished
            {
                let _ = webview.window().show();
            }
        })
        .manage(library::LibraryState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:daiku.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            appearance::prepare(app.handle())?;
            if let Some(window) = app.get_webview_window("main") {
                material::apply(&window);
            }
            // The math model downloads on first use, and is then read like any other local file.
            let models = models::models_dir(app.handle())?;
            std::fs::create_dir_all(&models)?;
            app.asset_protocol_scope().allow_directory(&models, true)?;
            // Updates switch on once `npm run updates:setup` has written a key and an address into
            // tauri.conf.json. Until then there's nothing to check against, so the plugin stays out.
            if updates_enabled(app.handle().clone()) {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            appearance::appearance_import,
            appearance::appearance_remove,
            explore::explore_open,
            explore::explore_show,
            explore::explore_hide,
            explore::explore_close,
            explore::explore_action,
            explore::explore_snapshot,
            library::library_default_dir,
            library::library_set_dir,
            library::library_import_file,
            library::library_store_png,
            library::library_store_file,
            library::library_image_preview,
            library::library_store_svg,
            ocr::ocr_image,
            ink::ink_to_text,
            library::library_save_url,
            library::scholar_get,
            library::github_get,
            local_model::local_model_call,
            models::math_model_dir,
            models::math_model_download,
            updates_enabled,
            material::window_material,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Daiku");
}
