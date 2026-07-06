import { describe, expect, it } from "vitest";
import { centerSelectedDateInStrip } from "./dateStripScroll";

function createScrollContainer(overrides: Partial<HTMLDivElement>) {
  return {
    clientHeight: 200,
    scrollHeight: 1000,
    scrollTop: 0,
    clientWidth: 200,
    scrollWidth: 1000,
    scrollLeft: 0,
    ...overrides
  } as HTMLDivElement;
}

function createSelectedElement(overrides: Partial<HTMLElement>) {
  return {
    offsetTop: 480,
    offsetHeight: 40,
    offsetLeft: 480,
    offsetWidth: 40,
    ...overrides
  } as HTMLElement;
}

describe("centerSelectedDateInStrip", () => {
  it("centers the selected date vertically", () => {
    const container = createScrollContainer({});
    const selected = createSelectedElement({});

    centerSelectedDateInStrip(container, selected, "vertical");

    expect(container.scrollTop).toBe(400);
  });

  it("centers the selected date horizontally", () => {
    const container = createScrollContainer({});
    const selected = createSelectedElement({});

    centerSelectedDateInStrip(container, selected, "horizontal");

    expect(container.scrollLeft).toBe(400);
  });

  it("clamps scroll position within bounds", () => {
    const container = createScrollContainer({ clientHeight: 200, scrollHeight: 420 });
    const selected = createSelectedElement({ offsetTop: 900, offsetHeight: 40 });

    centerSelectedDateInStrip(container, selected, "vertical");

    expect(container.scrollTop).toBe(220);
  });

  it("does nothing when the container has no measurable size", () => {
    const container = createScrollContainer({ clientHeight: 0 });
    const selected = createSelectedElement({});

    centerSelectedDateInStrip(container, selected, "vertical");

    expect(container.scrollTop).toBe(0);
  });
});
