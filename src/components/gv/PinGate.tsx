import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Delete, Lock } from "lucide-react";
import { toast } from "sonner";

import { setPin as setPinFn, unlockVault } from "@/lib/gv.functions";

export function PinGate({
  recoveryKey,
  hasPin,
  onUnlocked,
  onCancel,
}: {
  recoveryKey: string;
  hasPin: boolean;
  onUnlocked: (pin: string) => void;
  onCancel: () => void;
}) {
  const unlock = useServerFn(unlockVault);
  const createPin = useServerFn(setPinFn);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [busy, setBusy] = useState(false);

  const current = stage === "enter" ? pin : confirm;

  async function submit(value: string) {
    setBusy(true);
    try {
      if (hasPin) {
        await unlock({ data: { recoveryKey, pin: value } });
        onUnlocked(value);
      } else if (stage === "enter") {
        setStage("confirm");
      } else {
        if (value !== pin) {
          toast.error("PINs do not match. Try again.");
          setPin("");
          setConfirm("");
          setStage("enter");
          return;
        }
        await createPin({ data: { recoveryKey, pin: value } });
        toast.success("Master PIN set.");
        onUnlocked(value);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unlock.");
      setPin("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busy || current.length >= 4) return;
    const next = current + digit;
    if (stage === "enter") setPin(next);
    else setConfirm(next);
    if (next.length === 4) void submit(next);
  }

  function back() {
    if (stage === "enter") setPin(current.slice(0, -1));
    else setConfirm(current.slice(0, -1));
  }

  const title = hasPin
    ? "Enter your vault PIN"
    : stage === "enter"
      ? "Set a 4-digit master PIN"
      : "Confirm your PIN";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8">
      <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-secondary">
        <Lock className="size-5 text-[color:var(--brand-2)]" />
      </div>
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        This PIN protects your personal vault on every device.
      </p>

      <div className="my-8 flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`size-3.5 rounded-full ${current.length > i ? "bg-[color:var(--brand-1)]" : "bg-secondary"}`}
          />
        ))}
      </div>

      <div className="grid w-full max-w-64 grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="h-14 rounded-2xl bg-card text-lg font-medium active:bg-secondary"
          >
            {d}
          </button>
        ))}
        <button onClick={onCancel} className="h-14 rounded-2xl text-xs text-muted-foreground">
          Cancel
        </button>
        <button
          onClick={() => press("0")}
          className="h-14 rounded-2xl bg-card text-lg font-medium active:bg-secondary"
        >
          0
        </button>
        <button onClick={back} className="flex h-14 items-center justify-center rounded-2xl">
          <Delete className="size-5 text-muted-foreground" />
        </button>
      </div>

      <p className="mt-10 text-[11px] text-muted-foreground">Developed by Shubhankar</p>
    </div>
  );
}
