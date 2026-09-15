import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  chatComplete,
  createVideoJob,
  generateImageBytes,
  generateRecoveryKey,
  getAdmin,
  hash,
  normalizeKey,
  pollVideoJob,
  signMedia,
  storeGenerated,
  transcribeAudio,
} from "./gv.server";

const keySchema = z.string().min(4);
const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be 4 digits");

type AccountRow = {
  id: string;
  recovery_key: string;
  pin_hash: string | null;
  language: string;
};

async function requireAccount(rawKey: string): Promise<AccountRow> {
  const key = normalizeKey(rawKey);
  if (!key) throw new Error("Invalid recovery key format.");
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("vault_users")
    .select("id, recovery_key, pin_hash, language")
    .eq("recovery_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No account found for this recovery key.");
  return data as AccountRow;
}

async function requirePin(rawKey: string, pin: string): Promise<AccountRow> {
  const account = await requireAccount(rawKey);
  if (!account.pin_hash) throw new Error("Vault PIN is not set yet.");
  if (account.pin_hash !== hash(pin)) throw new Error("Incorrect PIN.");
  return account;
}

export const createAccount = createServerFn({ method: "POST" }).handler(async () => {
  const admin = await getAdmin();
  for (let attempt = 0; attempt < 5; attempt++) {
    const recoveryKey = generateRecoveryKey();
    const { data, error } = await admin
      .from("vault_users")
      .insert({ recovery_key: recoveryKey })
      .select("id, recovery_key")
      .maybeSingle();
    if (!error && data) return { recoveryKey: data.recovery_key as string };
  }
  throw new Error("Could not create an account. Please try again.");
});

export const restoreAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema }).parse(d))
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();
    const [{ count: chatCount }, { count: fileCount }] = await Promise.all([
      admin.from("chats").select("id", { count: "exact", head: true }).eq("user_id", account.id),
      admin.from("vault_files").select("id", { count: "exact", head: true }).eq("user_id", account.id),
    ]);
    return {
      recoveryKey: account.recovery_key,
      hasPin: Boolean(account.pin_hash),
      language: account.language,
      chats: chatCount ?? 0,
      files: fileCount ?? 0,
    };
  });

export const getAccountState = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema }).parse(d))
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    return { hasPin: Boolean(account.pin_hash), language: account.language };
  });

export const setLanguage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ recoveryKey: keySchema, language: z.enum(["auto", "bn", "en"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();
    await admin.from("vault_users").update({ language: data.language }).eq("id", account.id);
    return { ok: true };
  });

export const listChats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema }).parse(d))
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("chats")
      .select("id, title, updated_at")
      .eq("user_id", account.id)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMessages = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema, chatId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();
    const { data: chat } = await admin
      .from("chats")
      .select("id")
      .eq("id", data.chatId)
      .eq("user_id", account.id)
      .maybeSingle();
    if (!chat) throw new Error("Chat not found.");
    const { data: rows, error } = await admin
      .from("messages")
      .select("id, role, content, image_url, created_at")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return Promise.all(
      (rows ?? []).map(async (row) => ({
        ...row,
        image_url: await signMedia(row.image_url as string | null),
      })),
    );
  });

