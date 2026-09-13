export const KEY_STORAGE = "gv_recovery_key";

export type Lang = "auto" | "bn" | "en";
export type ModelChoice = "flash" | "pro";

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  image_url: string | null;
  created_at: string;
};

export function loadKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY_STORAGE);
}

export function saveKey(key: string) {
  window.localStorage.setItem(KEY_STORAGE, key);
}

export function clearKey() {
  window.localStorage.removeItem(KEY_STORAGE);
}

const VAULT_TRIGGERS = [
  "আমার পার্সোনাল ভল্ট খোলো",
  "আমার পারসোনাল ভল্ট খোলো",
  "ভল্ট খোলো",
  "open my personal vault",
  "open my vault",
];

export function isVaultCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  return VAULT_TRIGGERS.some((trigger) => t.includes(trigger.toLowerCase()));
}

const IMAGE_TRIGGERS = [/^\/image\s+/i, /^generate an image of\s+/i, /^ছবি বানাও\s*/];

export function extractImagePrompt(text: string): string | null {
  for (const re of IMAGE_TRIGGERS) {
    if (re.test(text)) return text.replace(re, "").trim() || null;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
