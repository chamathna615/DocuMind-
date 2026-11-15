import fs from "node:fs/promises";
import pdfParse from "pdf-parse/lib/pdf-parse.js"; // import the lib file directly (avoids pdf-parse's debug-mode bug)
import { UserError } from "../utils/userError.js";

export async function extractPdfText(file) {
  try {
    const data = await pdfParse(await fs.readFile(file));
    return data.text.replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    throw new UserError("This PDF could not be read. It may be encrypted or damaged.");
  }
}
