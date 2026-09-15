import { useState } from "react";
import { Check, KeyRound, Volume2, X } from "lucide-react";
import { toast } from "sonner";

import {
  VOICE_OPTIONS,
  clearApiKey,
  maskApiKey,
  saveApiKey,
  saveVoice,
  speak,
  type VoiceStyle,
} from "@/lib/gv-crypto";

export function SettingsSheet({
  apiKey,
  voice,
  onApiKeyChange,
  onVoiceChange,
  onClose,
}: {
  apiKey: string | null;
  voice: VoiceStyle;
  onApiKeyChange: (key: string | null) => void;
  onVoiceChange: (voice: VoiceStyle) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function saveKey() {
    const key = draft.trim();
    if (key.length < 20) {
      toast.error("That does not look like a valid Gemini API key.");
      return;
    }
    saveApiKey(key);
    onApiKeyChange(key);
    setDraft("");
    setEditing(false);
    toast.success("API key updated and re-encrypted.");
  }

  function removeKey() {
    clearApiKey();
    onApiKeyChange(null);
    toast.success("API key removed. The built-in AI will be used.");
  }

  function pickVoice(style: VoiceStyle) {
    saveVoice(style);
    onVoiceChange(style);
    speak("This is how I will sound.", style, "en");
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-3">
        <button onClick={onClose} className="rounded-full p-2 hover:bg-secondary" aria-label="Close settings">
          <X className="size-5" />
        </button>
        <p className="text-sm font-medium">Settings</p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="size-4 text-[color:var(--brand-2)]" /> Gemini API key
          </p>
          <div className="rounded-2xl border border-border bg-card px-3 py-3">
            <p className="break-all font-mono text-xs text-muted-foreground">
              {apiKey ? maskApiKey(apiKey) : "No key saved — using the built-in AI"}
            </p>
            {editing ? (
              <div className="mt-3 space-y-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  type="password"
                  placeholder="Paste new key"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveKey}
                    className="flex-1 rounded-xl bg-[image:var(--gradient-brand)] px-3 py-2.5 text-sm font-medium text-primary-foreground"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setDraft("");
                    }}
                    className="rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-xl bg-secondary px-3 py-2 text-xs"
                >
                  {apiKey ? "Update key" : "Add key"}
                </button>
                {apiKey && (
                  <button
                    onClick={removeKey}
                    className="rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <section>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Volume2 className="size-4 text-[color:var(--brand-2)]" /> Voice selection
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {VOICE_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => pickVoice(option.id)}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left last:border-0 hover:bg-secondary"
              >
                <span
                  className={`flex size-4 items-center justify-center rounded-full border ${
                    voice === option.id
                      ? "border-transparent bg-[image:var(--gradient-brand)]"
                      : "border-border"
                  }`}
                >
                  {voice === option.id && <Check className="size-3 text-primary-foreground" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm">{option.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tap any option to hear a preview. Used for the speaker button under AI replies.
          </p>
        </section>

        <p className="pb-4 text-center text-[11px] text-muted-foreground">Developed by Shubhankar</p>
      </div>
    </div>
  );
}
