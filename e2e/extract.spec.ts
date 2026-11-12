import { expect, Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

/** A stand-in for Ollama on this computer: it records each request, and keeps track of what is "in memory". */
async function fakeOllama(page: Page, options: { installed?: boolean; running?: boolean } = {}) {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const loaded = new Set<string>();
  await page.route("http://127.0.0.1:11434/**", async (route) => {
    if (options.running === false) return route.abort("connectionrefused");
    const path = new URL(route.request().url()).pathname;
    const raw = route.request().postData();
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    calls.push({ path, body });
    const reply = (json: object) => route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify(json) });
    if (path === "/api/tags") return reply({ models: options.installed === false ? [] : [{ name: "qwen2.5:1.5b" }] });
    if (path === "/api/ps") return reply({ models: [...loaded].map((name) => ({ name })) });
    if (path === "/api/generate" && body?.keep_alive === 0) {
      loaded.delete(String(body.model));
      return reply({ done: true, done_reason: "unload" });
    }
    if (path === "/api/chat") {
      loaded.add(String(body!.model));
      const user = (body!.messages as { content: string }[]).at(-1)!.content;
      const id = /<chunk id="([^"]+)">/.exec(user)![1];
      const line = user.split("\n").find((l) => /must|should|hours|decided/i.test(l) && !l.startsWith("#") && !l.startsWith("<"));
      const records = line ? [{ category: /decided/i.test(line) ? "DECISION" : /must|should/i.test(line) ? "CLAIM" : "EVIDENCE", source_id: id, exact_quote: line.trim() }] : [];
      // One fabricated record per chunk, which the checks must throw out.
      records.push({ category: "EVIDENCE", source_id: id, exact_quote: "The battery lasted 99 hours in every test." });
      return reply({ message: { role: "assistant", content: JSON.stringify({ records }) } });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  return { calls, loaded };
}

/** The screen loads on first visit, which can take a while when several tests start at once. */
async function openExtract(page: Page) {
  await page.goto("/#/handoff/extract");
  const main = page.getByRole("main", { name: "Handoff" });
  await expect(main.getByRole("status", { name: "Model status" })).toBeVisible({ timeout: 20000 });
  return main;
}

test("extracts the pack on this computer, and unloads the model when the run ends", async ({ page }) => {
  const ollama = await fakeOllama(page);
  const main = await openExtract(page);
  await expect(main.getByRole("status", { name: "Model status" })).toHaveText("qwen2.5:1.5b is ready, and not in memory.");
  await main.getByRole("button", { name: "Extract everything" }).click();
  const result = main.getByRole("region", { name: "Extract result" });
  await expect(result).toContainText("Complete");
  const data = result.getByLabel("Extracted data");
  for (const section of ["[CLAIMS]", "[EVIDENCE]", "[DECISIONS]", "[CODE]"]) await expect(data).toContainText(section);
  await expect(data).toContainText("GPIO 34–39 are input only");
  await expect(data).toContainText("source: Claims/GPIO 34–39 are input only.md:");
  await expect(data).not.toContainText("99 hours");
  await expect(result.getByLabel("Run report")).toContainText("REJECTED RECORDS");

  // Every request is text only, asks Ollama to let the model go soon anyway, and the run ends with an unload.
  const chats = ollama.calls.filter((c) => c.path === "/api/chat");
  expect(chats.length).toBeGreaterThan(0);
  for (const c of chats) {
    expect(c.body).not.toHaveProperty("tools");
    expect(c.body!.keep_alive).toBe("2m");
  }
  const last = ollama.calls.filter((c) => c.path !== "/api/tags" && c.path !== "/api/ps").at(-1)!;
  expect(last).toEqual({ path: "/api/generate", body: { model: "qwen2.5:1.5b", keep_alive: 0 } });
  expect(ollama.loaded.size).toBe(0);
  await expect(main.getByRole("status", { name: "Model status" })).toHaveText("qwen2.5:1.5b is ready, and not in memory.");
});

test("a question reads only what it retrieves", async ({ page }) => {
  await fakeOllama(page);
  const main = await openExtract(page);
  await main.getByLabel("Only what answers this question").fill("which pins are input only");
  await main.getByRole("button", { name: "Extract for this question" }).click();
  const report = main.getByRole("region", { name: "Extract result" }).getByLabel("Run report");
  await expect(report).toContainText('mode: focused  query: "which pins are input only"');
  await expect(report).toContainText("This is not the whole pack.");
});

test("leaving the tab unloads the model, even mid-run", async ({ page }) => {
  const ollama = await fakeOllama(page);
  // Slow answers, so the run is still going when the tab changes.
  await page.route("http://127.0.0.1:11434/api/chat", async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.fallback();
  });
  const main = await openExtract(page);
  await main.getByRole("button", { name: "Extract everything" }).click();
  await expect(main.getByRole("button", { name: "Stop" })).toBeVisible();
  await main.getByRole("link", { name: "Review", exact: true }).click();
  await expect.poll(() => ollama.calls.some((c) => c.path === "/api/generate" && c.body?.keep_alive === 0)).toBe(true);
  const chatsAtLeave = ollama.calls.filter((c) => c.path === "/api/chat").length;
  await page.waitForTimeout(1500);
  // The run stopped: at most the request already in flight finishes, then nothing more is asked.
  expect(ollama.calls.filter((c) => c.path === "/api/chat").length).toBeLessThanOrEqual(chatsAtLeave + 1);
  await expect.poll(() => ollama.loaded.size).toBe(0);
});

test("says what to do when Ollama isn't running, or the model isn't downloaded", async ({ page }) => {
  await fakeOllama(page, { running: false });
  const main = await openExtract(page);
  await expect(main.getByRole("status", { name: "Model status" })).toHaveText("Ollama isn't running. Start it from the Start menu.");
  await expect(main.getByRole("button", { name: "Extract everything" })).toBeDisabled();

  await page.unrouteAll();
  await fakeOllama(page, { installed: false });
  await main.getByRole("button", { name: "Check again" }).click();
  await expect(main.getByRole("status", { name: "Model status" })).toHaveText("qwen2.5:1.5b isn't downloaded yet.");
  await expect(main).toContainText("ollama pull qwen2.5:1.5b");
  await expect(main.getByRole("button", { name: "Extract everything" })).toBeDisabled();
});

test("an empty pack says so, and never starts the model", async ({ page }) => {
  const ollama = await fakeOllama(page);
  const main = await openExtract(page);
  await main.getByLabel("Include the sample project").uncheck();
  await main.getByRole("button", { name: "Extract everything" }).click();
  const result = main.getByRole("region", { name: "Extract result" });
  await expect(result).toContainText("Nothing to extract");
  await expect(result).toContainText("Tick Include the sample project");
  expect(ollama.calls.filter((c) => c.path === "/api/chat")).toHaveLength(0);

  await main.getByLabel("Include the sample project").check();
  await main.getByRole("button", { name: "Extract everything" }).click();
  await expect(result).toContainText("Complete");
  await expect(result.getByLabel("Extracted data")).toContainText("GPIO 34–39 are input only");
});
