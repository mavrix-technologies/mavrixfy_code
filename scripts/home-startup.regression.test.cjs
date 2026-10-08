const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function options({ online = true, hydrated = true, seeds } = {}) {
  const queries = [];
  let stateIndex = 0;
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/features/home/hooks/useYouTubeHomeFeed.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === "react") return { useState: () => [stateIndex++ === 0
      ? (seeds ? { account: "account-a", seeds } : undefined)
      : (hydrated ? { account: "account-a", generation: 5 } : undefined), () => {}], useCallback: fn => fn, useEffect() {} };
    if (name === "expo-router") return { useFocusEffect(fn) { queries.onFocus = fn; } };
    if (name === "@tanstack/react-query") return { useQuery: config => { queries.push(config); return {}; }, useQueryClient: () => ({}) };
    if (name === "react-native") return {};
    if (name.endsWith("AuthContext")) return { useAuth: () => ({ user: { id: "account-a" } }) };
    if (name.endsWith("NetworkContext")) return { useNetwork: () => ({ isOnline: online }) };
    if (name.endsWith("accountScope")) return { getAccountScope: () => ({ generation: 5 }), isCurrentAccount: () => true };
    if (name.endsWith("YouTubeMusic")) return { youTubeAvailable: () => true, isYouTubeSong: () => true };
    if (name.endsWith("YouTubeHomeRecommendations")) return { getYouTubeHomeRecommendations: async seeds => seeds };
    if (name.endsWith("storage")) return { getRecentlyPlayed: async () => [] };
    if (name.endsWith("homeFeedCache")) return {};
    throw new Error(name);
  } });
  module.exports.useYouTubeHomeFeed();
  return queries;
}
test("latest release loading starts independently while listening history is pending", () => {
  const [home, releases] = options();
  assert.equal(home.enabled, false);
  assert.equal(releases.enabled, true);
});

test("returning focus reads recent history without asking QueryClient to reload shelves", async () => {
  const queries = options({ seeds: [] });
  // The fixture deliberately exposes no network/refetch methods on QueryClient.
  // Running repeated focus callbacks must only refresh local listening history.
  for (let i = 0; i < 3; i++) {
    const cleanup = queries.onFocus();
    await Promise.resolve();
    cleanup();
  }
});

test("disk hydration gates network requests and offline never starts either feed", () => {
  for (const config of [{ hydrated: false }, { online: false }]) {
    const [home, releases] = options({ ...config, seeds: [] });
    assert.equal(home.enabled, false);
    assert.equal(releases.enabled, false);
  }
});

test("history changes keep one query identity and explicit refresh uses the latest seeds", async () => {
  const [first] = options({ seeds: [{ id: "youtube_a" }] });
  const [next] = options({ seeds: [{ id: "youtube_b" }] });
  assert.deepEqual(Array.from(first.queryKey), Array.from(next.queryKey));
  assert.equal(next.enabled, true);
  assert.equal((await next.queryFn({ signal: new AbortController().signal }))[0].id, "youtube_b");
  for (const query of options({ seeds: [] })) {
    assert.equal(query.refetchOnMount, false);
    assert.equal(query.refetchOnWindowFocus, false);
    assert.equal(query.refetchOnReconnect, false);
  }
});
test("history changes retain visible rows only within the same account generation", () => {
  const [home] = options(); const previous = { sections: [{ id: "cached-row" }] };
  assert.equal(home.placeholderData(previous, { queryKey: ["youtube-home", "account-a", 5, "old-seed"] }), previous);
  assert.equal(home.placeholderData(previous, { queryKey: ["youtube-home", "account-b", 5] }), undefined);
  assert.equal(home.placeholderData(previous, { queryKey: ["youtube-home", "account-a", 4] }), undefined);
});
