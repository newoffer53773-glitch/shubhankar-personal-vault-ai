import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bold, Italic, List, Underline as UnderlineIcon } from "lucide-react";

type Note = { id: string; title: string; content: string };

export function NoteEditor({
  note,
  onSave,
  onCancel,
}: {
  note: Note | null;
  onSave: (title: string, content: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = note?.content ?? "";
  }, [note]);

  function format(command: string) {
    bodyRef.current?.focus();
    document.execCommand(command);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/90 px-3 py-3 backdrop-blur">
        <button onClick={onCancel} className="rounded-full p-2 hover:bg-secondary" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <p className="flex-1 text-sm font-medium">{note ? "Edit note" : "New secret note"}</p>
        <button
          onClick={() => onSave(title, bodyRef.current?.innerHTML ?? "")}
          className="rounded-full bg-[image:var(--gradient-brand)] px-4 py-2 text-xs font-medium text-primary-foreground"
        >
          Lock & save
        </button>
      </header>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title"
        className="border-b border-border bg-transparent px-4 py-3 text-base font-medium outline-none placeholder:text-muted-foreground"
      />

      <div className="flex gap-1 border-b border-border px-3 py-2">
        {[
          { cmd: "bold", Icon: Bold, label: "Bold" },
          { cmd: "italic", Icon: Italic, label: "Italic" },
          { cmd: "underline", Icon: UnderlineIcon, label: "Underline" },
          { cmd: "insertUnorderedList", Icon: List, label: "Bullet list" },
        ].map(({ cmd, Icon, label }) => (
          <button
            key={cmd}
            onClick={() => format(cmd)}
            aria-label={label}
            className="rounded-xl p-2 text-muted-foreground hover:bg-secondary"
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      <div
        ref={bodyRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Write something only you can read…"
        className="flex-1 px-4 py-4 text-[15px] leading-relaxed outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />

      <p className="pb-6 text-center text-[11px] text-muted-foreground">Developed by Shubhankar</p>
    </div>
  );
}
