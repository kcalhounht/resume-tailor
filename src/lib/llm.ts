import OpenAI from "openai";

import { getSettings } from "./settings";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

export function getDefaultLlmModel() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

export async function getLlmModel() {
  const settings = await getSettings();
  return settings.llmModel || getDefaultLlmModel();
}

export function getLlmClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your .env.local file.",
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Resume Tailor",
    },
  });
}
