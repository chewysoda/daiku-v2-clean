// Renders each screen at the mockups' size, for comparing with design/screens/v2.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
for (const [name, path] of [["Home", "/#/"], ["Canvas", "/#/canvas/b-esp32"], ["Library", "/#/library"], ["Lab", "/#/lab"], ["Share", "/#/share/b-esp32"], ["Explore", "/#/explore"], ["Threads", "/#/threads"], ["Settings", "/#/settings"], ["Present", "/#/present/b-esp32"]]) {
  await page.goto("http://localhost:1420" + path);
  await page.waitForTimeout(1200);
  if (name === "Canvas") { await page.getByRole("img", { name: "ESP32 dev board" }).click(); await page.waitForTimeout(200); }
  await page.screenshot({ path: `e2e/shots/${name}.png` });
}
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
