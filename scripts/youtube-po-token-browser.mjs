// Browser-only entry bundled into the native WebView. MIT BgUtils, no CDN.
import { BotGuardClient } from "bgutils-js/botguard";
import { WebPoMinter } from "bgutils-js/webpo";
import { buildURL, getHeaders } from "bgutils-js/utils";
import { extractPageAttestation } from "./helpers/youtube-page-attestation.mjs";

let minter, botguard, expiresAt = 0, httpId = 0;
const requests = new Map();
const send = data => window.ReactNativeWebView.postMessage(JSON.stringify(data));
function nativeFetch(url, init = {}) {
  const id = ++httpId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(new Error("Attestation HTTP timeout")); }, 6000);
    requests.set(id, { resolve, reject, timer });
    send({ type: "http", id, url, method: init.method || "GET",
      headers: { ...init.headers, "user-agent": navigator.userAgent }, body: init.body });
  });
}
window.receiveAttestationHttp = reply => {
  const request = requests.get(reply.id);
  if (!request) return;
  requests.delete(reply.id); clearTimeout(request.timer);
  if (reply.error) request.reject(new Error("Attestation HTTP failed"));
  else request.resolve({ ok: reply.status >= 200 && reply.status < 300, status: reply.status,
    text: async () => reply.body, json: async () => JSON.parse(reply.body) });
};
window.runAttestationCommand = async command => {
  let stage = "page";
  try {
    if (command.operation === "bootstrap") {
      await botguard?.shutdown();
      minter = undefined;
      expiresAt = 0;
      const page = await nativeFetch("https://www.youtube.com/", { headers: { "accept-language": "en-US,en;q=0.7" } });
      if (!page.ok) throw new Error("Attestation page unavailable");
      const { config, challenge } = extractPageAttestation(await page.text());
      // The initial challenge is bound to this page's EVENT_ID. /att/get cannot
      // replace it; fetching a separate config produces silently rejected tokens.
      window.yt = { config_: config };
      stage = "interpreter";
      const url = challenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
      const interpreter = await nativeFetch(url.startsWith("//") ? `https:${url}` : url);
      if (!interpreter.ok) throw new Error("Interpreter unavailable");
      const script = await interpreter.text();
      // The remote interpreter runs only in the isolated WebView, never Hermes.
      const element = document.createElement("script");
      element.textContent = script; document.head.appendChild(element); element.remove();
      botguard = await BotGuardClient.create({ program: challenge.program, globalName: challenge.globalName, globalObject: window });
      stage = "snapshot";
      const webPoSignalOutput = [];
      const responseToken = await botguard.snapshot({ webPoSignalOutput });
      stage = "integrity";
      const response = await nativeFetch(buildURL("GenerateIT", true), { method: "POST", headers: getHeaders(),
        body: JSON.stringify(["O43z0dpjhgX20SCx4KAo", responseToken]) });
      if (!response.ok) throw new Error("Integrity service unavailable");
      const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = await response.json();
      if (!integrityToken || !Number.isFinite(estimatedTtlSecs) || estimatedTtlSecs <= 60) throw new Error("Invalid integrity lifetime");
      minter = await WebPoMinter.create({ integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken }, webPoSignalOutput);
      expiresAt = Date.now() + (estimatedTtlSecs - Math.min(300, estimatedTtlSecs / 10)) * 1000;
      send({ type: "result", id: command.id, ok: true, expiresAt });
    } else if (command.operation === "mint") {
      stage = "mint";
      if (!minter || Date.now() >= expiresAt || !/^[\w-]{11}$/.test(command.videoId)) throw new Error("Minter unavailable");
      const token = await minter.mintAsWebsafeString(command.videoId);
      send({ type: "result", id: command.id, ok: true, token });
    }
  } catch { send({ type: "result", id: command.id, ok: false, stage }); }
};
send({ type: "ready" });
