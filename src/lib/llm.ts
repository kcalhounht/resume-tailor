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

export async function getLlmClient() {
  const settings = await getSettings();
  const apiKey =
    settings.openRouterApiKey || process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new Error(
      "OpenRouter API key is not set. Add it on Admin → Settings, or set OPENROUTER_API_KEY.",
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
