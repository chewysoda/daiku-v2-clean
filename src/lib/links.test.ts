import { describe, expect, it } from "vitest";
import { isWebAddress, linkDetails } from "./links";

describe("pasted links", () => {
  it("knows a single address from other text", () => {
    expect(isWebAddress(" https://docs.espressif.com/x ")).toBe(true);
    expect(isWebAddress("see https://a.com")).toBe(false);
    expect(isWebAddress("ftp://a.com")).toBe(false);
  });

  it("takes the site as credit and a title from the path", () => {
    expect(linkDetails("https://www.example.com/guides/gpio-pin_limits.html")).toEqual({ title: "Gpio pin limits", site: "example.com" });
    expect(linkDetails("https://reactflow.dev/")).toEqual({ title: "reactflow.dev", site: "reactflow.dev" });
    expect(linkDetails("not a url")).toBeNull();
  });
});
