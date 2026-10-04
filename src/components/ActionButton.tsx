import { useRef, type ComponentPropsWithRef } from "react";

type Props = Omit<ComponentPropsWithRef<"button">, "onClick" | "onMouseDown"> & { onAction: () => void };
export function ActionButton({ onAction, className = "", ...props }: Props) {
  const mouseActivated = useRef(false);
  return <button {...props} className={`action-button ${className}`} type="button"
    onMouseDown={event => {
      if (event.button !== 0) return;
      mouseActivated.current = true;
      event.currentTarget.focus();
      onAction();
    }}
    onClick={event => {
      if (mouseActivated.current && event.detail !== 0) { mouseActivated.current = false; return; }
      mouseActivated.current = false;
      onAction();
    }} />;
}
