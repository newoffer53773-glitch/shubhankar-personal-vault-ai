import { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { saveApiKey } from "@/lib/gv-crypto";

export function ApiKeyScreen({ onDone }: { onDone: (key: string | null) => void }) {
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);

  function save() {
    const key = value.trim();
    if (key.length < 20) {
      toast.error("That does not look like a valid Gemini API key.");
      return;
    }
    saveApiKey(key);
    toast.success("API key encrypted and saved on this device.");
    onDone(key);
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-[image:var(--gradient-brand)]">
          <KeyRound className="size-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">Connect your Gemini key</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste your Gemini 1.5 API key once. It is encrypted with AES before it is stored on this
          device, so nobody else can read it — not even from your browser storage.
        </p>

        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => setReveal((v) => !v)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label={reveal ? "Hide key" : "Show key"}
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        <button
          onClick={save}
          className="mt-4 w-full rounded-2xl bg-[image:var(--gradient-brand)] px-4 py-3 text-sm font-medium text-primary-foreground"
        >
          Encrypt & save key
        </button>

        <button
          onClick={() => onDone(null)}
          className="mt-3 w-full rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-secondary"
        >
          Skip for now — use the built-in AI
        </button>

        <p className="mt-6 flex items-start gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[color:var(--brand-2)]" />
          Your key never leaves your device unencrypted and is only used to talk to Gemini for your
          own chats.
        </p>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">Developed by Shubhankar</p>
      </div>
    </div>
  );
}
