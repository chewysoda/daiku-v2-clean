//! Ad blocking for the Explore browser panes.
//!
//! Two layers, both offline (no list is downloaded):
//! 1. Network: every request from a pane, including ones from iframes and workers, is checked
//!    against a built-in list of ad and tracker hosts. Matches get an empty 403 and never leave
//!    the machine. WebView2's own tracking prevention is also turned up to Strict.
//! 2. Cosmetic: `adblock.js` hides the empty boxes that common ad slots leave behind.

/// Ad, ad-tech and tracker hosts. A host matches if it equals an entry or is a subdomain of one.
const BLOCKED_HOSTS: &[&str] = &[
    // Google ads
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "googletagservices.com",
    "adservice.google.com",
    "pagead2.googlesyndication.com",
    "googleads.g.doubleclick.net",
    "google-analytics.com",
    "googletagmanager.com",
    "imasdk.googleapis.com",
    "fundingchoicesmessages.google.com",
    "2mdn.net",
    "admob.com",
    // Amazon / Microsoft / Meta / others' ad networks
    "amazon-adsystem.com",
    "aax.amazon-adsystem.com",
    "adnxs.com",
    "adsrvr.org",
    "bat.bing.com",
    "ads.linkedin.com",
    "ads-twitter.com",
    "static.ads-twitter.com",
    "ads.yahoo.com",
    "advertising.com",
    "connect.facebook.net",
    "an.facebook.com",
    "ads.tiktok.com",
    "analytics.tiktok.com",
    "ads.reddit.com",
    "ads.pinterest.com",
    "ct.pinterest.com",
    "ads.yieldmo.com",
    // Programmatic / header bidding / SSPs
    "rubiconproject.com",
    "pubmatic.com",
    "openx.net",
    "casalemedia.com",
    "indexww.com",
    "criteo.com",
    "criteo.net",
    "taboola.com",
    "outbrain.com",
    "revcontent.com",
    "mgid.com",
    "zemanta.com",
    "sharethrough.com",
    "triplelift.com",
    "3lift.com",
    "teads.tv",
    "smartadserver.com",
    "adform.net",
    "adition.com",
    "yieldlab.net",
    "media.net",
    "contextweb.com",
    "sovrn.com",
    "lijit.com",
    "gumgum.com",
    "33across.com",
    "districtm.io",
    "emxdgt.com",
    "bidswitch.net",
    "spotxchange.com",
    "spotx.tv",
    "springserve.com",
    "smaato.net",
    "inmobi.com",
    "adcolony.com",
    "unityads.unity3d.com",
    "applovin.com",
    "vungle.com",
    "moatads.com",
    "adsafeprotected.com",
    "doubleverify.com",
    "serving-sys.com",
    "flashtalking.com",
    "innovid.com",
    "adroll.com",
    "quantserve.com",
    "quantcount.com",
    "scorecardresearch.com",
    "imrworldwide.com",
    "krxd.net",
    "bluekai.com",
    "demdex.net",
    "omtrdc.net",
    "everesttech.net",
    "exelator.com",
    "rlcdn.com",
    "agkn.com",
    "mathtag.com",
    "turn.com",
    "tapad.com",
    "crwdcntrl.net",
    "id5-sync.com",
    "liadm.com",
    "adsymptotic.com",
    "onetag-sys.com",
    "seedtag.com",
    "kargo.com",
    "undertone.com",
    "yieldlove.com",
    "adpushup.com",
    "ezoic.net",
    "ezojs.com",
    "mediavine.com",
    "adthrive.com",
    "raptive.com",
    "freestar.com",
    "pubgalaxy.com",
    "carbonads.com",
    "carbonads.net",
    "buysellads.com",
    "buysellads.net",
    "propellerads.com",
    "popads.net",
    "popcash.net",
    "adsterra.com",
    "exoclick.com",
    "juicyads.com",
    "trafficjunky.net",
    "hilltopads.net",
    "adcash.com",
    "admaven.com",
    "clickadu.com",
    "zedo.com",
    "infolinks.com",
    "vibrantmedia.com",
    "adblade.com",
    "content.ad",
    "nativo.com",
    "primis.tech",
    "connatix.com",
    "vidazoo.com",
    "aniview.com",
    "jwpltx.com",
    // Analytics / session-recording trackers
    "hotjar.com",
    "mouseflow.com",
    "fullstory.com",
    "crazyegg.com",
    "clarity.ms",
    "mixpanel.com",
    "segment.io",
    "cdn.segment.com",
    "amplitude.com",
    "heap.io",
    "heapanalytics.com",
    "chartbeat.com",
    "chartbeat.net",
    "parsely.com",
    "newrelic.com",
    "nr-data.net",
    "branch.io",
    "app.link",
    "adjust.com",
    "appsflyer.com",
    "kochava.com",
    "optimizely.com",
    "mc.yandex.ru",
    "an.yandex.ru",
];

