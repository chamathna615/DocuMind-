import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
const FONT_FILES = {
  Latin: ["NotoSans_400Regular.ttf", "NotoSans_700Bold.ttf"],
  Sinhala: ["NotoSansSinhala_400Regular.ttf", "NotoSansSinhala_700Bold.ttf"],
  Tamil: ["NotoSansTamil_400Regular.ttf", "NotoSansTamil_700Bold.ttf"],
};

const ACCENT = "#5b3fd1";
const LETTERS = ["A", "B", "C", "D"];

/* ------------------------------------------------------------------ */
/* Document + fonts                                                    */
/* ------------------------------------------------------------------ */

function createDoc(title) {
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: title, Producer: "DocuMind" } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const available = {};
  for (const [script, [regular, bold]] of Object.entries(FONT_FILES)) {
    const regularPath = path.join(FONT_DIR, regular);
    if (!fs.existsSync(regularPath)) continue;
    const boldPath = path.join(FONT_DIR, bold);
    doc.registerFont(script, regularPath);
    doc.registerFont(`${script}-Bold`, fs.existsSync(boldPath) ? boldPath : regularPath);
    available[script] = true;
  }

  const fontName = (script, bold) => {
    const s = available[script] ? script : available.Latin ? "Latin" : null;
    if (!s) return bold ? "Helvetica-Bold" : "Helvetica";
    return bold ? `${s}-Bold` : s;
  };

  return { doc, finished, fontName };
}

/* ------------------------------------------------------------------ */
/* Rich text: **bold** + automatic font per script (Sinhala/Tamil/Latin) */
/* ------------------------------------------------------------------ */

function scriptOf(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0x0d80 && c <= 0x0dff) return "Sinhala";
  if (c >= 0x0b80 && c <= 0x0bff) return "Tamil";
  if (c === 0x200c || c === 0x200d) return null; // joiners stay with the current run
  return /[\p{L}\p{N}]/u.test(ch) ? "Latin" : null;
}

// Splits text into runs that each use one script, so every run can use a font that has its glyphs.
function scriptRuns(text) {
  const runs = [];
  let current = null;
  let buffer = "";
  for (const ch of text) {
    const s = scriptOf(ch);
    if (s === null || current === null || s === current) {
      if (current === null && s !== null) current = s;
      buffer += ch;
    } else {
      runs.push({ script: current, text: buffer });
      current = s;
      buffer = ch;
    }
  }
  if (buffer) runs.push({ script: current ?? "Latin", text: buffer });
  return runs;
}

const cleanInline = (t) =>
  t
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) -> text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(?<!\*)\*(?!\*)([^*\n]+)(?<!\*)\*(?!\*)/g, "$1") // *italic* -> italic
    .replace(/__(.+?)__/g, "$1");

function toParts(text) {
  const parts = [];
  const push = (t, bold) => scriptRuns(t).forEach((r) => parts.push({ ...r, bold }));
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) push(text.slice(last, m.index), false);
    push(m[1], true);
    last = m.index + m[0].length;
  }
  if (last < text.length) push(text.slice(last), false);
  return parts.filter((p) => p.text.length);
}

function writeRich(ctx, text, { size = 11, color = "#222222", x, y, width, bold = false, lineGap = 3 } = {}) {
  const { doc, fontName } = ctx;
  const parts = toParts(cleanInline(String(text ?? "")));
  if (!parts.length) return;
  parts.forEach((p, i) => {
    doc.font(fontName(p.script, bold || p.bold)).fontSize(size).fillColor(color);
    const opts = { continued: i < parts.length - 1, lineGap, ...(width ? { width } : {}) };
    if (i === 0 && x !== undefined) doc.text(p.text, x, y, opts);
    else doc.text(p.text, opts);
  });
  doc.x = doc.page.margins.left;
}

const geometry = (doc) => ({
  left: doc.page.margins.left,
  width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
});

const ensureSpace = (doc, needed) => {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
};

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function header(ctx, { title, label, course }) {
  const { doc } = ctx;
  const { left, width } = geometry(doc);
  writeRich(ctx, label.toUpperCase(), { size: 9, color: ACCENT, bold: true });
  doc.moveDown(0.2);
  writeRich(ctx, title, { size: 22, bold: true, color: "#111111", width, lineGap: 2 });
  doc.moveDown(0.2);
  writeRich(ctx, [course, new Date().toLocaleDateString("en-GB")].filter(Boolean).join("  •  "), {
    size: 9.5,
    color: "#666666",
    width,
  });
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.8).strokeColor("#e2e8f0").stroke();
  doc.moveDown(0.8);
}

function footerNote(ctx) {
  const { doc } = ctx;
  const { width } = geometry(doc);
  ensureSpace(doc, 40);
  doc.moveDown(1.2);
  writeRich(ctx, "Generated by DocuMind AI from your lecture material. Please review it for accuracy.", {
    size: 8.5,
    color: "#94a3b8",
    width,
  });
}

