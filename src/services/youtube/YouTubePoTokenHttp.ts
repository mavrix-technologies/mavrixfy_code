// This bridge is deliberately not a general-purpose native HTTP proxy.
export function attestationHttpAllowed(url: string, method: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
    if (method === "POST") return parsed.hostname === "www.youtube.com" &&
      parsed.pathname === "/api/jnn/v1/GenerateIT" && !parsed.search && !parsed.hash;
    return method === "GET" && !parsed.search && !parsed.hash &&
      ((parsed.hostname === "www.youtube.com" && /^\/s\/player\/[\w-]+\/.*\.js$/.test(parsed.pathname)) ||
       (parsed.hostname === "www.google.com" && /^\/js\/(?:th|bg)\/[\w-]+\.js$/.test(parsed.pathname)));
  } catch { return false; }
}
