import { describe, expect, it } from "vitest";
import { searchContent, snippetOf } from "./contentSearch";

const asset = (id: string, kind: string, title: string, notes = "") => ({ id, kind, title, notes, credit: null, tags: "" }) as never;
const state = {
  assets: [asset("a1", "pdf", "ESP32 datasheet", "GPIO 34 to 39 are input only"), asset("a2", "quote", "Arduino core", "pinMode works on every output pin")],
  claims: [{ id: "c1", board_id: "b1", text: "ADC2 can't be used while Wi-Fi is on" }] as never[],
  records: [
    { id: "n1", type: "note", data: { title: "Call notes", body: "They asked about Wi-Fi range and battery life." } },
    { id: "d1", type: "draft", data: { title: "Spec draft", body: "Pins are checked against the datasheet." } },
  ] as never[],
  boards: [{ id: "b1", name: "Hardware" }] as never[],
  board_items: [{ id: "i1", board_id: "b1", kind: "sticky", data: { text: "ask about battery packs" } }] as never[],
};

describe("searching inside the work", () => {
  it("finds words in source text, claims, notes, drafts and board notes", () => {
    expect(searchContent(state, "input only").map((h) => h.id)).toEqual(["a1"]);
    expect(searchContent(state, "wi-fi").map((h) => h.kind).sort()).toEqual(["claim", "note"]);
    expect(searchContent(state, "battery").map((h) => h.kind).sort()).toEqual(["board", "note"]);
    expect(searchContent(state, "datasheet").map((h) => h.id)).toEqual(["a1", "d1"]);
  });

  it("needs every word, and ranks title matches first", () => {
    expect(searchContent(state, "wi-fi battery").map((h) => h.id)).toEqual(["n1"]);
    expect(searchContent(state, "zzz")).toEqual([]);
    expect(searchContent(state, "a")).toEqual([]);
  });

  it("opens PDFs beside the screen, notes by id", () => {
    const [pdf] = searchContent(state, "datasheet");
    expect(pdf.read).toBe(true);
    expect(searchContent(state, "call")[0].to).toBe("/notes?note=n1");
  });

  it("shows the words around the match", () => {
    expect(snippetOf("x ".repeat(40) + "needle here", ["needle"])).toMatch(/^….*needle here$/);
  });
});
