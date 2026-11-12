import { describe, expect, it } from "vitest";
import { greeting, greetingFor, helloDuration, HELLOS } from "./greeting";

describe("greeting", () => {
  it("follows the time of day", () => {
    expect(greeting(5)).toBe("Good morning");
    expect(greeting(11)).toBe("Good morning");
    expect(greeting(12)).toBe("Good afternoon");
    expect(greeting(17)).toBe("Good evening");
    expect(greeting(22)).toBe("Working late");
    expect(greeting(3)).toBe("Working late");
  });

  it("adds the first name only when there is one", () => {
    expect(greetingFor(9, "Ada Lovelace")).toBe("Good morning, Ada");
    expect(greetingFor(9, "  ")).toBe("Good morning");
  });

  it("starts with English hello, then other languages, each once", () => {
    expect(HELLOS[0]).toEqual({ word: "Hello", lang: "en" });
    expect(new Set(HELLOS.map((h) => h.lang)).size).toBe(HELLOS.length);
    expect(HELLOS.length).toBeGreaterThanOrEqual(6);
  });

  it("stays short enough to sit through", () => {
    expect(helloDuration()).toBeLessThan(9500);
  });
});
