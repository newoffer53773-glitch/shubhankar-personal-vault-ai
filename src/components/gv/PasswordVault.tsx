import { useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { VaultNote } from "./VaultScreen";

export type Credential = { label: string; username: string; password: string; url: string };

export function parseCredential(note: VaultNote): Credential {
  try {
    const parsed = JSON.parse(note.content) as Partial<Credential>;
    return {
      label: note.title,
      username: parsed.username ?? "",
      password: parsed.password ?? "",
      url: parsed.url ?? "",
    };
  } catch {
    return { label: note.title, username: "", password: note.content, url: "" };
  }
}

export function PasswordVault({
  entries,
  loading,
  onSave,
  onDelete,
}: {
  entries: VaultNote[];
  loading: boolean;
  onSave: (title: string, content: string, id: string | null) => Promise<void> | void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<{ id: string | null; value: Credential } | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    const { label, username, password, url } = editing.value;
    if (!label.trim() || !password.trim()) {
      toast.error("Add at least a name and a password.");
      return;
    }
    setSaving(true);
    try {
      await onSave(label.trim(), JSON.stringify({ username, password, url }), editing.id);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    const v = editing.value;
    const set = (patch: Partial<Credential>) =>
      setEditing({ ...editing, value: { ...editing.value, ...patch } });
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">{editing.id ? "Edit entry" : "New password entry"}</p>
        <input
          value={v.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Name (e.g. Gmail)"
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
        />
        <input
          value={v.username}
          onChange={(e) => set({ username: e.target.value })}
          placeholder="Username or email"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
        />
        <input
          value={v.password}
          onChange={(e) => set({ password: e.target.value })}
          placeholder="Password"
          autoComplete="new-password"
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
        />
        <input
          value={v.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="Website (optional)"
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(null)}
            className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[image:var(--gradient-brand)] px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Lock & save
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setEditing({ id: null, value: { label: "", username: "", password: "", url: "" } })}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm"
      >
        <Plus className="size-4" /> New password entry
      </button>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No saved passwords yet. Everything here stays locked behind your master PIN.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const cred = parseCredential(entry);
            const open = revealed === entry.id;
            return (
              <li key={entry.id} className="rounded-2xl border border-border bg-card px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-secondary">
                    <KeyRound className="size-4 text-[color:var(--brand-2)]" />
                  </div>
                  <button
                    onClick={() => setEditing({ id: entry.id, value: cred })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm">{cred.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {cred.username || cred.url || "Tap to edit"}
                    </p>
                  </button>
                  <button
                    onClick={() => setRevealed(open ? null : entry.id)}
                    className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                    aria-label={open ? "Hide password" : "Show password"}
                  >
                    {open ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button
                    onClick={() => onDelete(entry.id)}
                    className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {open && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2">
                    <code className="flex-1 truncate text-xs">{cred.password}</code>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(cred.password);
                        toast.success("Password copied.");
                      }}
                      className="rounded-full p-1.5 hover:bg-background"
                      aria-label="Copy password"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
