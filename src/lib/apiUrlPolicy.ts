export const DEFAULT_API_URL = "https://mavrixfy-song-api.vercel.app";

export function normalizeApiUrl(value: string | undefined, development = __DEV__): string | null {
  if (!value?.trim()) return null;
  try {
    const input = value.trim();
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const privateHost = host === 'localhost' || host.endsWith('.localhost') || host === '::1' ||
      host === '::' || host.startsWith('127.') || host.startsWith('0.') || host.startsWith('10.') ||
      host.startsWith('192.168.') || host.startsWith('169.254.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^(fc|fd|fe80):/i.test(host) || host.startsWith('::ffff:') || host.endsWith('.local');
    if (!development && (privateHost || url.protocol !== 'https:')) return null;
    if (url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}
