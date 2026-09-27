import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import CryptoJS from "crypto-js";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  getVaultFileUrl,
  listVaultFiles,
  listVaultNotes,
  saveVaultNote,
  uploadVaultFile,
} from "@/lib/gv.functions";

type BackupFile = { name: string; mimeType: string; base64: string };
type BackupNote = { title: string; content: string; kind: "note" | "password" };
type Backup = { app: "gemini-vault-ai"; version: 1; files: BackupFile[]; notes: BackupNote[] };

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function VaultBackup({
  recoveryKey,
  pin,
  onImported,
}: {
  recoveryKey: string;
  pin: string;
  onImported: () => void;
}) {
  const listFiles = useServerFn(listVaultFiles);
  const listNotes = useServerFn(listVaultNotes);
  const fileUrl = useServerFn(getVaultFileUrl);
  const upload = useServerFn(uploadVaultFile);
  const saveNote = useServerFn(saveVaultNote);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy("Preparing backup…");
    try {
      const auth = { recoveryKey, pin };
      const [files, notes] = await Promise.all([
        listFiles({ data: auth }),
        listNotes({ data: auth }),
      ]);
      const out: BackupFile[] = [];
      for (const [i, f] of (files as Array<{ id: string; name: string; mime_type: string }>).entries()) {
        setBusy(`Packing file ${i + 1} of ${files.length}…`);
        const { url } = await fileUrl({ data: { ...auth, fileId: f.id } });
        const res = await fetch(url);
        out.push({ name: f.name, mimeType: f.mime_type, base64: await blobToBase64(await res.blob()) });
      }
      const backup: Backup = {
        app: "gemini-vault-ai",
        version: 1,
        files: out,
        notes: (notes as Array<{ title: string; content: string; kind?: string }>).map((n) => ({
          title: n.title,
          content: n.content,
          kind: n.kind === "password" ? "password" : "note",
        })),
      };
      setBusy("Encrypting…");
      const cipher = CryptoJS.AES.encrypt(JSON.stringify(backup), password).toString();
      const blob = new Blob([cipher], { type: "application/octet-stream" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `vault-backup-${new Date().toISOString().slice(0, 10)}.gvault`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Encrypted backup downloaded. Keep the backup password safe.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setBusy("Decrypting…");
    try {
      const text = await file.text();
      let backup: Backup;
      try {
        const plain = CryptoJS.AES.decrypt(text, password).toString(CryptoJS.enc.Utf8);
        backup = JSON.parse(plain);
        if (backup.app !== "gemini-vault-ai") throw new Error();
      } catch {
        throw new Error("Wrong backup password or invalid backup file.");
      }
      const auth = { recoveryKey, pin };
      for (const [i, f] of backup.files.entries()) {
        setBusy(`Restoring file ${i + 1} of ${backup.files.length}…`);
        await upload({ data: { ...auth, name: f.name, mimeType: f.mimeType, base64: f.base64 } });
      }
      for (const n of backup.notes) {
        await saveNote({ data: { ...auth, noteId: null, title: n.title, content: n.content, kind: n.kind } });
      }
      toast.success(`Imported ${backup.files.length} files and ${backup.notes.length} notes.`);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const ready = password.length >= 6 && !busy;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Backup & transfer — export an encrypted file and import it on another device (no recovery key needed, just the backup password).
      </p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Backup password (min 6 characters)"
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
      />
      <input
        ref={inputRef}
        type="file"
        accept=".gvault"
        hidden
        onChange={(e) => void handleImport(e.target.files?.[0])}
      />
      <div className="flex gap-2">
        <button
          onClick={() => void handleExport()}
          disabled={!ready}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm disabled:opacity-50"
        >
          <Download className="size-4" /> Export
        </button>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={!ready}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm disabled:opacity-50"
        >
          <Upload className="size-4" /> Import
        </button>
      </div>
      {busy && (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> {busy}
        </p>
      )}
    </div>
  );
}
