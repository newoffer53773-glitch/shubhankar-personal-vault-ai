import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Toaster } from "@/components/ui/sonner";

import { ApiKeyScreen } from "@/components/gv/ApiKeyScreen";
import { AuthScreen } from "@/components/gv/AuthScreen";
import { SettingsSheet } from "@/components/gv/SettingsSheet";
import { ChatScreen } from "@/components/gv/ChatScreen";
import { PinGate } from "@/components/gv/PinGate";
import { VaultScreen } from "@/components/gv/VaultScreen";
import { getAccountState } from "@/lib/gv.functions";
import { clearKey, loadKey, type Lang } from "@/lib/gv-client";
import { hasApiKey, loadApiKey, loadVoice, type VoiceStyle } from "@/lib/gv-crypto";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gemini Vault AI — AI Assistant & Encrypted Cloud Vault" },
      {
        name: "description",
        content:
          "Anonymous AI assistant with voice input, image generation and an encrypted cloud vault unlocked by a secret recovery key and master PIN.",
      },
      { property: "og:title", content: "Gemini Vault AI — AI Assistant & Encrypted Cloud Vault" },
      {
        property: "og:description",
        content:
          "Chat with AI, generate images, and hide photos, videos and documents in an encrypted cloud vault. No email or phone number needed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Screen = "loading" | "auth" | "apikey" | "chat" | "pin" | "vault";

function Index() {
  const accountState = useServerFn(getAccountState);
  const [screen, setScreen] = useState<Screen>("loading");
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [language, setLanguage] = useState<Lang>("auto");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceStyle>("friendly");
  const [showSettings, setShowSettings] = useState(false);

  const bootstrap = useCallback(
    async (key: string) => {
      try {
        const state = await accountState({ data: { recoveryKey: key } });
        setHasPin(state.hasPin);
        setLanguage((state.language as Lang) ?? "auto");
        setRecoveryKey(key);
        setScreen(hasApiKey() ? "chat" : "apikey");
      } catch {
        clearKey();
        setScreen("auth");
      }
    },
    [accountState],
  );

  useEffect(() => {
    setApiKey(loadApiKey());
    setVoice(loadVoice());
    const stored = loadKey();
    if (!stored) {
      setScreen("auth");
      return;
    }
    void bootstrap(stored);
  }, [bootstrap]);

  async function openVault() {
    if (!recoveryKey) return;
    try {
      const state = await accountState({ data: { recoveryKey } });
      setHasPin(state.hasPin);
    } catch {
      /* keep last known state */
    }
    setScreen("pin");
  }

  return (
    <>
      <Toaster />
      {screen === "loading" && <div className="min-h-dvh bg-background" />}

      {screen === "auth" && <AuthScreen onReady={(key) => void bootstrap(key)} />}

      {screen === "apikey" && (
        <ApiKeyScreen
          onDone={(key) => {
            setApiKey(key);
            setScreen("chat");
          }}
        />
      )}

      {screen === "chat" && recoveryKey && (
        <ChatScreen
          recoveryKey={recoveryKey}
          language={language}
          apiKey={apiKey}
          voice={voice}
          onLanguageChange={setLanguage}
          onOpenSettings={() => setShowSettings(true)}
          onVaultCommand={() => void openVault()}
          onSignOut={() => {
            clearKey();
            setRecoveryKey(null);
            setPin(null);
            setScreen("auth");
          }}
        />
      )}

      {screen === "pin" && recoveryKey && (
        <PinGate
          recoveryKey={recoveryKey}
          hasPin={hasPin}
          onUnlocked={(value) => {
            setPin(value);
            setHasPin(true);
            setScreen("vault");
          }}
          onCancel={() => setScreen("chat")}
        />
      )}

      {showSettings && (
        <SettingsSheet
          apiKey={apiKey}
          voice={voice}
          onApiKeyChange={setApiKey}
          onVoiceChange={setVoice}
          onClose={() => setShowSettings(false)}
        />
      )}

      {screen === "vault" && recoveryKey && pin && (
        <VaultScreen
          recoveryKey={recoveryKey}
          pin={pin}
          onExit={() => {
            setPin(null);
            setScreen("chat");
          }}
        />
      )}
    </>
  );
}
