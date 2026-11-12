import { chromium } from "@playwright/test";
const out = process.argv[2];
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const routes = [["home", "/#/home"], ["board", "/#/board/b-esp32"], ["decide", "/#/decide/d-esp32"], ["claims", "/#/explore/claims"], ["threads", "/#/threads"], ["handoff", "/#/handoff"], ["library", "/#/library"], ["explore", "/#/explore"], ["review", "/#/handoff/review"], ["requirements", "/#/decide/d-esp32/requirements"]];
for (const [name, path] of routes) {
  await page.goto("http://localhost:1420" + path);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82, clip: { x: 0, y: 38, width: 1440, height: 862 } });
  console.log(name, page.url());
}
await browser.close();
