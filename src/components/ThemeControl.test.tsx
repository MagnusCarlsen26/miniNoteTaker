import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeControl } from "./ThemeControl";
afterEach(cleanup);
it("opens on mouse-down, shows the preference and selects immediately", () => {
  const choose = vi.fn(); render(<ThemeControl preference="system" onChoose={choose} />);
  const trigger = screen.getByRole("button", { name: "Theme" });
  fireEvent.mouseDown(trigger, { button: 0 });
  expect(screen.getByRole("menuitemradio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.mouseDown(screen.getByRole("menuitemradio", { name: "Dark" }), { button: 0 });
  expect(choose).toHaveBeenCalledWith("dark");
  expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(trigger);
});
it("supports keyboard activation and arrow navigation", () => {
  const choose = vi.fn(); render(<ThemeControl preference="system" onChoose={choose} />);
  const trigger = screen.getByRole("button", { name: "Theme" });
  fireEvent.click(trigger, { detail: 0 });
  expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "System" }));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "Light" }));
  fireEvent.click(document.activeElement!, { detail: 0 });
  expect(choose).toHaveBeenCalledWith("light"); expect(document.activeElement).toBe(trigger);
});
it.each(["outside", "escape"])("dismisses via %s and restores focus", method => {
  render(<ThemeControl preference="light" onChoose={vi.fn()} />);
  const trigger = screen.getByRole("button", { name: "Theme" });
  fireEvent.mouseDown(trigger, { button: 0 });
  if (method === "outside") fireEvent.mouseDown(document.body); else fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(trigger);
});