/// True when a request to `host` should be dropped.
pub fn is_blocked_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    BLOCKED_HOSTS.iter().any(|entry| {
        host == *entry
            || (host.len() > entry.len()
                && host.ends_with(entry)
                && host.as_bytes()[host.len() - entry.len() - 1] == b'.')
    })
}

/// True when a full request URL should be dropped.
pub fn is_blocked_url(raw: &str) -> bool {
    url::Url::parse(raw)
        .ok()
        .and_then(|u| u.host_str().map(is_blocked_host))
        .unwrap_or(false)
}

/// Injected into every page (and iframe) the panes load.
pub const COSMETIC_SCRIPT: &str = include_str!("adblock.js");

#[cfg(windows)]
pub use platform::install;

#[cfg(windows)]
mod platform {
    use tauri::webview::PlatformWebview;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_TRACKING_PREVENTION_LEVEL_STRICT, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
            COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL, ICoreWebView2_2, ICoreWebView2_13,
            ICoreWebView2_22, ICoreWebView2Profile3,
        },
        WebResourceRequestedEventHandler, take_pwstr,
    };
    use windows::core::{Interface, PWSTR, w};

    /// Hooks the pane's network requests. Must run before the pane navigates anywhere real.
    pub fn install(webview: PlatformWebview) {
        let result = (|| -> windows::core::Result<()> {
            let core = unsafe { webview.controller().CoreWebView2()? };

            // WebView2's built-in tracker blocking (the same lists Edge uses). Best effort: older
            // runtimes don't have profiles.
            if let Ok(core13) = core.cast::<ICoreWebView2_13>() {
                if let Ok(profile) = unsafe { core13.Profile() } {
                    if let Ok(profile3) = profile.cast::<ICoreWebView2Profile3>() {
                        let _ = unsafe {
                            profile3.SetPreferredTrackingPreventionLevel(
                                COREWEBVIEW2_TRACKING_PREVENTION_LEVEL_STRICT,
                            )
                        };
                    }
                }
            }

            // Prefer the filter that also sees iframes and workers, which is where most ads live.
            match core.cast::<ICoreWebView2_22>() {
                Ok(core22) => unsafe {
                    core22.AddWebResourceRequestedFilterWithRequestSourceKinds(
                        w!("*"),
                        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                        COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
                    )?
                },
                Err(_) => unsafe {
                    core.AddWebResourceRequestedFilter(w!("*"), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)?
                },
            }

            let environment = core.cast::<ICoreWebView2_2>()?;
            let environment = unsafe { environment.Environment()? };
            let handler = WebResourceRequestedEventHandler::create(Box::new(move |_sender, args| {
                let Some(args) = args else { return Ok(()) };
                let request = unsafe { args.Request()? };
                let mut uri = PWSTR::null();
                unsafe { request.Uri(&mut uri)? };
                if super::is_blocked_url(&take_pwstr(uri)) {
                    let response = unsafe {
                        environment.CreateWebResourceResponse(None, 403, w!("Blocked"), w!(""))?
                    };
                    unsafe { args.SetResponse(&response)? };
                }
                Ok(())
            }));
            let mut token = 0i64;
            unsafe { core.add_WebResourceRequested(&handler, &mut token)? };
            Ok(())
        })();
        if let Err(e) = result {
            eprintln!("Daiku ad blocker could not start: {e}");
        }
    }
}

#[cfg(not(windows))]
pub fn install(_webview: tauri::webview::PlatformWebview) {}

#[cfg(test)]
mod tests {
    use super::{is_blocked_host, is_blocked_url};

    #[test]
    fn blocks_ad_hosts_and_their_subdomains() {
        assert!(is_blocked_host("doubleclick.net"));
        assert!(is_blocked_host("securepubads.g.doubleclick.net"));
        assert!(is_blocked_host("Pagead2.GoogleSyndication.com."));
        assert!(is_blocked_url("https://c.amazon-adsystem.com/aax2/apstag.js"));
    }

    #[test]
    fn leaves_ordinary_sites_alone() {
        assert!(!is_blocked_host("google.com"));
        assert!(!is_blocked_host("wikipedia.org"));
        assert!(!is_blocked_host("notdoubleclick.net"));
        assert!(!is_blocked_host("facebook.net.example.com"));
        assert!(!is_blocked_url("https://github.com/doubleclick.net"));
        assert!(!is_blocked_url("not a url"));
    }
}