function heading(ctx, level, text) {
  const { doc } = ctx;
  const { width } = geometry(doc);
  const styles = {
    1: { size: 18, color: "#111111", gap: 14 },
    2: { size: 15, color: ACCENT, gap: 14 },
    3: { size: 12.5, color: "#111111", gap: 9 },
    4: { size: 11.5, color: "#111111", gap: 7 },
  };
  const s = styles[level] ?? styles[4];
  ensureSpace(doc, s.size + s.gap + 40);
  doc.y += s.gap;
  writeRich(ctx, text, { size: s.size, color: s.color, bold: true, width });
  doc.y += 4;
}

function listItem(ctx, label, text, level) {
  const { doc } = ctx;
  const { left, width } = geometry(doc);
  const gutter = 18;
  const indent = gutter + level * 16;
  ensureSpace(doc, 30);
  const y0 = doc.y;
  writeRich(ctx, label, { x: left + indent - gutter, y: y0, width: gutter - 2, color: "#555555" });
  writeRich(ctx, text, { x: left + indent, y: y0, width: width - indent });
  doc.x = left;
  doc.y += 2;
}

function paragraph(ctx, text) {
  const { doc } = ctx;
  const { width } = geometry(doc);
  writeRich(ctx, text, { width });
  doc.y += 5;
}

function renderMarkdown(ctx, markdown) {
  for (const raw of String(markdown ?? "").replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("```") || /^[-*_]{3,}$/.test(trimmed)) continue;

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) heading(ctx, m[1].length, m[2]);
    else if ((m = line.match(/^(\s*)[-*•]\s+(.*)$/))) listItem(ctx, "•", m[2], Math.min(2, Math.floor(m[1].length / 2)));
    else if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) listItem(ctx, `${m[2]}.`, m[3], Math.min(2, Math.floor(m[1].length / 2)));
    else paragraph(ctx, line.replace(/^>\s?/, ""));
  }
}

/* ------------------------------------------------------------------ */
/* Public builders                                                     */
/* ------------------------------------------------------------------ */

// Summary notes or study guide (both are stored as Markdown)
export async function buildMarkdownPdf({ title, course, label, markdown }) {
  const ctx = createDoc(title);
  header(ctx, { title, label, course });
  renderMarkdown(ctx, markdown);
  footerNote(ctx);
  ctx.doc.end();
  return ctx.finished;
}

// Quiz. withAnswers=false -> printable question sheet, true -> answer key with explanations
export async function buildQuizPdf({ title, course, questions, withAnswers }) {
  const ctx = createDoc(title);
  const { doc } = ctx;
  const { left, width } = geometry(doc);

  header(ctx, { title, label: withAnswers ? "Quiz answer key" : "Practice quiz", course });

  if (!withAnswers) {
    writeRich(ctx, "Name: ______________________     Date: ______________     Score: ______ / " + questions.length, {
      size: 10,
      color: "#555555",
      width,
    });
    doc.y += 12;
  }

  questions.forEach((q, i) => {
    ensureSpace(doc, withAnswers ? 70 : 110);
    writeRich(ctx, `${i + 1}. ${q.prompt}`, { size: 11.5, bold: true, color: "#111111", width });
    doc.y += 3;

    if (q.type === "mcq") {
      q.options.forEach((option, j) => {
        const isAnswer = withAnswers && option === q.answer;
        const y0 = doc.y;
        writeRich(ctx, `${LETTERS[j]}.`, { x: left + 14, y: y0, width: 18, color: isAnswer ? "#15803d" : "#555555", bold: isAnswer });
        writeRich(ctx, option, { x: left + 34, y: y0, width: width - 34, color: isAnswer ? "#15803d" : "#222222", bold: isAnswer });
        doc.x = left;
        doc.y += 1;
      });
    } else if (!withAnswers) {
      for (let k = 0; k < 2; k++) {
        doc.y += 16;
        doc.moveTo(left + 14, doc.y).lineTo(left + width, doc.y).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
      }
      doc.y += 4;
    }

    if (withAnswers) {
      doc.y += 3;
      const correct =
        q.type === "mcq" ? `${LETTERS[q.options.indexOf(q.answer)] ?? ""}. ${q.answer}` : q.answer;
      writeRich(ctx, `Answer: ${correct}`, { size: 10.5, bold: true, color: "#15803d", width: width - 14, x: left + 14, y: doc.y });
      if (q.type === "short" && q.keywords?.length) {
        writeRich(ctx, `Keywords: ${q.keywords.join(", ")}`, { size: 9.5, color: "#666666", width: width - 14, x: left + 14, y: doc.y });
      }
      if (q.explanation) {
        writeRich(ctx, q.explanation, { size: 10, color: "#555555", width: width - 14, x: left + 14, y: doc.y });
      }
    }
    doc.y += 10;
  });

  footerNote(ctx);
  doc.end();
  return ctx.finished;
}
