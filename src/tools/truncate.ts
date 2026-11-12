// Shorten text to maxChars: keep the beginning and the end, drop the middle.
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = maxChars / 2;
  const skipped = text.length - maxChars;
  return `${text.slice(0, half)}\n\n... (${skipped} characters truncated) ...\n\n${text.slice(-half)}`;
}
