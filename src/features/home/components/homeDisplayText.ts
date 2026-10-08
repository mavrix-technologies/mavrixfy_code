// Source routing remains internal; home copy uses neutral catalog labels.
export function homeDisplayText(text: string, fallback = "Discover") {
  const neutral = text.replace(/\b(?:youtube(?:\s+music)?|jio\s*saavn)\b/gi, "")
    .replace(/\s*[·|•]\s*(?=$)/g, "").replace(/^(?:\s*[·|•:\-])+/, "")
    .replace(/\s{2,}/g, " ").trim();
  return (neutral === text.trim() ? neutral : neutral.replace(/\b(?:by|on|from)\s*$/i, "").trim()) || fallback;
}
