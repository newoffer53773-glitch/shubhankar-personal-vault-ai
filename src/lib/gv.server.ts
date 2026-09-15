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

export type Attachment = { mimeType: string; base64: string };

const GEMINI_MODELS: Record<ModelChoice, string> = {
  flash: "gemini-1.5-flash",
  pro: "gemini-1.5-pro",
};

/** Direct Google Gemini call using the user's own API key. */
async function geminiComplete(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  model: ModelChoice,
  language: string,
  attachment?: Attachment,
): Promise<string> {
  const contents = messages.map((m, index) => {
    const parts: Array<Record<string, unknown>> = [{ text: m.content }];
    if (attachment && index === messages.length - 1 && m.role === "user") {
      parts.push({ inline_data: { mime_type: attachment.mimeType, data: attachment.base64 } });
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[model]}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${languageInstruction(language)}` }],
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 || res.status === 403)
      throw new Error("Your Gemini API key was rejected. Please update it in Settings.");
    if (res.status === 429) throw new Error("Your Gemini API key hit its rate limit. Try again shortly.");
    throw new Error(`Gemini request failed (${res.status}): ${text.slice(0, 160)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const reply = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  return reply || "(no response)";
}

export async function chatComplete(
  messages: Array<{ role: string; content: string }>,
  model: ModelChoice,
  language: string,
  options?: { apiKey?: string | null; attachment?: Attachment },
): Promise<string> {
  if (options?.apiKey) {
    return geminiComplete(options.apiKey, messages, model, language, options.attachment);
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");

  const last = messages[messages.length - 1];
  const gatewayMessages = messages.map((m, index) => {
    if (options?.attachment && index === messages.length - 1 && last?.role === "user") {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content },
          {
            type: "image_url",
            image_url: {
              url: `data:${options.attachment.mimeType};base64,${options.attachment.base64}`,
            },
          },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

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
        ...gatewayMessages,
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

/* ---------------- Stored generated media ---------------- */

export async function storeGenerated(
  accountId: string,
  bytes: Uint8Array,
  ext: string,
  contentType: string,
): Promise<string> {
  const admin = await getAdmin();
  const path = `${accountId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await admin.storage.from("generated").upload(path, bytes, { contentType });
  if (error) throw new Error(error.message);
  return `generated:${path}`;
}

export async function signMedia(ref: string | null): Promise<string | null> {
  if (!ref) return null;
  if (!ref.startsWith("generated:")) return ref;
  const admin = await getAdmin();
  const { data } = await admin.storage
    .from("generated")
    .createSignedUrl(ref.slice("generated:".length), 60 * 60 * 6);
  return data?.signedUrl ?? null;
}

/* ---------------- Image generation ---------------- */

export async function generateImageBytes(prompt: string): Promise<Uint8Array> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model: "lovable/image-fast", prompt, n: 1 }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
    throw new Error(`Image generation failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = json.data?.[0];
  if (item?.b64_json) return new Uint8Array(Buffer.from(item.b64_json, "base64"));
  if (item?.url) {
    const file = await fetch(item.url);
    return new Uint8Array(await file.arrayBuffer());
  }
  throw new Error("Image generation returned no image.");
}

/* ---------------- Video generation (async job) ---------------- */

function aiHeaders() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

export async function createVideoJob(prompt: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/videos", {
    method: "POST",
    headers: aiHeaders(),
    body: JSON.stringify({
      model: "google/gemini-omni-1.1-flash",
      input: prompt,
      response_format: { type: "video", resolution: "720p", duration: "6s" },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 402) throw new Error("AI credits are exhausted. Please add credits to continue.");
    if (res.status === 429) throw new Error("A video is already generating. Please wait for it to finish.");
    throw new Error(`Video generation failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const job = (await res.json()) as { id?: string };
  if (!job.id) throw new Error("Video generation did not start.");
  return job.id;
}

export async function pollVideoJob(
  id: string,
): Promise<{ status: string; bytes?: Uint8Array; error?: string }> {
  const res = await fetch(`https://ai.gateway.lovable.dev/v1/videos/${id}`, {
    headers: aiHeaders(),
  });
  if (!res.ok) throw new Error(`Could not check the video job (${res.status}).`);
  const job = (await res.json()) as {
    status?: string;
    error?: { message?: string };
  };
  if (job.status !== "completed") {
    return { status: job.status ?? "in_progress", error: job.error?.message };
  }
  const content = await fetch(`https://ai.gateway.lovable.dev/v1/videos/${id}/content`, {
    headers: aiHeaders(),
  });
  if (!content.ok) throw new Error("Could not download the generated video.");
  return { status: "completed", bytes: new Uint8Array(await content.arrayBuffer()) };
}

/* ---------------- Voice transcription ---------------- */

export async function transcribeAudio(base64: string, mimeType: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");
  const format = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: MODEL_MAP.flash,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this recording verbatim. Reply with the transcript text only, no commentary.",
            },
            { type: "input_audio", input_audio: { data: base64, format } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not transcribe the recording (${res.status}): ${text.slice(0, 160)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}
