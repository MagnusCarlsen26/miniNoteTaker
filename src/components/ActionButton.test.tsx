import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionButton } from "./ActionButton";
import { Confirmation } from "./Confirmation";
afterEach(cleanup);
describe("action controls", () => {
  it("activates once for mouse-down followed by click", () => {
    const action = vi.fn(); render(<ActionButton onAction={action}>Run</ActionButton>);
    const button = screen.getByRole("button"); fireEvent.mouseDown(button, { button: 0 }); fireEvent.click(button, { detail: 1 });
    expect(action).toHaveBeenCalledTimes(1);
  });
  it("handles keyboard-generated clicks and touch clicks", () => {
    const action = vi.fn(); render(<ActionButton onAction={action}>Run</ActionButton>);
    const button = screen.getByRole("button");
    fireEvent.click(button, { detail: 0 }); fireEvent.click(button, { detail: 0 });
    fireEvent.touchStart(button); fireEvent.touchEnd(button); fireEvent.click(button, { detail: 1 });
    expect(action).toHaveBeenCalledTimes(3);
  });
  it("ignores secondary mouse buttons", () => {
    const action = vi.fn(); render(<ActionButton onAction={action}>Run</ActionButton>);
    fireEvent.mouseDown(screen.getByRole("button"), { button: 2 }); expect(action).not.toHaveBeenCalled();
  });
  it("restores trigger focus when a confirmation closes", () => {
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const result = render(<Confirmation message="Delete?" label="Delete" onClose={() => {}} onConfirm={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("dialog")); result.unmount(); expect(document.activeElement).toBe(trigger); trigger.remove();
  });
});