export const deleteChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema, chatId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();
    await admin.from("chats").delete().eq("id", data.chatId).eq("user_id", account.id);
    return { ok: true };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recoveryKey: keySchema,
        chatId: z.string().uuid().nullable(),
        text: z.string().min(1).max(8000),
        model: z.enum(["flash", "pro"]),
        language: z.enum(["auto", "bn", "en"]),
        apiKey: z.string().min(10).max(200).nullable().optional(),
        attachment: z
          .object({ mimeType: z.string().min(1).max(120), base64: z.string().min(4) })
          .nullable()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();

    let chatId = data.chatId;
    if (!chatId) {
      const { data: chat, error } = await admin
        .from("chats")
        .insert({ user_id: account.id, title: data.text.slice(0, 48) })
        .select("id")
        .maybeSingle();
      if (error || !chat) throw new Error(error?.message ?? "Could not start a chat.");
      chatId = chat.id as string;
    } else {
      const { data: chat } = await admin
        .from("chats")
        .select("id")
        .eq("id", chatId)
        .eq("user_id", account.id)
        .maybeSingle();
      if (!chat) throw new Error("Chat not found.");
    }

    await admin.from("messages").insert({ chat_id: chatId, role: "user", content: data.text });

    const { data: history } = await admin
      .from("messages")
      .select("role, content")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(40);

    const reply = await chatComplete(
      (history ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as string, content: m.content as string })),
      data.model,
      data.language,
      { apiKey: data.apiKey ?? null, attachment: data.attachment ?? undefined },
    );

    const { data: saved } = await admin
      .from("messages")
      .insert({ chat_id: chatId, role: "assistant", content: reply })
      .select("id, role, content, image_url, created_at")
      .maybeSingle();

    await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

    return { chatId, message: saved };
  });

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recoveryKey: keySchema,
        chatId: z.string().uuid().nullable(),
        prompt: z.string().min(2).max(1200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();

    let chatId = data.chatId;
    if (!chatId) {
      const { data: chat, error } = await admin
        .from("chats")
        .insert({ user_id: account.id, title: `Image: ${data.prompt.slice(0, 40)}` })
        .select("id")
        .maybeSingle();
      if (error || !chat) throw new Error(error?.message ?? "Could not start a chat.");
      chatId = chat.id as string;
    }

    await admin
      .from("messages")
      .insert({ chat_id: chatId, role: "user", content: `🖼️ ${data.prompt}` });

    const bytes = await generateImageBytes(data.prompt);
    const ref = await storeGenerated(account.id, bytes, "png", "image/png");

    const { data: saved } = await admin
      .from("messages")
      .insert({
        chat_id: chatId,
        role: "assistant",
        content: "Here is your generated image.",
        image_url: ref,
      })
      .select("id, role, content, image_url, created_at")
      .maybeSingle();

    await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

    return {
      chatId,
      message: saved ? { ...saved, image_url: await signMedia(saved.image_url as string | null) } : null,
    };
  });

/* ---------------- Vault ---------------- */

export const setPin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema, pin: pinSchema }).parse(d))
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    if (account.pin_hash) throw new Error("A PIN is already set.");
    const admin = await getAdmin();
    await admin.from("vault_users").update({ pin_hash: hash(data.pin) }).eq("id", account.id);
    return { ok: true };
  });

export const changePin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ recoveryKey: keySchema, oldPin: pinSchema, newPin: pinSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requirePin(data.recoveryKey, data.oldPin);
    const admin = await getAdmin();
    await admin.from("vault_users").update({ pin_hash: hash(data.newPin) }).eq("id", account.id);
    return { ok: true };
  });

export const unlockVault = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema, pin: pinSchema }).parse(d))
  .handler(async ({ data }) => {
    await requirePin(data.recoveryKey, data.pin);
    return { ok: true };
  });

