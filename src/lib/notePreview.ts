export function previewContent(content: string) {
  return content.replace(/\s+/g, " ").trim() || "Empty note";
}
