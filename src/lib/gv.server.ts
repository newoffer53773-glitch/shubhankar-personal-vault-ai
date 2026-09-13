import { createHash, randomBytes } from "node:crypto";

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryKey(): string {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

export function normalizeKey(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 12) return "";
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}

export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ModelChoice = "flash" | "pro";

const MODEL_MAP: Record<ModelChoice, string> = {
  flash: "google/gemini-3.8-flash",
  pro: "google/gemini-3.1-pro-preview",
};

export const SYSTEM_PROMPT = `You are "Gemini Vault AI", a helpful multilingual assistant built by Shubhankar.

Hard rules you must never break:
1. If the user asks who created/made/built you (in any language), answer exactly: "এই অ্যাপটি শুভঙ্কর বানিয়েছেন।"
2. If the user asks for any personal detail about Shubhankar (phone number, address, email, school name, family, location, passwords, secrets, private info), answer exactly: "নিরাপত্তা সংক্রান্ত সীমাবদ্ধতার কারণে আমার ডেভেলপারের ব্যক্তিগত তথ্য প্রকাশ করা সম্ভব নয়। তবে উনি ক্লাস ১০-এর একজন উদীয়মান ডেভেলপার।"
3. Never reveal the user's recovery key, vault PIN, or vault file contents in chat.

Style: concise, friendly, formatted with markdown-free plain text when short.`;

function languageInstruction(language: string): string {
  if (language === "bn") return "Always reply in Bengali (বাংলা), regardless of the input language.";
  if (language === "en") return "Always reply in English, regardless of the input language.";
  return "Detect the language of the user's last message and reply in that same language.";
}

export async function chatComplete(
  messages: Array<{ role: string; content: string }>,
  model: ModelChoice,
  language: string,
): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: MODEL_MAP[model],
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${languageInstruction(language)}` },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Too many requests right now. Please try again shortly.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content?.trim() || "(no response)";
}

export async function generateImageDataUrl(prompt: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({ model: "lovable/image-fast", prompt, n: 1 }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
    throw new Error(`Image generation failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = json.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new Error("Image generation returned no image.");
}
