// Injected into the Explore browser panes. Hides the boxes ad slots leave behind once the
// network blocker has stopped the ad itself. Selectors are kept narrow so real content survives.
(() => {
  if (window.__daikuAdblock) return;
  window.__daikuAdblock = true;
  const css = [
    'ins.adsbygoogle',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[id^="google_ads_iframe"]',
    'div[id^="google_ads_iframe"]',
    'div[id^="div-gpt-ad"]',
    '[data-google-query-id]',
    '[data-ad-slot]',
    '[data-ad-unit]',
    '[data-adunit]',
    '.adsbygoogle',
    '.ad-slot',
    '.ad-container',
    '.ad-wrapper',
    '.advertisement',
    '.sponsored-ad',
    '.taboola',
    '[id^="taboola-"]',
    '.OUTBRAIN',
    '.ob-widget',
    '#carbonads',
    'amp-ad',
    'amp-embed[type="taboola"]',
  ].join(',\n');
  const add = () => {
    const root = document.head || document.documentElement;
    if (!root) return false;
    const style = document.createElement('style');
    style.id = 'daiku-adblock';
    style.textContent = `${css} { display: none !important; }`;
    root.appendChild(style);
    return true;
  };
  if (!add()) document.addEventListener('DOMContentLoaded', add, { once: true });
})();
