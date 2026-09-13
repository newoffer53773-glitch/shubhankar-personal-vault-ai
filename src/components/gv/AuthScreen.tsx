import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Loader2, ShieldCheck, Sparkle } from "lucide-react";
import { toast } from "sonner";

import { createAccount, restoreAccount } from "@/lib/gv.functions";
import { saveKey } from "@/lib/gv-client";

export function AuthScreen({ onReady }: { onReady: (key: string) => void }) {
  const create = useServerFn(createAccount);
  const restore = useServerFn(restoreAccount);
  const [mode, setMode] = useState<"welcome" | "created" | "restore">("welcome");
  const [newKey, setNewKey] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    try {
      const res = await create();
      setNewKey(res.recoveryKey);
      setMode("created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    try {
      const res = await restore({ data: { recoveryKey: input } });
      saveKey(res.recoveryKey);
      toast.success(`Restored ${res.chats} chats and ${res.files} vault files.`);
      onReady(res.recoveryKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-brand)]">
            <Sparkle className="size-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Gemini Vault AI</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Anonymous AI assistant with an encrypted cloud vault. No email, no phone number.
          </p>
        </div>

        {mode === "welcome" && (
          <div className="space-y-3">
            <button
              onClick={handleCreate}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[image:var(--gradient-brand)] px-4 py-3.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Create a new anonymous account
            </button>
            <button
              onClick={() => setMode("restore")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-medium"
            >
              <KeyRound className="size-4" />
              I already have a Recovery Key
            </button>
          </div>
        )}

        {mode === "created" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 text-center">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Your Secret Recovery Key
              </p>
              <p className="mt-3 font-mono text-2xl tracking-[0.18em] text-foreground">{newKey}</p>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(newKey);
                  toast.success("Recovery key copied.");
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs"
              >
                <Copy className="size-3.5" /> Copy key
              </button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Save this key somewhere safe. It is the only way to restore your chats and vault files on
              another device — for up to 10 years. If you lose it, your data cannot be recovered.
            </p>
            <button
              onClick={() => {
                saveKey(newKey);
                onReady(newKey);
              }}
              className="w-full rounded-2xl bg-[image:var(--gradient-brand)] px-4 py-3.5 text-sm font-medium text-primary-foreground"
            >
              I saved it — continue
            </button>
          </div>
        )}

        {mode === "restore" && (
          <div className="space-y-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="A8F9-4K2P-90X1"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-center font-mono text-lg tracking-[0.18em] outline-none focus:border-ring"
            />
            <button
              onClick={handleRestore}
              disabled={busy || input.replace(/[^A-Z0-9]/g, "").length !== 12}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[image:var(--gradient-brand)] px-4 py-3.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Restore my data
            </button>
            <button
              onClick={() => setMode("welcome")}
              className="w-full rounded-2xl px-4 py-3 text-sm text-muted-foreground"
            >
              Back
            </button>
          </div>
        )}

        <p className="mt-10 text-center text-[11px] text-muted-foreground">Developed by Shubhankar</p>
      </div>
    </div>
  );
}
