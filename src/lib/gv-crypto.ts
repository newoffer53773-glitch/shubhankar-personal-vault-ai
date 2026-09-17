import AES from "crypto-js/aes";
import Utf8 from "crypto-js/enc-utf8";

const KEY_STORE = "gv_api_key_enc";
const VOICE_STORE = "gv_voice_pref";

// Device-bound passphrase: derived from a random per-device salt plus a static
// pepper, so the stored value is unreadable without this browser profile.
const SALT_STORE = "gv_api_key_salt";
const PEPPER = "gemini-vault-ai::shubhankar";

function passphrase(): string {
  let salt = window.localStorage.getItem(SALT_STORE);
  if (!salt) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    salt = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(SALT_STORE, salt);
  }
  return `${PEPPER}:${salt}`;
}

export function saveApiKey(key: string) {
  const cipher = AES.encrypt(key.trim(), passphrase()).toString();
  window.localStorage.setItem(KEY_STORE, cipher);
}

export function loadApiKey(): string | null {
  if (typeof window === "undefined") return null;
  const cipher = window.localStorage.getItem(KEY_STORE);
  if (!cipher) return null;
  try {
    const plain = AES.decrypt(cipher, passphrase()).toString(Utf8);
    return plain || null;
  } catch {
    return null;
  }
}

export function clearApiKey() {
  window.localStorage.removeItem(KEY_STORE);
}

export function hasApiKey(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(KEY_STORE));
}


export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}${"•".repeat(Math.max(6, key.length - 8))}${key.slice(-4)}`;
}

/* ---------------- Voice preference + speech synthesis ---------------- */

export type VoiceStyle = "male" | "female" | "kid" | "friendly" | "professional";

export const VOICE_OPTIONS: Array<{ id: VoiceStyle; label: string; hint: string }> = [
  { id: "male", label: "Male", hint: "Deeper, steady tone" },
  { id: "female", label: "Female", hint: "Softer, clear tone" },
  { id: "kid", label: "Kid", hint: "Higher pitch, playful" },
  { id: "friendly", label: "Friendly", hint: "Warm and relaxed pace" },
  { id: "professional", label: "Professional", hint: "Neutral and formal" },
];

export function loadVoice(): VoiceStyle {
  if (typeof window === "undefined") return "friendly";
  const value = window.localStorage.getItem(VOICE_STORE);
  return (VOICE_OPTIONS.find((v) => v.id === value)?.id ?? "friendly") as VoiceStyle;
}

export function saveVoice(style: VoiceStyle) {
  window.localStorage.setItem(VOICE_STORE, style);
}

const TUNING: Record<VoiceStyle, { pitch: number; rate: number; prefer: RegExp }> = {
  male: { pitch: 0.8, rate: 1, prefer: /male|david|daniel|fred|alex|ravi/i },
  female: { pitch: 1.15, rate: 1, prefer: /female|samantha|victoria|zira|google uk english female|karen/i },
  kid: { pitch: 1.7, rate: 1.1, prefer: /kid|child|junior|female/i },
  friendly: { pitch: 1.1, rate: 0.98, prefer: /samantha|google|natural|female/i },
  professional: { pitch: 1, rate: 0.94, prefer: /google|neural|english/i },
};

export function speak(text: string, style: VoiceStyle, lang: "bn" | "en") {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const tuning = TUNING[style];
  utter.pitch = tuning.pitch;
  utter.rate = tuning.rate;
  utter.lang = lang === "bn" ? "bn-IN" : "en-US";
  const voices = window.speechSynthesis.getVoices();
  const langMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const pool = langMatches.length ? langMatches : voices;
  utter.voice = pool.find((v) => tuning.prefer.test(v.name)) ?? pool[0] ?? null;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}

export function detectLang(text: string): "bn" | "en" {
  return /[\u0980-\u09FF]/.test(text) ? "bn" : "en";
}
