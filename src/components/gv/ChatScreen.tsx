import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  ChevronDown,
  Copy,
  Film,
  Globe,
  Image as ImageIcon,
  Images,
  Keyboard,
  Loader2,
  Lock,
  Menu,
  Mic,
  MicOff,
  Plus,
  Send,
  Settings,
  Sparkle,
  SquarePlay,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  checkVideoGeneration,
  deleteChat as deleteChatFn,
  generateImage,
  listChats,
  listMessages,
  sendMessage,
  setLanguage as setLanguageFn,
  startVideoGeneration,
  transcribeVoice,
} from "@/lib/gv.functions";
import {
  extractImagePrompt,
  fileToBase64,
  isVaultCommand,
  type ChatMessage,
  type Lang,
  type ModelChoice,
} from "@/lib/gv-client";
import { detectLang, speak, stopSpeaking, type VoiceStyle } from "@/lib/gv-crypto";
import { BengaliKeyboard } from "./BengaliKeyboard";

type ChatSummary = { id: string; title: string; updated_at: string };
type Attachment = { mimeType: string; base64: string; name: string };

const MODEL_LABELS: Record<ModelChoice, string> = {
  flash: "Gemini 1.5 Flash",
  pro: "Gemini 1.5 Pro",
};

const LANG_LABELS: Record<Lang, string> = {
  auto: "Auto-detect",
  bn: "Bengali Mode",
  en: "English Mode",
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function isVideoUrl(url: string) {
  return /\.mp4(\?|$)/i.test(url);
}

export function ChatScreen({
  recoveryKey,
  language,
  apiKey,
  voice,
  onLanguageChange,
  onVaultCommand,
  onOpenSettings,
  onSignOut,
}: {
  recoveryKey: string;
  language: Lang;
  apiKey: string | null;
  voice: VoiceStyle;
  onLanguageChange: (lang: Lang) => void;
  onVaultCommand: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  const send = useServerFn(sendMessage);
  const genImage = useServerFn(generateImage);
  const startVideo = useServerFn(startVideoGeneration);
  const checkVideo = useServerFn(checkVideoGeneration);
  const transcribe = useServerFn(transcribeVoice);
  const chatsFn = useServerFn(listChats);
  const messagesFn = useServerFn(listMessages);
  const removeChat = useServerFn(deleteChatFn);
  const saveLanguage = useServerFn(setLanguageFn);

  const [model, setModel] = useState<ModelChoice>("flash");
  const [modelOpen, setModelOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [thinking, setThinking] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Thinking…");
  const [listening, setListening] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [showBnKeyboard, setShowBnKeyboard] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const loadChats = useCallback(async () => {
    try {
      const rows = await chatsFn({ data: { recoveryKey } });
      setChats(rows as ChatSummary[]);
    } catch {
      /* ignore */
    }
  }, [chatsFn, recoveryKey]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Live mode: camera preview
  useEffect(() => {
    if (!liveMode) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        toast.error("Camera permission is needed for Live Mode.");
        setLiveMode(false);
      });
    return () => {
      cancelled = true;
    };
  }, [liveMode]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop();
      stopSpeaking();
    },
    [],
  );

  async function openChat(id: string) {
    setDrawerOpen(false);
    setChatId(id);
    try {
      const rows = await messagesFn({ data: { recoveryKey, chatId: id } });
      setMessages(rows as ChatMessage[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load chat.");
    }
  }

  function newChat() {
    setChatId(null);
    setMessages([]);
    setDrawerOpen(false);
  }

  function pushLocal(role: string, content: string, imageUrl: string | null = null) {
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${Math.random()}`,
        role,
        content,
        image_url: imageUrl,
        created_at: new Date().toISOString(),
      },
    ]);
  }

  async function handleGallery(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Please pick a photo or video under 12 MB.");
      return;
    }
    const base64 = await fileToBase64(file);
    setAttachment({
      mimeType: file.type || "application/octet-stream",
      base64,
      name: file.name,
    });
    if (galleryRef.current) galleryRef.current.value = "";
  }

  function captureSnapshot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 540;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setAttachment({
      mimeType: "image/jpeg",
      base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      name: "live-snapshot.jpg",
    });
    toast.success("Snapshot captured — ask about what the camera sees.");
  }

  async function runVideoGeneration(prompt: string) {
    setBusyLabel("Generating video… this takes a minute or two");
    const { chatId: id, jobId } = await startVideo({ data: { recoveryKey, chatId, prompt } });
    setChatId(id);
    pushLocal("user", `🎬 ${prompt}`);

    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 7000));
      const res = await checkVideo({ data: { recoveryKey, chatId: id, jobId } });
      if (res.status === "completed") {
        if (res.message) setMessages((prev) => [...prev, res.message as ChatMessage]);
        void loadChats();
        return;
      }
    }
    throw new Error("Video generation is taking too long. Please try again.");
  }

  async function handleSubmit(rawText?: string) {
    const text = (rawText ?? input).trim();
    if ((!text && !attachment) || thinking) return;

    if (text && isVaultCommand(text)) {
      setInput("");
      pushLocal("user", text);
      pushLocal("assistant", "ভল্ট আনলক করার জন্য আপনার মাস্টার পিন দিন। 🔒");
      onVaultCommand();
      return;
    }

    setInput("");
    setThinking(true);
    setBusyLabel("Thinking…");

    const imagePrompt = extractImagePrompt(text);
    const videoPrompt = /^\/video\s+/i.test(text) ? text.replace(/^\/video\s+/i, "").trim() : null;
    const pending = attachment;

    try {
      if (videoPrompt) {
        await runVideoGeneration(videoPrompt);
        return;
      }

      if (imagePrompt) {
        setBusyLabel("Generating image…");
        pushLocal("user", `🖼️ ${imagePrompt}`);
        const res = await genImage({ data: { recoveryKey, chatId, prompt: imagePrompt } });
        setChatId(res.chatId);
        if (res.message) setMessages((prev) => [...prev, res.message as ChatMessage]);
        void loadChats();
        return;
      }

      pushLocal(
        "user",
        pending ? `${text || "What do you see here?"}\n📎 ${pending.name}` : text,
        pending?.mimeType.startsWith("image/")
          ? `data:${pending.mimeType};base64,${pending.base64}`
          : null,
      );
      setAttachment(null);

      const res = await send({
        data: {
          recoveryKey,
          chatId,
          text: text || "Describe this attachment in detail.",
          model,
          language,
          apiKey,
          attachment: pending ? { mimeType: pending.mimeType, base64: pending.base64 } : null,
        },
      });
      setChatId(res.chatId);
      if (res.message) setMessages((prev) => [...prev, res.message as ChatMessage]);
      void loadChats();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setThinking(false);
    }
  }

  /* -------- Voice input: Web Speech, with a Gemini transcription fallback -------- */

  async function recordAndTranscribe() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1200) return;
        try {
          setThinking(true);
          setBusyLabel("Transcribing your voice…");
          const base64 = await fileToBase64(new File([blob], "voice.webm", { type: blob.type }));
          const { text } = await transcribe({
            data: { recoveryKey, mimeType: blob.type, base64 },
          });
          setThinking(false);
          if (text) await handleSubmit(text);
          else toast.error("Could not hear anything in that recording.");
        } catch (error) {
          setThinking(false);
          toast.error(error instanceof Error ? error.message : "Voice input failed.");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch {
      toast.error("Microphone permission is needed for voice input.");
    }
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      recorderRef.current?.stop();
      recorderRef.current = null;
      setListening(false);
      return;
    }

    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
      | (new () => SpeechRecognitionLike)
      | undefined;

    if (!Ctor) {
      void recordAndTranscribe();
      return;
    }

    const recognition = new Ctor();
    recognition.lang = language === "en" ? "en-US" : "bn-BD";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) void handleSubmit(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      void recordAndTranscribe();
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function toggleSpeak(message: ChatMessage) {
    if (speakingId === message.id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    const spokenLang = language === "auto" ? detectLang(message.content) : language;
    const ok = speak(message.content, voice, spokenLang);
    if (!ok) {
      toast.error("Speech is not supported in this browser.");
      return;
    }
    setSpeakingId(message.id);
  }

  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy the text.");
    }
  }

  async function pickLanguage(lang: Lang) {
    setLangOpen(false);
    onLanguageChange(lang);
    try {
      await saveLanguage({ data: { recoveryKey, language: lang } });
    } catch {
      /* non-blocking */
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-border bg-background/90 px-2 py-2.5 backdrop-blur">
        <button onClick={() => setDrawerOpen(true)} className="rounded-full p-2 hover:bg-secondary">
          <Menu className="size-5" />
        </button>
        <div className="relative flex-1">
          <button
            onClick={() => setModelOpen((v) => !v)}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[15px] font-medium hover:bg-secondary"
          >
            {MODEL_LABELS[model]}
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
          {modelOpen && (
            <div className="absolute left-0 top-11 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              {(["flash", "pro"] as ModelChoice[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setModel(m);
                    setModelOpen(false);
                  }}
                  className={`flex w-full flex-col items-start px-4 py-3 text-left text-sm hover:bg-secondary ${
                    model === m ? "text-[color:var(--brand-1)]" : ""
                  }`}
                >
                  {MODEL_LABELS[m]}
                  <span className="text-[11px] text-muted-foreground">
                    {m === "flash" ? "Fast everyday answers" : "Deeper reasoning"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setLiveMode((v) => !v)}
          className={`rounded-full p-2 ${liveMode ? "bg-secondary text-[color:var(--brand-1)]" : "hover:bg-secondary"}`}
          aria-label="Live mode"
        >
          <SquarePlay className="size-5" />
        </button>
        <button onClick={onOpenSettings} className="rounded-full p-2 hover:bg-secondary" aria-label="Settings">
          <Settings className="size-5" />
        </button>
      </header>

      {liveMode && (
        <div className="relative mx-3 mt-3 overflow-hidden rounded-2xl border border-border">
          <video ref={videoRef} autoPlay playsInline muted className="h-48 w-full bg-black object-cover" />
          <button
            onClick={() => setLiveMode(false)}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5"
          >
            <X className="size-4 text-white" />
          </button>
          <span className="absolute bottom-2 left-3 text-[11px] text-white/80">Live Mode</span>
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              onClick={captureSnapshot}
              className="flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-black"
            >
              <Camera className="size-3.5" /> Snapshot
            </button>
            <button
              onClick={toggleMic}
              className="flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-black"
            >
              <Mic className="size-3.5" /> Ask
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[image:var(--gradient-brand)]">
              <Sparkle className="size-6 text-primary-foreground" />
            </div>
            <h2 className="bg-[image:var(--gradient-brand)] bg-clip-text text-2xl font-semibold text-transparent">
              Hello there
            </h2>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Ask anything, attach a photo or video, speak with the mic, create images with{" "}
              <code>/image</code>, videos with <code>/video</code>, or say “আমার পার্সোনাল ভল্ট খোলো”.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%]">
                    {message.image_url && (
                      <img
                        src={message.image_url}
                        alt="Attached"
                        className="mb-1 w-full rounded-2xl border border-border"
                      />
                    )}
                    <p className="whitespace-pre-wrap rounded-3xl bg-primary px-4 py-2.5 text-[15px] text-primary-foreground">
                      {message.content}
                    </p>
                  </div>
                </div>
              ) : (
                <div key={message.id} className="flex gap-2.5">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-brand)]">
                    <Sparkle className="size-3.5 text-primary-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                      {message.content}
                    </p>
                    {message.image_url &&
                      (isVideoUrl(message.image_url) ? (
                        <video
                          src={message.image_url}
                          controls
                          playsInline
                          className="mt-2 w-full max-w-xs rounded-2xl border border-border"
                        />
                      ) : (
                        <img
                          src={message.image_url}
                          alt="AI generated"
                          className="mt-2 w-full max-w-xs rounded-2xl border border-border"
                        />
                      ))}
                    <div className="mt-1.5 flex gap-1">
                      <button
                        onClick={() => toggleSpeak(message)}
                        className={`rounded-full p-1.5 hover:bg-secondary ${
                          speakingId === message.id
                            ? "text-[color:var(--brand-1)]"
                            : "text-muted-foreground"
                        }`}
                        aria-label="Read aloud"
                      >
                        <Volume2 className="size-4" />
                      </button>
                      <button
                        onClick={() => void copyMessage(message.content)}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                        aria-label="Copy text"
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )}
            {thinking && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {busyLabel}
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="sticky bottom-0 space-y-2 border-t border-border bg-background/95 px-3 pb-3 pt-2 backdrop-blur">
        {showBnKeyboard && (
          <BengaliKeyboard
            onInsert={(char) => setInput((prev) => prev + char)}
            onBackspace={() => setInput((prev) => prev.slice(0, -1))}
          />
        )}

        {attachment && (
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs">
            <Images className="size-4 text-[color:var(--brand-2)]" />
            <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
            <button
              onClick={() => setAttachment(null)}
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
              aria-label="Remove attachment"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <input
          ref={galleryRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => void handleGallery(e.target.files)}
        />

        <div className="flex items-end gap-1 rounded-3xl border border-border bg-card px-2 py-1.5">
          <div className="relative">
            <button
              onClick={() => setLangOpen((v) => !v)}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
              aria-label="Language"
            >
              <Globe className="size-5" />
            </button>
            {langOpen && (
              <div className="absolute bottom-12 left-0 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                {(["auto", "bn", "en"] as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => void pickLanguage(l)}
                    className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-secondary ${
                      language === l ? "text-[color:var(--brand-1)]" : ""
                    }`}
                  >
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => galleryRef.current?.click()}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
            aria-label="Attach photo or video"
          >
            <Images className="size-5" />
          </button>
          <button
            onClick={() => setShowBnKeyboard((v) => !v)}
            className={`rounded-full p-2 ${showBnKeyboard ? "text-[color:var(--brand-1)]" : "text-muted-foreground"} hover:bg-secondary`}
            aria-label="Bengali keyboard"
          >
            <Keyboard className="size-5" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            rows={1}
            placeholder="Ask Gemini Vault AI…"
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => void handleSubmit(`/image ${input.trim()}`)}
            disabled={!input.trim() || thinking}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary disabled:opacity-40"
            aria-label="Generate image"
          >
            <ImageIcon className="size-5" />
          </button>
          <button
            onClick={() => void handleSubmit(`/video ${input.trim()}`)}
            disabled={!input.trim() || thinking}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary disabled:opacity-40"
            aria-label="Generate video"
          >
            <Film className="size-5" />
          </button>
          {input.trim() || attachment ? (
            <button
              onClick={() => void handleSubmit()}
              disabled={thinking}
              className="rounded-full bg-[image:var(--gradient-brand)] p-2 text-primary-foreground disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="size-4" />
            </button>
          ) : (
            <button
              onClick={toggleMic}
              className={`rounded-full p-2 ${listening ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              aria-label="Voice input"
            >
              {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Developed by Shubhankar</p>
      </footer>

      {drawerOpen && (
        <div className="fixed inset-0 z-30 flex">
          <div className="w-72 max-w-[80%] overflow-y-auto bg-card p-3">
            <button
              onClick={newChat}
              className="mb-3 flex w-full items-center gap-2 rounded-2xl bg-secondary px-3 py-2.5 text-sm"
            >
              <Plus className="size-4" /> New chat
            </button>
            <p className="px-1 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Recent</p>
            <ul className="space-y-1">
              {chats.map((chat) => (
                <li key={chat.id} className="flex items-center gap-1">
                  <button
                    onClick={() => void openChat(chat.id)}
                    className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary ${
                      chatId === chat.id ? "bg-secondary" : ""
                    }`}
                  >
                    {chat.title}
                  </button>
                  <button
                    onClick={async () => {
                      await removeChat({ data: { recoveryKey, chatId: chat.id } });
                      if (chatId === chat.id) newChat();
                      void loadChats();
                    }}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={onVaultCommand}
              className="mt-4 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
            >
              <Lock className="size-4" /> Personal Vault
            </button>
            <button
              onClick={onOpenSettings}
              className="mt-1 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
            >
              <Settings className="size-4" /> Settings
            </button>
            <button
              onClick={onSignOut}
              className="mt-1 w-full rounded-2xl px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-secondary"
            >
              Sign out of this device
            </button>
          </div>
          <button className="flex-1 bg-black/50" onClick={() => setDrawerOpen(false)} aria-label="Close" />
        </div>
      )}
    </div>
  );
}
