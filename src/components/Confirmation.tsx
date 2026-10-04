import { useEffect, useRef } from "react";
import { ActionButton } from "./ActionButton";
export function Confirmation({ message, label, onConfirm, onClose }: { message: string; label: string; onConfirm: () => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="confirmation" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panel} onKeyDown={event => {
    if (event.key === "Escape") onClose();
    if (event.key === "Tab") { event.preventDefault(); const buttons = panel.current?.querySelectorAll('button'); if (buttons?.length) buttons[document.activeElement === buttons[0] ? 1 : 0].focus(); }
  }}><p>{message}</p><div className="toolbar"><ActionButton onAction={onConfirm}>{label}</ActionButton><ActionButton onAction={onClose}>Cancel</ActionButton></div></div>;
}
