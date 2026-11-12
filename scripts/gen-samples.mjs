// Writes the bundled sample PDF and STL used by the first-run demo. Run: node scripts/gen-samples.mjs
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("public/samples", { recursive: true });

function pdf(pages) {
  const objects = [];
  const add = (body) => objects.push(body);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
  const kids = [];
  for (const lines of pages) {
    let y = 730;
    const stream = ["BT"];
    for (const [bold, text] of lines) {
      const safe = text.replace(/([()\\])/g, "\\$1");
      stream.push(`/${bold ? "F2" : "F1"} ${bold ? 16 : 12} Tf`, `1 0 0 1 72 ${y} Tm`, `(${safe}) Tj`);
      y -= bold ? 30 : 20;
    }
    stream.push("ET");
    const body = stream.join("\n");
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

writeFileSync(
  "public/samples/study.pdf",
  pdf([
    [
      [true, "[Study on textured upholstery]"],
      [false, "[Author] ([year]). [Journal]. Sample document from the design package."],
      [false, "It is a placeholder, not a real paper, so try highlighting it freely."],
      [true, "1. Introduction"],
      [false, "[Background: perceived softness is not the same as measured hardness.]"],
    ],
    [
      [true, "2. Method"],
      [false, "[Method: [n] participants, blind touch comparison, randomised order.]"],
      [true, "3. Results"],
      [false, "[Passage: participants rated the textured sample as softer than the smooth one"],
      [false, "at the same measured hardness.]"],
      [true, "4. Limitations"],
      [false, "[Limitation: only one fabric family was tested.]"],
    ],
  ]),
);

// A chair-shaped assembly of boxes: 590 x 560 x 780 mm, matching the sample's R4 and height.
function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return faces.map((f) => f.map((i) => v[i]));
}
const tris = [
  ...box(0, 0, 420, 590, 500, 438),
  ...box(0, 480, 438, 590, 500, 780),
  ...box(20, 20, 0, 50, 50, 420),
  ...box(540, 20, 0, 570, 50, 420),
  ...box(20, 500, 0, 50, 560, 420),
  ...box(540, 500, 0, 570, 560, 420),
];
const buf = Buffer.alloc(84 + tris.length * 50);
buf.write("Daiku sample chair", 0);
buf.writeUInt32LE(tris.length, 80);
tris.forEach((t, i) => {
  const at = 84 + i * 50;
  t.forEach((p, j) => p.forEach((c, k) => buf.writeFloatLE(c, at + 12 + j * 12 + k * 4)));
});
writeFileSync("public/samples/chair.stl", buf);
