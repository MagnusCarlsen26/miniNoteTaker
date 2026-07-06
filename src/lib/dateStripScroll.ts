export function centerSelectedDateInStrip(
  scrollContainer: HTMLDivElement,
  selectedElement: HTMLElement,
  orientation: "vertical" | "horizontal"
) {
  if (orientation === "vertical") {
    if (scrollContainer.clientHeight <= 0) {
      return;
    }

    const offset =
      selectedElement.offsetTop -
      scrollContainer.clientHeight / 2 +
      selectedElement.offsetHeight / 2;
    const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    scrollContainer.scrollTop = Math.max(0, Math.min(offset, maxScrollTop));
    return;
  }

  if (scrollContainer.clientWidth <= 0) {
    return;
  }

  const offset =
    selectedElement.offsetLeft -
    scrollContainer.clientWidth / 2 +
    selectedElement.offsetWidth / 2;
  const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth;
  scrollContainer.scrollLeft = Math.max(0, Math.min(offset, maxScrollLeft));
}
