import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Music,
  Settings,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import {
  changePin,
  deleteVaultFile,
  getVaultFileUrl,
  listVaultFiles,
  uploadVaultFile,
} from "@/lib/gv.functions";
import { fileToBase64, formatBytes } from "@/lib/gv-client";

type VaultFile = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("video/")) return Video;
  if (mime.startsWith("audio/")) return Music;
  return FileText;
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

  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await list({ data: { recoveryKey, pin } });
      setFiles(rows as VaultFile[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load vault.");
    } finally {
      setLoading(false);
    }
  }, [list, recoveryKey, pin]);

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
      toast.success("Moved to cloud vault. Now delete the local copy from your gallery.");
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
          <p className="text-[11px] text-muted-foreground">{files.length} encrypted cloud items</p>
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

      <main className="flex-1 px-4 py-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => void handleUpload(e.target.files)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Move photos, videos, audio or documents to the vault
        </button>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Your vault is empty. Anything you add here stays encrypted in the cloud, tied to your
            recovery key.
          </p>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => {
              const Icon = iconFor(file.mime_type);
              return (
                <li
                  key={file.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3"
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-secondary">
                    <Icon className="size-4 text-[color:var(--brand-2)]" />
                  </div>
                  <button onClick={() => void handleOpen(file.id)} className="min-w-0 flex-1 text-left">
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
      </main>

      <p className="pb-6 text-center text-[11px] text-muted-foreground">Developed by Shubhankar</p>
    </div>
  );
}
