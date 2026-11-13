//! The macOS app: the same web build as the PWA, in a native window (see PLAN.md, Phase 4).
//! The window is built here, not in tauri.conf.json, so it can handle what a browser tab
//! would do for us: open web links in the default browser and save downloads.

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{Url, WebviewUrl};
use tauri_plugin_opener::OpenerExt;

/// The app's own pages (bundled, or the Vite dev server). Everything else on http(s) is the web.
fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => matches!(url.host_str(), Some("tauri.localhost" | "localhost")),
        _ => false,
    }
}

/// Web and mail links leave the app. Other schemes (blob:, data:, about:) stay, because
/// backups and exports are blob: downloads.
fn is_external(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto") && !is_app_url(url)
}

fn open_in_browser(app: &tauri::AppHandle, url: &Url) {
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("couldn't open {url}: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // No injected click script: the handlers below cover links, and page code (which
        // renders imported card HTML) gets no IPC access to the opener.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .setup(|app| {
            let nav_app = app.handle().clone();
            let popup_app = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Nenrin")
                .inner_size(1100.0, 800.0)
                .min_inner_size(360.0, 480.0)
                // Plain links (Help, GitHub) would otherwise replace the app with no way back.
                .on_navigation(move |url| {
                    if is_external(url) {
                        open_in_browser(&nav_app, url);
                        return false;
                    }
                    true
                })
                // target="_blank" links do nothing in a native window unless handled.
                .on_new_window(move |url, _features| {
                    if is_external(&url) {
                        open_in_browser(&popup_app, &url);
                    }
                    NewWindowResponse::Deny
                })
                // Without a handler WKWebView drops <a download> saves (backups, exports).
                // With one, wry saves to ~/Downloads and adds " (1)" instead of overwriting.
                .on_download(|_webview, _event| true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Nenrin");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn app_pages_stay_in_the_window() {
        assert!(!is_external(&url("tauri://localhost/index.html#/review")));
        assert!(!is_external(&url("http://localhost:5173/#/settings")));
        assert!(!is_external(&url("blob:tauri://localhost/1234")));
        assert!(!is_external(&url("data:text/plain,hi")));
    }

    #[test]
    fn web_links_open_in_the_browser() {
        assert!(is_external(&url("https://github.com/parmsam/nenrin")));
        assert!(is_external(&url(
            "https://en.wikipedia.org/wiki/Spaced_repetition"
        )));
        assert!(is_external(&url("mailto:someone@example.com")));
    }
}
