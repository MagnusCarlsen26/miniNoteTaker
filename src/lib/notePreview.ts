export function previewContent(content: string) {
  return content.replace(/\s+/g, " ").trim() || "Empty note";
}

export function presentNote(content: string) {
  const lines = content.split("\n");
  const index = lines.findIndex(line => line.trim().length > 0);
  if (index < 0) return { title: "Empty note", body: "", excerpt: "" };
  const body = lines.slice(index + 1).join("\n");
  return { title: lines[index].trim(), body, excerpt: body.replace(/\s+/g, " ").trim() };
}
