type ShortcutHintProps = {
  keys: string;
  label: string;
};

export function ShortcutHint({ keys, label }: ShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--text-secondary)]">
      <kbd className="font-medium text-[var(--text)]">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}
