type ShortcutHintProps = {
  keys: string;
  label: string;
};

export function ShortcutHint({ keys, label }: ShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[#657064] dark:text-[#aeb9aa]">
      <kbd className="font-medium text-[#253022] dark:text-[#e2eadf]">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}
