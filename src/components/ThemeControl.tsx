import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ThemePreference } from "../types/note";
import { ActionButton } from "./ActionButton";

type Props = { preference: ThemePreference; onChoose: (value: ThemePreference) => void };
export function ThemeControl({ preference, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dismiss = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) {
        dismiss();
        // Restore after the outside target's default focus action.
        event.preventDefault();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);
  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  return <div className="theme-control">
    <ActionButton ref={trigger} className="theme-trigger" aria-label="Theme" title="Theme" aria-haspopup="menu" aria-expanded={open} onAction={() => open ? dismiss() : setOpen(true)}><Icon size={16} aria-hidden="true" /></ActionButton>
    {open && <div ref={panel} className="theme-popover" role="menu" aria-label="Theme preference" onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(panel.current!.querySelectorAll<HTMLButtonElement>("button"));
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }}>{(["system", "light", "dark"] as const).map(value => <ActionButton key={value} role="menuitemradio" aria-checked={preference === value} onAction={() => { onChoose(value); dismiss(); }}><span>{value[0].toUpperCase() + value.slice(1)}</span>{preference === value && <Check size={14} aria-hidden="true" />}</ActionButton>)}</div>}
  </div>;
}
