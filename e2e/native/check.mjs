// End-to-end check of the real desktop app. Start it first with:
//   PowerShell: $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"; npm run tauri dev
// then run: node e2e/native/check.mjs   (needs internet for the browser-pane steps)
import { chromium } from "@playwright/test";
import { existsSync, statSync } from "node:fs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
// The app's own view.
const main = context.pages().find((p) => p.url().includes("localhost:1420") || p.url().includes("tauri.localhost"));
const problems = [];
// The 403 and the unresolved name are provoked below: the blocked win.ini read and evil.example.
const EXPECTED = /status of 403|ERR_NAME_NOT_RESOLVED/;
main.on("console", (m) => m.type() === "error" && !EXPECTED.test(m.text()) && problems.push(m.text()));
main.on("pageerror", (e) => problems.push(String(e)));
const nav = (name) => main.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true }).click();
const call = (cmd, args) => main.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a).then((v) => ({ ok: v }), (e) => ({ err: String(e) })), [cmd, args]);

await main.goto(main.url().split("#")[0] + "#/");
await main.reload();
await main.getByRole("heading", { level: 1 }).waitFor();

// --- Local data
check("runs in Tauri with SQLite", (await main.getByTestId("save-state").textContent()).includes("saved on this device"));
await main.goto(main.url().split("#")[0] + "#/library");
await main.getByLabel(/Search the library/).fill("walnu");
await main.getByRole("figure").first().waitFor();
await main.waitForTimeout(400);
check("FTS5 prefix search finds a stored asset", (await main.getByRole("figure").count()) === 1 && (await main.getByRole("figure").first().textContent()).includes("Walnut"));
await main.getByLabel(/Search the library/).fill("");

// --- Canvas: Pixi under the real CSP
await nav("Canvas");
await main.getByTestId("item-sticky").first().waitFor();
await main.waitForTimeout(1500);
check("Pixi dot grid renders under the app's CSP", (await main.locator('.dot-grid[data-ready="true"] canvas').count()) === 1);
const caption = await main.getByText("no source yet").first().isVisible();
check("canvas credits are visible", caption);

// --- Security boundaries, from the main view
const blocked = await call("scholar_get", { url: "https://example.com/" });
check("scholar proxy refuses hosts off its allow-list", Boolean(blocked.err), blocked.err);
const local = await call("library_save_url", { url: "http://127.0.0.1:1420/", referer: null });
check("downloader refuses local addresses", Boolean(local.err), local.err);
const scheme = await call("library_save_url", { url: "file:///C:/Windows/win.ini", referer: null });
check("downloader refuses file:", Boolean(scheme.err), scheme.err);
const assetRead = await main.evaluate(() => fetch("http://asset.localhost/C%3A%2FWindows%2Fwin.ini").then((r) => r.status, () => "blocked"));
check("asset protocol can't read outside the library", assetRead !== 200, String(assetRead));

