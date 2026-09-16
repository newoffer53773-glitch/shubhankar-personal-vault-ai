import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  NotebookPen,
  Plus,
  Settings,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import {
  changePin,
  deleteVaultFile,
  deleteVaultNote,
  getVaultFileUrl,
  listVaultFiles,
  listVaultNotes,
  saveVaultNote,
  uploadVaultFile,
} from "@/lib/gv.functions";
import { fileToBase64, formatBytes } from "@/lib/gv-client";
import { NoteEditor } from "./NoteEditor";

type VaultFile = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type VaultNote = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
};

type Tab = "photos" | "videos" | "docs" | "notes";

const TABS: Array<{ id: Tab; label: string; icon: typeof ImageIcon; accept: string }> = [
  { id: "photos", label: "Photos", icon: ImageIcon, accept: "image/*" },
  { id: "videos", label: "Videos", icon: Video, accept: "video/*" },
  { id: "docs", label: "Docs", icon: FileText, accept: ".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx" },
  { id: "notes", label: "Notes", icon: NotebookPen, accept: "" },
];

function categoryOf(mime: string): Exclude<Tab, "notes"> {
  if (mime.startsWith("image/")) return "photos";
  if (mime.startsWith("video/")) return "videos";
  return "docs";
}

export function VaultScreen({
  recoveryKey,
  pin,
  onExit,
}: {
  recoveryKey: string;
  pin: string;
  onExit: () => void;
}) {
  const list = useServerFn(listVaultFiles);
  const upload = useServerFn(uploadVaultFile);
  const openFile = useServerFn(getVaultFileUrl);
  const removeFile = useServerFn(deleteVaultFile);
  const doChangePin = useServerFn(changePin);
  const notesFn = useServerFn(listVaultNotes);
  const saveNoteFn = useServerFn(saveVaultNote);
  const deleteNoteFn = useServerFn(deleteVaultNote);

  const [tab, setTab] = useState<Tab>("photos");
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [editingNote, setEditingNote] = useState<VaultNote | "new" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, noteRows] = await Promise.all([
        list({ data: { recoveryKey, pin } }),
        notesFn({ data: { recoveryKey, pin } }),
      ]);
      setFiles(rows as VaultFile[]);
      setNotes(noteRows as VaultNote[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load vault.");
    } finally {
      setLoading(false);
    }
  }, [list, notesFn, recoveryKey, pin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleUpload(selected: FileList | null) {
    if (!selected?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(selected)) {
        const base64 = await fileToBase64(file);
        await upload({
          data: {
            recoveryKey,
            pin,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            base64,
          },
        });
      }
      toast.success("Moved to the encrypted cloud vault. Now delete the local copy from your gallery.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleOpen(id: string) {
    try {
      const { url } = await openFile({ data: { recoveryKey, pin, fileId: id } });
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open file.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await removeFile({ data: { recoveryKey, pin, fileId: id } });
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete file.");
    }
  }

  async function handleSaveNote(title: string, content: string) {
    try {
      const saved = await saveNoteFn({
        data: {
          recoveryKey,
          pin,
          noteId: editingNote && editingNote !== "new" ? editingNote.id : null,
          title,
          content,
        },
      });
      if (saved) {
        const note = saved as VaultNote;
        setNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)]);
      }
      setEditingNote(null);
      toast.success("Note locked in your vault.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the note.");
    }
  }

  async function handleDeleteNote(id: string) {
    try {
      await deleteNoteFn({ data: { recoveryKey, pin, noteId: id } });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the note.");
    }
  }

  async function handleChangePin() {
    try {
      await doChangePin({ data: { recoveryKey, oldPin, newPin } });
      toast.success("PIN updated. Use the new PIN next time.");
      setOldPin("");
      setNewPin("");
      setShowSettings(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change PIN.");
    }
  }

  const activeTab = TABS.find((t) => t.id === tab)!;
  const visibleFiles = tab === "notes" ? [] : files.filter((f) => categoryOf(f.mime_type) === tab);
  const itemCount = files.length + notes.length;

  if (editingNote) {
    return (
      <NoteEditor
        note={editingNote === "new" ? null : editingNote}
        onSave={(title, content) => void handleSaveNote(title, content)}
        onCancel={() => setEditingNote(null)}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/90 px-3 py-3 backdrop-blur">
        <button onClick={onExit} className="rounded-full p-2 hover:bg-secondary">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Lock className="size-3.5 text-[color:var(--brand-2)]" /> Personal Vault
          </p>
          <p className="text-[11px] text-muted-foreground">{itemCount} encrypted items</p>
        </div>
        <button onClick={() => setShowSettings((v) => !v)} className="rounded-full p-2 hover:bg-secondary">
          <Settings className="size-5" />
        </button>
      </header>

      {showSettings && (
        <div className="space-y-2 border-b border-border bg-card px-4 py-4">
          <p className="text-xs text-muted-foreground">Change master PIN (old PIN required)</p>
          <input
            value={oldPin}
            onChange={(e) => setOldPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="Old PIN"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
          />
          <input
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="New 4-digit PIN"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
          />
          <button
            onClick={handleChangePin}
            disabled={oldPin.length !== 4 || newPin.length !== 4}
            className="w-full rounded-xl bg-[image:var(--gradient-brand)] px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Update PIN
          </button>
        </div>
      )}

      <nav className="flex gap-1 border-b border-border px-3 py-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] ${
                active
                  ? "bg-secondary text-[color:var(--brand-1)]"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 px-4 py-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={activeTab.accept}
          hidden
          onChange={(e) => void handleUpload(e.target.files)}
        />

        {tab === "notes" ? (
          <>
            <button
              onClick={() => setEditingNote("new")}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm"
            >
              <Plus className="size-4" /> New secret note
            </button>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No secret notes yet. Anything you write here is locked behind your PIN.
              </p>
            ) : (
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-card px-3 py-3"
                  >
                    <button onClick={() => setEditingNote(note)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm">{note.title}</p>
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">
                        {note.content.replace(/<[^>]*>/g, " ").slice(0, 120) || "Empty note"}
                      </p>
                    </button>
                    <button
                      onClick={() => void handleDeleteNote(note.id)}
                      className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm disabled:opacity-60"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Import {activeTab.label.toLowerCase()} into the vault
            </button>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : visibleFiles.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing here yet. Files you add stay encrypted in the cloud, tied to your recovery key.
              </p>
            ) : (
              <ul className="space-y-2">
                {visibleFiles.map((file) => {
                  const Icon = activeTab.icon;
                  return (
                    <li
                      key={file.id}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3"
                    >
                      <div className="flex size-9 items-center justify-center rounded-xl bg-secondary">
                        <Icon className="size-4 text-[color:var(--brand-2)]" />
                      </div>
                      <button
                        onClick={() => void handleOpen(file.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm">{file.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatBytes(Number(file.size_bytes))} ·{" "}
                          {new Date(file.created_at).toLocaleDateString()}
                        </p>
                      </button>
                      <button
                        onClick={() => void handleDelete(file.id)}
                        className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      <p className="pb-6 text-center text-[11px] text-muted-foreground">Developed by Shubhankar</p>
    </div>
  );
}
