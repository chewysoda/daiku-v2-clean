// Writes the ESP32 example's sample PDF and STL (public/samples/esp32). Run: node scripts/gen-samples.mjs
// Both are made for the example: the PDF is sample study notes, not a published paper, and says so.
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "public/samples/esp32";
mkdirSync(OUT, { recursive: true });

const PAGE = { w: 612, h: 792, left: 72, top: 730 };
const wrap = (text, width = 84) => {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return [...lines, line];
};

/** Pages of [kind, text]: "title", "heading", "body" (wrapped) or "gap". Prints where each body line lands. */
function pdf(pages) {
  const objects = [];
  const add = (body) => objects.push(body);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>");
  const kids = [];
  pages.forEach((blocks, p) => {
    let y = PAGE.top;
    const stream = ["BT"];
    const put = (font, size, text, step) => {
      const safe = text.replace(/([()\\])/g, "\\$1");
      stream.push(`/${font} ${size} Tf`, `1 0 0 1 ${PAGE.left} ${y} Tm`, `(${safe}) Tj`);
      console.log(`p${p + 1} y=${((PAGE.h - y - size) / PAGE.h).toFixed(3)} ${text.slice(0, 60)}`);
      y -= step;
    };
    for (const [kind, text] of blocks) {
      if (kind === "title") put("F2", 18, text, 30);
      else if (kind === "heading") (y -= 8), put("F2", 14, text, 24);
      else if (kind === "note") for (const l of wrap(text)) put("F3", 11, l, 16);
      else if (kind === "gap") y -= 10;
      else for (const l of wrap(text)) put("F1", 12, l, 17);
    }
    stream.push("ET");
    const body = stream.join("\n");
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${content} 0 R >>`));
  });
  objects[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] >>`;
  const info = add("<< /Title (Picking a first code target for an ESP32 node editor) /Author (Daiku sample) >>");
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

writeFileSync(
  `${OUT}/code-target-notes.pdf`,
  pdf([
    [
      ["title", "Picking a first code target for an ESP32 node editor"],
      ["note", "Sample study notes, written for Daiku's example project. Not a published paper: the participants and numbers are made up to show how the Reader, highlights and evidence work."],
      ["heading", "Background"],
      ["body", "A node editor lets makers wire blocks on screen and get firmware out. Before building one for the ESP32 DevKitC, we need a first code target: Arduino C++, ESP-IDF C or MicroPython. The target decides which libraries people can reach, how long a build takes on Windows, and how readable the generated code is."],
      ["gap"],
      ["body", "Espressif's GPIO guide sets hard rules any target must respect: GPIO 34 to 39 are input only, ADC2 pins cannot be used while Wi-Fi is on, and the flash pins must never be offered."],
      ["heading", "Question"],
      ["body", "Which code target lets a beginner go from an empty canvas to a blinking LED and a button fastest, without hiding what the code does?"],
    ],
    [
      ["heading", "Method"],
      ["body", "Five sample makers, each new to C++, built the same two examples with each target: blink-plus-button, and a temperature sensor publishing over MQTT. We timed each build from a clean install and noted every place they stopped."],
      ["heading", "Findings"],
      ["body", "All five finished blink-plus-button fastest with Arduino C++. Its one command-line tool compiles and uploads, and most sensor examples online are written for it. ESP-IDF builds were slower to set up on Windows, but its documentation covers every peripheral. MicroPython was the easiest to read, but two sensor libraries were missing."],
      ["gap"],
      ["body", "Generated code was easier to follow when each node became one function and the main loop used a millis() scheduler instead of delay()."],
    ],
    [
      ["heading", "Limitations"],
      ["body", "Five people is a small group, and none had used ESP-IDF before. Build times depend on the machine. These notes are a sample, so treat every figure here as a guess until it is measured for real."],
      ["heading", "Sources"],
      ["body", "Espressif Systems. ESP-IDF Programming Guide: GPIO and RTC GPIO (ESP32). docs.espressif.com"],
      ["body", "Arduino SA. Arduino CLI: Getting started. arduino.github.io/arduino-cli"],
    ],
  ]),
);

// An open-top tray for an ESP32 DevKitC: 70 x 36 x 24 mm, 2 mm walls, with a 12 x 8 mm USB slot in one end.
function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return faces.map((f) => f.map((i) => v[i]));
}
const [W, D, H, T] = [70, 36, 24, 2];
const tris = [
  ...box(0, 0, 0, W, D, T),
  ...box(0, 0, 0, W, T, H),
  ...box(0, D - T, 0, W, D, H),
  ...box(0, 0, 0, T, D, H),
  ...box(W - T, 0, 0, W, 12, H),
  ...box(W - T, 24, 0, W, D, H),
  ...box(W - T, 12, 0, W, 24, 6),
  ...box(W - T, 12, 14, W, 24, H),
];
const buf = Buffer.alloc(84 + tris.length * 50);
buf.write("Daiku sample: ESP32 DevKitC enclosure tray, 70 x 36 x 24 mm", 0);
buf.writeUInt32LE(tris.length, 80);
tris.forEach((t, i) => {
  const at = 84 + i * 50;
  t.forEach((p, j) => p.forEach((c, k) => buf.writeFloatLE(c, at + 12 + j * 12 + k * 4)));
});
writeFileSync(`${OUT}/enclosure.stl`, buf);
