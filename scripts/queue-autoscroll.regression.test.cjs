const assert = require("node:assert/strict");
const vm = require("node:vm");
const test = require("node:test");
const babel = require("@babel/core");

function fixture({ viewport = 400, content = 6000, offset = 0, rowTop = 340, horizontal = false, round = false, platform = "ios", attachedInitially = true } = {}) {
  const shared = value => ({ value });
  const values = {
    scrollOffset: shared(offset), scrollViewSize: shared(content), containerSize: shared(viewport),
    activeCellSize: shared(60), hoverOffset: shared(offset + rowTop), activeIndexAnim: shared(0),
    isTouchActiveNative: shared(true), disabled: shared(false), horizontalAnim: shared(horizontal),
  };
  const calls = [];
  const effects = [];
  const reactions = [];
  const activations = [];
  let frameCallback;
  let active = false;
  let attached;
  const native = { native: true };
  function animatedRef(ref) { if (arguments.length) attached = ref; return attached; }
  // Reanimated 4.7 serializes this JS ref function to a non-callable UI object.
  const uiRef = { get value() { return attached; } };
  function onUI(fn) {
    assert.ok(fn.__initData?.code, "execute the Babel-generated worklet, not its JS version");
    const worklet = vm.runInNewContext(fn.__initData.code);
    return worklet.bind({ __closure: fn.__closure.map(value => value === animatedRef ? uiRef : value) });
  }
  const compiled = { exports: {} };
  const code = babel.transformFileSync("node_modules/react-native-draggable-flatlist/src/hooks/useAutoScroll.tsx", {
    configFile: false, babelrc: false, presets: ["@babel/preset-typescript"],
    plugins: ["react-native-worklets/plugin", "@babel/plugin-transform-modules-commonjs"],
  }).code;
  vm.runInNewContext(code, {
    module: compiled, exports: compiled.exports, global: { Error },
    require(name) {
      if (name === "react-native") return { Platform: { OS: platform } };
      if (name === "react") return { useCallback: fn => fn, useEffect: fn => effects.push(fn) };
      if (name === "react-native-reanimated") return {
        useAnimatedRef: () => animatedRef,
        useFrameCallback: (callback, autostart) => {
          frameCallback = onUI(callback);
          active = autostart;
          return { setActive: value => { active = value; activations.push(value); } };
        },
        useAnimatedReaction: (read, react) => reactions.push({ read: onUI(read), react: onUI(react), previous: null }),
        runOnJS: fn => fn,
        scrollTo: (ref, x, y, animated) => {
          assert.equal(typeof ref, "object", "UI animated refs are not callable");
          if (!ref.value) return; // Native dispatchCommand guards uninitialized refs.
          assert.equal(ref.value, native, "native scroll node, not a JS FlatList ref");
          calls.push({ x, y, animated });
          const requested = horizontal ? x : y;
          // Model native rounding; scroll events need not reach the exact target.
          const actual = round ? Math.round(requested * 2) / 2 : requested;
          const delta = actual - values.scrollOffset.value;
          values.scrollOffset.value = actual;
          values.hoverOffset.value += delta;
        },
      };
      if (name.endsWith("constants")) return { DEFAULT_PROPS: {} };
      if (name.endsWith("propsContext")) return { useProps: () => ({ autoscrollThreshold: 96, autoscrollSpeed: 100 }) };
      if (name.endsWith("animatedValueContext")) return { useAnimatedValues: () => values };
      if (name.endsWith("refContext")) return { useRefs: () => ({ flatlistRef: { current: {
        getNativeScrollRef: () => attachedInitially ? native : null,
        scrollToOffset() { throw new Error("Autoscroll must not wait for a JS animated jump"); },
      } } }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  compiled.exports.useAutoScroll();
  effects.forEach(effect => effect());
  function frame(ms = 16) {
    reactions.forEach(reaction => {
      const next = reaction.read();
      if (next !== reaction.previous) reaction.react(next, reaction.previous);
      reaction.previous = next;
    });
    if (active) frameCallback({ timeSincePreviousFrame: ms });
  }
  return { values, calls, activations, frame, isActive: () => active };
}

for (const platform of ["ios", "android"]) {
  test(`${platform}: first drag frame supports Reanimated 4.7 UI refs`, () => {
    const f = fixture({ platform });
    assert.doesNotThrow(() => f.frame());
    assert.equal(f.calls.length, 1);
  });
}

test("uninitialized native refs safely skip scrolling", () => {
  const f = fixture({ attachedInitially: false });
  assert.doesNotThrow(() => f.frame());
  assert.equal(f.calls.length, 0);
});

test("holding a row at the lower edge scrolls continuously to the last row", () => {
  const f = fixture({ round: true });
  for (let tick = 0; tick < 650; tick++) f.frame();
  assert.equal(f.values.scrollOffset.value, 5600);
  assert.ok(f.calls.length > 100);
  assert.ok(f.calls.every(call => call.animated === false && call.x === 0 && call.y >= 0 && call.y <= 5600));
  const reachedEnd = f.calls.length;
  f.frame();
  assert.equal(f.calls.length, reachedEnd);
});

test("edge scrolling speeds up with penetration and keeps movement small on dropped frames", () => {
  const near = fixture({ rowTop: 255 });
  const edge = fixture({ rowTop: 340 });
  near.frame(); edge.frame();
  assert.ok(near.values.scrollOffset.value > 0);
  assert.ok(near.values.scrollOffset.value < edge.values.scrollOffset.value);
  edge.frame(500);
  assert.ok(edge.calls.at(-1).y - edge.calls.at(-2).y <= 19.2 + 0.001);
});

test("a held row can reverse from the bottom edge to the top without waiting for a target", () => {
  const f = fixture({ offset: 1200 });
  f.frame();
  const before = f.values.scrollOffset.value;
  f.values.hoverOffset.value = before;
  for (let tick = 0; tick < 150; tick++) f.frame();
  assert.equal(f.values.scrollOffset.value, 0);
});

test("middle positions, short content and missing touch intent do not scroll", () => {
  const middle = fixture({ rowTop: 150 });
  middle.frame();
  assert.equal(middle.calls.length, 0);
  const short = fixture({ content: 200 });
  short.frame();
  assert.equal(short.calls.length, 0);
  const released = fixture();
  released.values.isTouchActiveNative.value = false;
  released.frame();
  assert.equal(released.calls.length, 0);
  assert.equal(released.isActive(), false);
});

test("release/cancellation and drop spring disable the frame loop", () => {
  for (const cancel of [values => { values.isTouchActiveNative.value = false; },
    values => { values.activeIndexAnim.value = -1; }, values => { values.disabled.value = true; }]) {
    const f = fixture();
    f.frame();
    assert.equal(f.calls.length, 1);
    cancel(f.values);
    f.frame(); f.frame();
    assert.equal(f.calls.length, 1);
    assert.equal(f.isActive(), false);
    assert.deepEqual(f.activations, [true, false]);
  }
});

test("small viewports choose the closest edge and horizontal lists use the native x axis", () => {
  const tiny = fixture({ viewport: 80, rowTop: 20 });
  tiny.frame();
  assert.ok(tiny.values.scrollOffset.value > 0);
  const horizontal = fixture({ horizontal: true });
  horizontal.frame();
  assert.ok(horizontal.calls[0].x > 0);
  assert.equal(horizontal.calls[0].y, 0);
});
