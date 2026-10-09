// Browser-only entry bundled into the native WebView. MIT BgUtils, no CDN.
import { BotGuardClient } from "bgutils-js/botguard";
import { WebPoMinter } from "bgutils-js/webpo";
import { buildURL, getHeaders } from "bgutils-js/utils";

let minter, botguard, expiresAt = 0, httpId = 0;
const requests = new Map();
const send = data => window.ReactNativeWebView.postMessage(JSON.stringify(data));
function nativeFetch(url, init = {}) {
  const id = ++httpId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(new Error("Attestation HTTP timeout")); }, 8000);
    requests.set(id, { resolve, reject, timer });
    send({ type: "http", id, url, method: init.method || "GET", headers: init.headers, body: init.body });
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
  let stage = "interpreter";
  try {
    if (command.operation === "bootstrap") {
      const challenge = command.challenge;
      if (!challenge?.program || !challenge.globalName) throw new Error("Invalid challenge");
      await botguard?.shutdown();
      minter = undefined;
      let script = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
      if (!script) {
        const url = challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
        if (!url) throw new Error("Missing interpreter");
        const response = await nativeFetch(url.startsWith("//") ? `https:${url}` : url);
        if (!response.ok) throw new Error("Interpreter unavailable");
        script = await response.text();
      }
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