// --- Explore: the Chromium pane
await nav("Explore");
await main.getByLabel("Search the web or enter an address").fill("bouclé armchair");
await main.keyboard.press("Enter");
let pane;
for (let i = 0; i < 40 && !pane; i++) {
  await main.waitForTimeout(500);
  pane = context.pages().find((p) => p !== main && /duckduckgo/.test(p.url()));
}
check("search opens in a Chromium child webview", Boolean(pane), pane?.url());
const ua = pane && (await pane.evaluate(() => navigator.userAgent));
check("the pane is Chromium", /Chrome\//.test(ua ?? ""), ua?.match(/Edg\S+/)?.[0]);
await main.waitForTimeout(1500);
const address = await main.getByLabel("Search the web or enter an address").inputValue();
check("address bar follows the pane", address.includes("duckduckgo"), address.slice(0, 60));

// The remote page must have no way into the app.
const reach = await pane.evaluate(async () => {
  const t = window.__TAURI_INTERNALS__;
  if (!t) return "no tauri object";
  return t.invoke("scholar_get", { url: "https://api.openalex.org/works?search=x" }).then(() => "CALLED", (e) => `rejected: ${e}`);
});
check("remote page can't call app commands", reach !== "CALLED", String(reach).slice(0, 110));

// A real page with real images: capture, review, save.
const TARGET = process.env.DAIKU_TEST_PAGE ?? "https://www.dezeen.com/";
const targetHost = new URL(TARGET).hostname.replace(/^www\./, "");
await main.getByLabel("Search the web or enter an address").fill(TARGET);
await main.keyboard.press("Enter");
for (let i = 0; i < 40 && !pane.url().includes(targetHost); i++) await main.waitForTimeout(500);
await pane.waitForLoadState("load").catch(() => {});
await main.waitForTimeout(3000);

const before = await main.evaluate(() => document.title);
await main.getByRole("button", { name: "Save from page" }).click();
const tray = main.getByLabel("Save to Library");
await tray.waitFor({ timeout: 8000 });
check("Save from page opens the review tray", true, before);
check("nothing downloaded before review", (await main.getByRole("button", { name: /^Save \d* ?images?$/ }).isDisabled()));
const credit = await tray.getByLabel("Credit").inputValue();
check("credit is drafted from the page", credit.length > 0, credit);
const thumbs = tray.locator(".tray-thumb");
const count = await thumbs.count();
check("page images are listed", count > 0, `${count} images`);
await thumbs.first().click();
await tray.getByRole("button", { name: /^Save 1 image$/ }).click();
await tray.waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
check("tray closes after saving", (await tray.count()) === 0, (await main.locator(".toast").textContent().catch(() => "")) ?? "");

// A web page spoofing the capture channel only ever reaches the review tray.
await pane.evaluate(() => {
  location.href = "daiku-capture://c/?p=" + encodeURIComponent(JSON.stringify({ kind: "image", page: { pageUrl: "https://evil.example/" }, images: [{ src: "file:///C:/Windows/win.ini" }, { src: "https://evil.example/a.png" }] }));
});
await tray.waitFor({ timeout: 8000 });
check("a spoofed capture only reaches the tray, and file: is dropped", (await tray.locator(".tray-thumb").count()) === 1);
check("page isn't navigated away by capture", pane.url().includes(targetHost));
await tray.getByRole("button", { name: "Close" }).click();

// --- The saved asset is real
await main.evaluate(() => { location.hash = "#/library"; });
await main.getByLabel(/Search the library/).waitFor();
await main.getByLabel(/Search the library/).fill(targetHost.split(".")[0]);
await main.waitForTimeout(800);
const saved = main.getByRole("figure").first();
await saved.waitFor();
check("saved image is in the Library with credit", (await saved.textContent()).includes("©"), (await saved.textContent()).slice(0, 80));
const naturalWidth = await saved.locator("img").evaluate((i) => (i.complete ? i.naturalWidth : new Promise((r) => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); })));
check("the file displays through the asset protocol", naturalWidth > 0, `${naturalWidth}px`);
const srcPath = await saved.locator("img").getAttribute("src");
const file = decodeURIComponent(srcPath.replace("http://asset.localhost/", ""));
check("it's a normal file in the library folder", existsSync(file) && statSync(file).size > 0 && /Daiku Library[\\/]assets/.test(file), file);
await saved.getByRole("button").first().click();
await main.getByRole("complementary", { name: /Details for/ }).waitFor();
await main.waitForTimeout(1500);
check("palette was extracted from the saved image", (await main.locator(".asset-panel-pal span").count()) > 0, `${await main.locator(".asset-panel-pal span").count()} colours`);
await main.getByRole("button", { name: "Close details" }).click();
await main.getByLabel(/Search the library/).fill("");

// --- Papers
await main.evaluate(() => { location.hash = "#/explore"; });
await main.getByRole("tab", { name: "Papers" }).click();
await main.getByLabel("Search papers").fill("perceived comfort upholstery");
await main.keyboard.press("Enter");
await main.locator(".paper").first().waitFor({ timeout: 25000 });
check("scholarly search returns live results", (await main.locator(".paper").count()) > 0, `${await main.locator(".paper").count()} papers`);
const sourceErrors = await main.locator(".papers > p.guess").allTextContents();
check("every enabled index answered", sourceErrors.length === 0, sourceErrors.join("; "));

// --- The pane steps aside
await main.getByRole("tab", { name: "Web" }).click();
await main.waitForTimeout(500);
{
  const hole = await main.getByTestId("browser-pane").boundingBox();
  const size = await pane.evaluate(() => [innerWidth, innerHeight]);
  check("the pane exactly fills its slot", Math.abs(size[0] - hole.width) <= 2 && Math.abs(size[1] - hole.height) <= 2, `${size} vs ${Math.round(hole.width)},${Math.round(hole.height)}`);
  check("the window has room for the layout", (await main.evaluate(() => innerWidth)) >= 1000, String(await main.evaluate(() => innerWidth)));
}
check("returning to Web keeps your page", (await main.getByLabel("Search the web or enter an address").inputValue()).includes(targetHost));
check("the empty state stays hidden over the pane", (await main.locator(".browser-empty").count()) === 0);
await main.keyboard.press("Control+k");
await main.getByLabel("Search or run a command").fill("library");
await main.waitForTimeout(400);
await main.keyboard.press("Escape");
await main.waitForTimeout(500);

check("no app errors logged", problems.length === 0, problems.slice(0, 5).join(" | "));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