export const listVaultFiles = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema, pin: pinSchema }).parse(d))
  .handler(async ({ data }) => {
    const account = await requirePin(data.recoveryKey, data.pin);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("vault_files")
      .select("id, name, mime_type, size_bytes, created_at")
      .eq("user_id", account.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const uploadVaultFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recoveryKey: keySchema,
        pin: pinSchema,
        name: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(120),
        base64: z.string().min(4),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requirePin(data.recoveryKey, data.pin);
    const admin = await getAdmin();

    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength > 45 * 1024 * 1024) throw new Error("File is larger than 45 MB.");

    const safeName = data.name.replace(/[^\w.\-() ]/g, "_");
    const storagePath = `${account.id}/${Date.now()}-${safeName}`;

    const { error: upErr } = await admin.storage.from("vault").upload(storagePath, bytes, {
      contentType: data.mimeType,
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    const { data: row, error } = await admin
      .from("vault_files")
      .insert({
        user_id: account.id,
        name: data.name,
        mime_type: data.mimeType,
        size_bytes: bytes.byteLength,
        storage_path: storagePath,
      })
      .select("id, name, mime_type, size_bytes, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const getVaultFileUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ recoveryKey: keySchema, pin: pinSchema, fileId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requirePin(data.recoveryKey, data.pin);
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("vault_files")
      .select("storage_path")
      .eq("id", data.fileId)
      .eq("user_id", account.id)
      .maybeSingle();
    if (!row) throw new Error("File not found.");
    const { data: signed, error } = await admin.storage
      .from("vault")
      .createSignedUrl(row.storage_path as string, 60 * 10);
    if (error || !signed) throw new Error(error?.message ?? "Could not open file.");
    return { url: signed.signedUrl };
  });

export const deleteVaultFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ recoveryKey: keySchema, pin: pinSchema, fileId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requirePin(data.recoveryKey, data.pin);
    const admin = await getAdmin();
    const { data: row } = await admin
      .from("vault_files")
      .select("storage_path")
      .eq("id", data.fileId)
      .eq("user_id", account.id)
      .maybeSingle();
    if (!row) throw new Error("File not found.");
    await admin.storage.from("vault").remove([row.storage_path as string]);
    await admin.from("vault_files").delete().eq("id", data.fileId).eq("user_id", account.id);
    return { ok: true };
  });

/* ---------------- Video generation ---------------- */

export const startVideoGeneration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recoveryKey: keySchema,
        chatId: z.string().uuid().nullable(),
        prompt: z.string().min(2).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();

    let chatId = data.chatId;
    if (!chatId) {
      const { data: chat, error } = await admin
        .from("chats")
        .insert({ user_id: account.id, title: `Video: ${data.prompt.slice(0, 40)}` })
        .select("id")
        .maybeSingle();
      if (error || !chat) throw new Error(error?.message ?? "Could not start a chat.");
      chatId = chat.id as string;
    }

    await admin.from("messages").insert({ chat_id: chatId, role: "user", content: `🎬 ${data.prompt}` });
    const jobId = await createVideoJob(data.prompt);
    return { chatId, jobId };
  });

export const checkVideoGeneration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recoveryKey: keySchema,
        chatId: z.string().uuid(),
        jobId: z.string().min(4).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requireAccount(data.recoveryKey);
    const admin = await getAdmin();

    const job = await pollVideoJob(data.jobId);
    if (job.status === "failed") throw new Error(job.error ?? "Video generation failed.");
    if (job.status !== "completed" || !job.bytes) return { status: job.status, message: null };

    const ref = await storeGenerated(account.id, job.bytes, "mp4", "video/mp4");
    const { data: saved } = await admin
      .from("messages")
      .insert({
        chat_id: data.chatId,
        role: "assistant",
        content: "Here is your generated video.",
        image_url: ref,
      })
      .select("id, role, content, image_url, created_at")
      .maybeSingle();
    await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", data.chatId);

    return {
      status: "completed",
      message: saved ? { ...saved, image_url: await signMedia(saved.image_url as string | null) } : null,
    };
  });

/* ---------------- Voice transcription fallback ---------------- */

export const transcribeVoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recoveryKey: keySchema,
        mimeType: z.string().min(1).max(120),
        base64: z.string().min(16),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAccount(data.recoveryKey);
    const text = await transcribeAudio(data.base64, data.mimeType);
    return { text };
  });

/* ---------------- Secret notes ---------------- */

export const listVaultNotes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ recoveryKey: keySchema, pin: pinSchema }).parse(d))
  .handler(async ({ data }) => {
    const account = await requirePin(data.recoveryKey, data.pin);
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("vault_notes")
      .select("id, title, content, updated_at")
      .eq("user_id", account.id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveVaultNote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recoveryKey: keySchema,
        pin: pinSchema,
        noteId: z.string().uuid().nullable(),
        title: z.string().max(160),
        content: z.string().max(40000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requirePin(data.recoveryKey, data.pin);
    const admin = await getAdmin();
    const title = data.title.trim() || "Untitled note";

    if (data.noteId) {
      const { data: row, error } = await admin
        .from("vault_notes")
        .update({ title, content: data.content, updated_at: new Date().toISOString() })
        .eq("id", data.noteId)
        .eq("user_id", account.id)
        .select("id, title, content, updated_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Note not found.");
      return row;
    }

    const { data: row, error } = await admin
      .from("vault_notes")
      .insert({ user_id: account.id, title, content: data.content })
      .select("id, title, content, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteVaultNote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ recoveryKey: keySchema, pin: pinSchema, noteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const account = await requirePin(data.recoveryKey, data.pin);
    const admin = await getAdmin();
    await admin.from("vault_notes").delete().eq("id", data.noteId).eq("user_id", account.id);
    return { ok: true };
  });
