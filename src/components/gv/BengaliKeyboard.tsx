const ROWS = [
  ["অ", "আ", "ই", "ঈ", "উ", "ঊ", "এ", "ঐ", "ও", "ঔ"],
  ["ক", "খ", "গ", "ঘ", "চ", "ছ", "জ", "ট", "ড", "ত"],
  ["থ", "দ", "ধ", "ন", "প", "ফ", "ব", "ভ", "ম", "য"],
  ["র", "ল", "শ", "স", "হ", "়", "া", "ি", "ী", "ু"],
  ["ে", "ৈ", "ো", "ৌ", "ং", "ঃ", "্", "য়", "ড়", "ঁ"],
];

export function BengaliKeyboard({
  onInsert,
  onBackspace,
}: {
  onInsert: (char: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[11px] text-muted-foreground">বাংলা কীবোর্ড</span>
        <button
          type="button"
          onClick={onBackspace}
          className="rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary"
        >
          ⌫ মুছুন
        </button>
      </div>
      <div className="space-y-1">
        {ROWS.map((row, i) => (
          <div key={i} className="flex gap-1">
            {row.map((char) => (
              <button
                key={char}
                type="button"
                onClick={() => onInsert(char)}
                className="h-8 flex-1 rounded-md bg-secondary text-sm text-foreground transition-colors active:bg-accent"
              >
                {char}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
