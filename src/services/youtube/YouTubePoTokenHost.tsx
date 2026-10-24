import { memo, useEffect, useRef, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { fetch } from "expo/fetch";
import { addNetworkStateListener } from "expo-network";
import { youtubePoTokens } from "./YouTubePoToken";
import { attestationHttpAllowed } from "./YouTubePoTokenHttp";
import { youtubePoTokenHtml } from "./YouTubePoTokenHtml";
import { clearYouTubeConnectionStreams } from "./YouTubeMusic";

const source = { html: youtubePoTokenHtml, baseUrl: "https://www.youtube.com" };
function TokenEngine({ generation }: { generation: number }) {
  const view = useRef<WebView<object>>(null);
  const detach = useRef<(() => void) | undefined>(undefined);
  const http = useRef(new Map<number, AbortController>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const requests = http.current;
    return () => {
      mounted.current = false;
      detach.current?.();
      requests.forEach(controller => controller.abort());
      requests.clear();
    };
  }, []);
  function inject(functionName: string, value: unknown) {
    if (mounted.current && youtubePoTokens.snapshot() === generation)
      view.current?.injectJavaScript(`window.${functionName}(${JSON.stringify(value)});true;`);
  }
  async function handleHttp(message: { id: number; url: string; method: string; body?: string; headers?: Record<string, string> }) {
    if (youtubePoTokens.snapshot() !== generation) return;
    if (!Number.isSafeInteger(message.id) || http.current.has(message.id)) return;
    if (!attestationHttpAllowed(message.url, message.method) || (message.body?.length || 0) > 50000 || http.current.size >= 4) {
      inject("receiveAttestationHttp", { id: message.id, error: true }); return;
    }
    const controller = new AbortController();
    http.current.set(message.id, controller);
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(message.headers || {}))
        if (["content-type", "x-goog-api-key", "x-user-agent", "user-agent", "accept-language"].includes(key.toLowerCase()) && typeof value === "string" && value.length <= 1024) headers[key] = value;
      const response = await fetch(message.url, { method: message.method, headers, body: message.body,
        credentials: "omit", signal: controller.signal });
      const body = await response.text();
      if (body.length > (message.url === "https://www.youtube.com/" ? 8000000 : 2000000)) throw new Error("Attestation response too large");
      inject("receiveAttestationHttp", { id: message.id, status: response.status, body });
    } catch { inject("receiveAttestationHttp", { id: message.id, error: true }); }
    finally { clearTimeout(timer); http.current.delete(message.id); }
  }
  function onMessage(event: WebViewMessageEvent) {
    if (youtubePoTokens.snapshot() !== generation) return;
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "ready" && !detach.current)
        detach.current = youtubePoTokens.attach(command => inject("runAttestationCommand", command), generation);
      else if (message.type === "result") youtubePoTokens.receive(message, generation);
      else if (message.type === "http") void handleHttp(message);
    } catch { youtubePoTokens.engineFailed(generation); }
  }
  return <View style={styles.engine} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <WebView<object> ref={view} source={source} originWhitelist={["https://www.youtube.com"]}
      javaScriptEnabled sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false}
      scrollEnabled={false} setSupportMultipleWindows={false} onMessage={onMessage}
      onShouldStartLoadWithRequest={request => request.url === "about:blank" || request.url === "https://www.youtube.com/" || request.url === "https://www.youtube.com"}
      onError={() => youtubePoTokens.engineFailed(generation)} onContentProcessDidTerminate={() => youtubePoTokens.engineFailed(generation)}
      onRenderProcessGone={() => youtubePoTokens.engineFailed(generation)} />
  </View>;
}

export const YouTubePoTokenHost = memo(function YouTubePoTokenHost() {
  const generation = useSyncExternalStore(youtubePoTokens.subscribe, youtubePoTokens.snapshot, () => -1);
  useEffect(() => {
    let previous: string | undefined;
    const subscription = addNetworkStateListener(state => {
      const network = `${state.type}:${state.isConnected}`;
      if (previous !== undefined && previous !== network) {
        youtubePoTokens.networkChanged();
        clearYouTubeConnectionStreams();
      }
      previous = network;
    });
    return () => { subscription.remove(); youtubePoTokens.reset(); };
  }, []);
  return generation >= 0 ? <TokenEngine key={generation} generation={generation} /> : null;
});
const styles = StyleSheet.create({ engine: { position: "absolute", width: 1, height: 1, opacity: 0 } });
