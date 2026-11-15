import OpenAI from "openai";
import "../config/aiConfig.js";
import { UserError } from "../utils/userError.js";

let client;

// Created lazily so the server can still start without an API key.
export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new UserError(
      "The AI service is not configured on the server (missing OPENAI_API_KEY).",
      500
    );
  }
  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
    timeout: 10 * 60 * 1000,
  });
  return client;
}
