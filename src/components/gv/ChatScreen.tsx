import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  Globe,
  Image as ImageIcon,
  Keyboard,
  Lock,
  Menu,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkle,
  SquarePlay,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteChat as deleteChatFn,
  generateImage,
  listChats,
  listMessages,
  sendMessage,
  setLanguage as setLanguageFn,
} from "@/lib/gv.functions";
import {
  extractImagePrompt,
  isVaultCommand,
  type ChatMessage,
  type Lang,
  type ModelChoice,
} from "@/lib/gv-client";
import { BengaliKeyboard } from "./BengaliKeyboard";

type ChatSummary = { id: string; title: string; updated_at: string };

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

export function ChatScreen({
  recoveryKey,
  language,
  onLanguageChange,
  onVaultCommand,
  onSignOut,
}: {
  recoveryKey: string;
  language: Lang;
  onLanguageChange: (lang: Lang) => void;
  onVaultCommand: () => void;
  onSignOut: () => void;
}) {
  const send = useServerFn(sendMessage);
  const genImage = useServerFn(generateImage);
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
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveVideo, setLiveVideo] = useState(false);
  const [showBnKeyboard, setShowBnKeyboard] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  // Live video mode: camera preview
  useEffect(() => {
    if (!liveVideo) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        toast.error("Camera permission is needed for Live Video Mode.");
        setLiveVideo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [liveVideo]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop();
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

  async function handleSubmit(rawText?: string) {
    const text = (rawText ?? input).trim();
    if (!text || thinking) return;

    if (isVaultCommand(text)) {
      setInput("");
      pushLocal("user", text);
      pushLocal("assistant", "ভল্ট আনলক করার জন্য আপনার মাস্টার পিন দিন। 🔒");
      onVaultCommand();
      return;
    }

    setInput("");
    setThinking(true);

    const imagePrompt = extractImagePrompt(text);
    const videoPrompt = /^\/video\s+/i.test(text) ? text.replace(/^\/video\s+/i, "").trim() : null;

    try {
      if (videoPrompt) {
        pushLocal("user", `🎬 ${videoPrompt}`);
        pushLocal(
          "assistant",
          "Video generation is queued through the AI video API placeholder. Image generation is live — try /image " +
            videoPrompt,
        );
        return;
      }

      if (imagePrompt) {
        pushLocal("user", `🖼️ ${imagePrompt}`);
        const res = await genImage({ data: { recoveryKey, chatId, prompt: imagePrompt } });
        setChatId(res.chatId);
        if (res.message) setMessages((prev) => [...prev, res.message as ChatMessage]);
        void loadChats();
        return;
      }

      pushLocal("user", text);
      const res = await send({ data: { recoveryKey, chatId, text, model, language } });
      setChatId(res.chatId);
      if (res.message) setMessages((prev) => [...prev, res.message as ChatMessage]);
      void loadChats();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setThinking(false);
    }
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    if (!Ctor) {
      toast.error("Voice input is not supported in this browser.");
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
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
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
          onClick={() => setLiveVideo((v) => !v)}
          className={`rounded-full p-2 ${liveVideo ? "bg-secondary text-[color:var(--brand-1)]" : "hover:bg-secondary"}`}
          aria-label="Live video mode"
        >
          <SquarePlay className="size-5" />
        </button>
      </header>

      {liveVideo && (
        <div className="relative mx-3 mt-3 overflow-hidden rounded-2xl border border-border">
          <video ref={videoRef} autoPlay playsInline muted className="h-48 w-full bg-black object-cover" />
          <button
            onClick={() => setLiveVideo(false)}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5"
          >
            <X className="size-4 text-white" />
          </button>
          <span className="absolute bottom-2 left-3 text-[11px] text-white/80">Live Video Mode</span>
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
              Ask anything, speak with the mic, generate images with <code>/image</code>, or say
              “আমার পার্সোনাল ভল্ট খোলো” to open your vault.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-3xl bg-primary px-4 py-2.5 text-[15px] text-primary-foreground">
                    {message.content}
                  </p>
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
                    {message.image_url && (
                      <img
                        src={message.image_url}
                        alt="AI generated"
                        className="mt-2 w-full max-w-xs rounded-2xl border border-border"
                      />
                    )}
                  </div>
                </div>
              ),
            )}
            {thinking && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Thinking…
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
        <div className="flex items-end gap-1.5 rounded-3xl border border-border bg-card px-2 py-1.5">
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
          {input.trim() ? (
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
