const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

const compiledModule = { exports: {} };
const code = ts.transpileModule(
  fs.readFileSync("src/services/audio/queueDrag.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports });
const { resolveQueueDragMove } = compiledModule.exports;

test("visible drag slots map to their original live queue entries", () => {
  const nowPlaying = { id: "now" };
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" }, d = { id: "d" };
  const queue = [nowPlaying, a, b, c, d];
  const visible = [a, b, c, d];

  assert.deepEqual(
    JSON.parse(JSON.stringify(resolveQueueDragMove(queue, visible, 0, 2, 1))),
    { from: 1, to: 3 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(resolveQueueDragMove(queue, visible, 3, 1, 1))),
    { from: 4, to: 2 },
  );
});

test("drag mapping refuses stale orders containing the active row", () => {
  const nowPlaying = { id: "now" };
  const duplicateA = { id: "same" }, duplicateB = { id: "same" };
  const queue = [nowPlaying, duplicateA, duplicateB];

  assert.equal(resolveQueueDragMove(queue, [nowPlaying, duplicateA], 1, 0, 1), null);
  assert.equal(resolveQueueDragMove(queue, [{ id: "same" }, duplicateB], 0, 1, 1), null);
});

test("first and last upcoming entries can swap across a long queue", () => {
  const queue = Array.from({ length: 201 }, (_, index) => ({ id: String(index) }));
  const visible = queue.slice(1);
  for (const [from, to] of [[0, 199], [199, 0]]) {
    const move = resolveQueueDragMove(queue, visible, from, to, 1);
    assert.equal(move.from, from + 1);
    assert.equal(move.to, to + 1);
    const reordered = [...queue];
    const [song] = reordered.splice(move.from, 1);
    reordered.splice(move.to, 0, song);
    assert.equal(reordered[move.to], visible[from]);
    assert.equal(reordered[0], queue[0]);
  }
});

test("duplicate IDs and repeated song objects use their dragged occurrence", () => {
  const song = { id: "duplicate" };
  const other = { id: "other" };
  const queue = [{ id: "now" }, song, other, song];
  const move = resolveQueueDragMove(queue, queue.slice(1), 2, 0, 1);
  assert.equal(move.from, 3);
  assert.equal(move.to, 1);
});

test("playback advance, shuffle, append and removal invalidate a captured drag", () => {
  const queue = ["now", "a", "b", "c"].map(id => ({ id }));
  const visible = queue.slice(1);
  assert.equal(resolveQueueDragMove(queue, visible, 0, 2, 2), null);
  assert.equal(resolveQueueDragMove([queue[0], queue[2], queue[1], queue[3]], visible, 0, 2, 1), null);
  assert.equal(resolveQueueDragMove([...queue, { id: "new" }], visible, 0, 2, 1), null);
  assert.equal(resolveQueueDragMove(queue.slice(0, -1), visible, 0, 2, 1), null);
});

test("drag rejects invalid indices and maps filtered rows to real queue slots", () => {
  const queue = ["now", "a", "b"].map(id => ({ id }));
  const visible = queue.slice(1);
  for (const invalid of [-1, 0.5, NaN, Infinity, 2]) {
    assert.equal(resolveQueueDragMove(queue, visible, invalid, 1, 1), null);
    assert.equal(resolveQueueDragMove(queue, visible, 0, invalid, 1), null);
  }
  for (const invalid of [-1, 0.5, NaN, Infinity, 3]) {
    assert.equal(resolveQueueDragMove(queue, visible, 0, 1, invalid), null);
  }
  const filteredMove = resolveQueueDragMove([queue[0], queue[1], null, queue[2]], visible, 0, 1, 1);
  assert.equal(filteredMove.from, 1);
  assert.equal(filteredMove.to, 3);
});

test("native draggable worklet selects the last slot at the exact content boundary", () => {
  const compiled = { exports: {} };
  const worklet = ts.transpileModule(
    fs.readFileSync("node_modules/react-native-draggable-flatlist/src/hooks/useCellTranslate.tsx", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const shared = value => ({ value });
  const values = {
    activeIndexAnim: shared(0), activeCellSize: shared(60),
    hoverOffset: shared(1140), spacerIndexAnim: shared(18),
    placeholderOffset: shared(0), hoverAnim: shared(1140),
    viewableIndexMin: shared(10), viewableIndexMax: shared(19),
  };
  vm.runInNewContext(worklet, {
    module: compiled, exports: compiled.exports,
    require(name) {
      if (name === "react-native-reanimated") return {
        useDerivedValue: fn => shared(fn()), withSpring: value => value,
      };
      if (name.endsWith("animatedValueContext")) return { useAnimatedValues: () => values };
      if (name.endsWith("draggableFlatListContext")) return { useDraggableFlatListContext: () => ({ activeKey: "first" }) };
      if (name.endsWith("refContext")) return { useRefs: () => ({ animationConfigRef: shared({}) }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  for (const activeSize of [60, 98]) {
    values.activeCellSize.value = activeSize;
    values.hoverOffset.value = 1200 - activeSize;
    values.spacerIndexAnim.value = 18;
    compiled.exports.useCellTranslate({ cellIndex: 19, cellSize: shared(60), cellOffset: shared(1140) });
    assert.equal(values.spacerIndexAnim.value, 19);
    assert.equal(values.placeholderOffset.value, 1200 - activeSize);
  }
});
