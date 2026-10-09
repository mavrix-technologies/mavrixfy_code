const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const arrayUtilsModule = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/arrayUtils.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { module: arrayUtilsModule, exports: arrayUtilsModule.exports },
);
const { shufflePlaybackQueue } = arrayUtilsModule.exports;

function fixture({ shuffled = false, nativeIds, queueIds = ["a", "b", "c", "d"], activeIndex = 0 } = {}) {
  const queue = queueIds.map(id => ({ id }));
  const nativeQueue = (nativeIds ?? queue.map(song => song.id)).map(id => ({ id }));
  const snapshots = [];
  const nativeMoves = [];
  const replacements = [];
  const persistedStates = [];
  const state = {
    queue: [...queue],
    sourceQueue: [...queue],
    queueIndex: activeIndex,
    userQueuedSongIds: [],
  };
  let streamResolutions = 0;
  const refs = {
    queueRef: { current: state.queue },
    originalQueueRef: { current: state.sourceQueue },
    queueIndexRef: { current: activeIndex },
    currentSongRef: { current: queue[activeIndex] },
    userQueuedSongIdsRef: { current: [] },
    isShuffledRef: { current: shuffled },
    repeatModeRef: { current: "off" },
    isPlayingRef: { current: true },
    positionSecondsRef: { current: 37 },
    streamUrlCache: { current: new Map() },
  };
  const trackPlayer = {
    async getQueue() { return nativeQueue; },
    async move(from, to) {
      nativeMoves.push([from, to]);
      const [item] = nativeQueue.splice(from, 1);
      nativeQueue.splice(to, 0, item);
    },
    async add(tracks, insertAt) {
      const index = Number.isInteger(insertAt) ? insertAt : nativeQueue.length;
      nativeQueue.splice(index, 0, ...tracks);
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync("src/services/audio/audioQueueOperations.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "react") return { useCallback: fn => fn };
      if (name.endsWith("YouTubeMusic")) return {
        isYouTubeSong: song => song.source === "youtube" || song.id?.startsWith("youtube_"),
      };
      if (name.endsWith("arrayUtils")) return {
        shufflePlaybackQueue,
      };
      if (name.endsWith("logger")) return { logger: { error() {}, warn() {} } };
      if (name.endsWith("PlaybackEngine")) return {
        updatePlaybackEngineSnapshot: snapshot => snapshots.push(snapshot),
      };
      if (name.endsWith("playerPersistenceService")) return {
        playerPersistenceService: {
          savePlayerState: state => { persistedStates.push(state); return Promise.resolve(); },
        },
      };
      if (name.endsWith("PlayerPlaybackResolver")) return {
        songToTrack: (song, url) => ({ ...song, url: url || song.audioUrl || "" }),
        withResolvedPlaybackUrl: (song, url) => ({ ...song, audioUrl: url }),
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const operations = module.exports.useAudioQueueOperations({
    queue: state.queue,
    ...refs,
    setQueue: value => { state.queue = value; },
    sourceQueue: state.sourceQueue,
    setSourceQueue: value => { state.sourceQueue = value; },
    queueIndex: activeIndex,
    setQueueIndex: value => { state.queueIndex = value; },
    userQueuedSongIds: [],
    setUserQueuedSongIds: value => { state.userQueuedSongIds = value; },
    isShuffled: shuffled,
    setIsShuffled() {},
    repeatMode: "off",
    setRepeatMode() {},
    TrackPlayer: trackPlayer,
    isPlayerReady: true,
    RepeatMode: null,
    enqueueNativeQueueMutation: operation => Promise.resolve().then(operation),
    nativeQueueIdsMatch: (native, songs) => native.length === songs.length && native.every((track, index) => track.id === songs[index]?.id),
    replaceNativeQueuePreservingState: async (...args) => replacements.push(args),
    resolvePlaybackUrlCached: async () => { streamResolutions += 1; return null; },
    showPlaybackNotice() {},
    playSong() {},
  });
  return { operations, queue, refs, nativeQueue, nativeMoves, replacements, persistedStates, snapshots, state, streamResolutions: () => streamResolutions };
}
const ids = songs => JSON.parse(JSON.stringify(songs.map(song => song.id)));

test("queue drag uses an in-place native move and updates the unshuffled source order", async () => {
  const f = fixture();
  f.operations.reorderQueue(3, 1);
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(ids(f.state.queue), ["a", "d", "b", "c"]);
  assert.deepEqual(ids(f.state.sourceQueue), ["a", "d", "b", "c"]);
  assert.deepEqual(ids(f.nativeQueue), ["a", "d", "b", "c"]);
  assert.deepEqual(f.nativeMoves, [[3, 1]]);
  assert.equal(f.replacements.length, 0);
  assert.deepEqual(ids(f.persistedStates.at(-1).queue), ["a", "d", "b", "c"]);
});

test("moving first upcoming song to the very last slot preserves the playing occurrence", async () => {
  const f = fixture({ queueIds: ["a", "a", "b", "c", "d"], activeIndex: 1 });
  f.operations.reorderQueue(2, 4);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ids(f.state.queue), ["a", "a", "c", "d", "b"]);
  assert.deepEqual(ids(f.nativeQueue), ids(f.state.queue));
  assert.equal(f.state.queueIndex, 1);
  assert.equal(f.persistedStates.at(-1).queueIndex, 1);
});

test("reorder rejects fractional, non-finite and out-of-bounds positions without mutation", async () => {
  const f = fixture();
  for (const invalid of [-1, 0.5, NaN, Infinity, 4]) {
    f.operations.reorderQueue(invalid, 1);
    f.operations.reorderQueue(1, invalid);
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ids(f.state.queue), ["a", "b", "c", "d"]);
  assert.equal(f.snapshots.length, 0);
  assert.equal(f.persistedStates.length, 0);
  assert.equal(f.nativeMoves.length, 0);
});

test("a drop from before a queue edit or playback advance cannot move the new active song", async () => {
  const f = fixture();
  const expectedState = { queue: f.state.queue, queueIndex: 0 };
  f.refs.queueIndexRef.current = 1;
  f.operations.reorderQueue(1, 3, expectedState);
  assert.equal(f.snapshots.length, 0);
  f.refs.queueIndexRef.current = 0;
  f.operations.reorderQueue(1, 3, expectedState);
  f.operations.reorderQueue(1, 2, expectedState);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.snapshots.length, 1);
  assert.deepEqual(ids(f.state.queue), ["a", "c", "d", "b"]);
});

test("shuffled queue drag leaves the canonical source order intact", async () => {
  const f = fixture({ shuffled: true });
  const sourceBefore = [...f.state.sourceQueue];
  f.operations.reorderQueue(3, 1);
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(ids(f.state.queue), ["a", "d", "b", "c"]);
  assert.deepEqual(ids(f.state.sourceQueue), ids(sourceBefore));
  assert.equal(Object.hasOwn(f.snapshots.at(-1), "sourceQueue"), false);
});

test("native queue mismatch uses state-preserving synchronization", async () => {
  const f = fixture({ nativeIds: ["unrelated"] });
  f.operations.reorderQueue(3, 1);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(f.nativeMoves.length, 0);
  assert.equal(f.replacements.length, 1);
  assert.deepEqual(ids(f.replacements[0][0]), ["a", "d", "b", "c"]);
  assert.equal(f.replacements[0][1], 0);
  assert.equal(JSON.stringify(f.replacements[0][2]), JSON.stringify({ position: 37, wasPlaying: true }));
});

test("YouTube add-to-queue skips extraction and publishes the queue snapshot", async () => {
  const f = fixture();
  const song = { id: "youtube_video", source: "youtube", youtubeVideoId: "abcdefghijk" };

  f.operations.addToQueue(song);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(f.streamResolutions(), 0);
  assert.equal(f.state.queue.at(-1).id, song.id);
  assert.equal(f.state.sourceQueue.at(-1).id, song.id);
  assert.equal(f.state.userQueuedSongIds.at(-1), song.id);
  assert.equal(f.nativeQueue.at(-1).id, song.id);
  assert.deepEqual(ids(f.snapshots.at(-1).queue), [...ids(f.queue), song.id]);
  assert.equal(f.persistedStates.at(-1).queue.at(-1).id, song.id);
});

test("YouTube Play Next skips extraction and inserts at the native next position", async () => {
  const f = fixture();
  const song = { id: "youtube_video", source: "youtube", youtubeVideoId: "abcdefghijk" };

  f.operations.playNext(song);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(f.streamResolutions(), 0);
  assert.deepEqual(ids(f.state.queue), ["a", song.id, "b", "c", "d"]);
  assert.deepEqual(ids(f.nativeQueue), ["a", song.id, "b", "c", "d"]);
  assert.equal(f.state.userQueuedSongIds[0], song.id);
  assert.deepEqual(ids(f.snapshots.at(-1).queue), ids(f.state.queue));
  assert.deepEqual(ids(f.persistedStates.at(-1).queue), ids(f.state.queue));
});

test("shuffle preserves the active track and restores canonical order when disabled", async () => {
  const f = fixture({ activeIndex: 1 });
  const canonical = [...f.state.sourceQueue];

  f.operations.toggleShuffle();
  assert.equal(f.refs.isShuffledRef.current, true);
  assert.equal(f.state.queue[0].id, "b");
  assert.deepEqual([...ids(f.state.queue)].sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(f.state.sourceQueue), ids(canonical));
  assert.equal(f.state.queueIndex, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(f.replacements[0][2])), { position: 37, wasPlaying: true });

  f.operations.toggleShuffle();
  assert.equal(f.refs.isShuffledRef.current, false);
  assert.deepEqual(ids(f.state.queue), ["a", "b", "c", "d"]);
  assert.equal(f.state.queueIndex, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.replacements.length, 2);
  assert.equal(f.persistedStates.at(-1).queueIndex, 1);
});

test("shuffle anchors one queue occurrence and keeps duplicate songs", () => {
  const first = { id: "same" };
  const active = { id: "same" };
  const source = [first, active, { id: "other" }];
  const result = shufflePlaybackQueue(source, 1);

  assert.equal(result.queue[0], active);
  assert.equal(result.queue.length, source.length);
  assert.equal(result.queue.filter((song) => song.id === "same").length, 2);
  assert.deepEqual(source, [first, active, source[2]], "shuffle does not mutate the source order");
});
