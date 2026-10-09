const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function fixture({ platform = "ios" } = {}) {
  const queue = Array.from({ length: 101 }, (_, index) => ({ id: String(index) }));
  const playback = { queue, currentSong: queue[0], queueIndex: 0, userQueuedSongIds: [], autoplaySongIds: [] };
  const moves = [];
  const played = [];
  let shuffleCalls = 0;
  let toggleCalls = 0;
  let playerOpens = 0;
  let queueReads = 0;
  let playStateReads = 0;
  const playState = { isPlaying: true };
  const actions = {
    reorderQueue: (...args) => moves.push(args),
    playSong: (...args) => played.push(args),
    shuffleQueue: () => { shuffleCalls++; },
    togglePlay: () => { toggleCalls++; },
    sleepTimer: null,
  };
  const slots = { shell: { refs: [], states: [], effects: [], cleanups: [] }, content: { refs: [], states: [], effects: [], cleanups: [] } };
  const backListeners = new Set();
  let scope = slots.shell;
  let controls;
  let refIndex = 0;
  let stateIndex = 0;
  let effectIndex = 0;
  let pendingEffects = [];
  const native = {
    props: null, commands: [], openCompletions: [], closeCompletions: [],
    snapToIndex(index) {
      assert.equal(index, 0);
      this.commands.push("open");
      // Native animation closures retain the callbacks installed at start.
      const props = this.props;
      this.openCompletions.push(() => props.onChange(0));
      props.onAnimate(-1, 0);
    },
    close() {
      this.commands.push("close");
      const props = this.props;
      this.closeCompletions.push(props.onClose);
      props.onAnimate(0, -1);
    },
  };
  const react = {
    memo: fn => fn, useMemo: fn => fn(), useCallback: fn => fn,
    useLayoutEffect: (fn, deps) => {
      const index = effectIndex++;
      const currentScope = scope;
      const previous = scope.effects[index];
      if (!previous || deps.some((dep, i) => dep !== previous[i])) pendingEffects.push(() => {
        currentScope.cleanups[index]?.();
        currentScope.cleanups[index] = fn();
      });
      scope.effects[index] = deps;
    },
    useRef: initial => scope.refs[refIndex++] ?? (scope.refs[refIndex - 1] = { current: initial }),
    useState: initial => {
      const index = stateIndex++;
      const currentScope = scope;
      if (!(index in currentScope.states)) currentScope.states[index] = initial;
      return [currentScope.states[index], next => {
        currentScope.states[index] = typeof next === "function" ? next(currentScope.states[index]) : next;
      }];
    },
    useImperativeHandle: (_ref, create) => { controls = create(); },
  };
  react.useEffect = react.useLayoutEffect;
  const jsx = (type, props) => ({ type, props });
  const compiled = { exports: {} };
  const helper = { exports: {} };
  const styles = { exports: {} };
  const compile = file => ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compile("src/services/audio/queueDrag.ts"), { module: helper, exports: helper.exports });
  vm.runInNewContext(compile("src/components/styles/queueBottomSheetStyles.ts"), {
    module: styles, exports: styles.exports,
    require(name) {
      if (name === "react-native") return { StyleSheet: { create: value => value, hairlineWidth: 1 } };
      if (name.endsWith("colors")) return { __esModule: true, default: { primary: "green" } };
      throw new Error(`Unexpected style dependency: ${name}`);
    },
  });
  vm.runInNewContext(compile("src/components/QueueBottomSheet.tsx"), {
    module: compiled, exports: compiled.exports,
    require(name) {
      if (name === "react") return { ...react, default: react };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-native") return { View: "View", Text: "Text", Pressable: "Pressable",
        Platform: { OS: platform }, BackHandler: { addEventListener: (_event, callback) => {
          backListeners.add(callback); return { remove: () => backListeners.delete(callback) };
        } } };
      if (name === "@gorhom/bottom-sheet") return { __esModule: true, default: "BottomSheet", BottomSheetBackdrop: "Backdrop", BottomSheetView: "BottomSheetView" };
      if (name === "react-native-draggable-flatlist") return { __esModule: true, default: "DraggableFlatList", ScaleDecorator: "ScaleDecorator" };
      if (name === "expo-image") return { Image: "Image" };
      if (name === "@expo/vector-icons") return { Ionicons: "Icon" };
      if (name.endsWith("PlayerControlComponents")) return { PlayerPlayButton: "PlayerPlayButton" };
      if (name === "expo-haptics") return { ImpactFeedbackStyle: {} };
      if (name.endsWith("QueueSleepTimer")) return { __esModule: true, default: "QueueSleepTimer" };
      if (name === "react-native-safe-area-context") return { useSafeAreaInsets: () => ({ bottom: 34 }) };
      if (name.endsWith("PlayerContext")) return { usePlayerActions: () => actions };
      if (name.endsWith("PlaybackEngine")) return {
        usePlaybackQueueState: () => { queueReads++; return playback; },
        usePlaybackPlayState: () => { playStateReads++; return playState; },
      };
      if (name.endsWith("queueDrag")) return helper.exports;
      if (name.endsWith("queueBottomSheetStyles")) return styles.exports;
      if (name.endsWith("haptics")) return { triggerImpact() {} };
      if (name.endsWith("playerUIState")) return { expandPlayer: () => { playerOpens++; } };
      if (name.endsWith("colors")) return { default: {} };
      if (name.endsWith("AdMobBanner")) return { __esModule: true, default: "AdMobBanner" };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  function renderShell() {
    scope = slots.shell;
    refIndex = 0; stateIndex = 0; effectIndex = 0; pendingEffects = [];
    const sheet = compiled.exports.default({});
    native.props = sheet.props;
    sheet.props.ref.current = native;
    pendingEffects.forEach(fn => fn());
    return sheet;
  }
  renderShell();
  function render({ prepareNative = true } = {}) {
    let sheet = renderShell();
    if (!sheet.props.children) { controls.expand(); sheet = renderShell(); }
    const contentComponent = sheet.props.children;
    scope = slots.content;
    refIndex = 0; stateIndex = 0; effectIndex = 0; pendingEffects = [];
    const content = contentComponent.type(contentComponent.props);
    assert.equal(content.type, "BottomSheetView");
    const [queuePage, timer] = content.props.children;
    const children = queuePage.props.children;
    const list = children.find(child => child?.type === "DraggableFlatList");
    pendingEffects.forEach(fn => fn());
    if (prepareNative) {
      if (list.props.data.length) {
        list.props.onViewableItemsChanged({ viewableItems: [{ isViewable: true }], changed: [] });
      } else content.props.onLayout();
    }
    return { sheet, list, children, queuePage, timer };
  }
  return { render, renderShell, controls: () => controls, moves, played, playback, playState, actions,
    native, finishOpen: () => native.openCompletions.at(-1)(), finishClose: () => native.closeCompletions.at(-1)(),
    backListeners,
    shuffleCalls: () => shuffleCalls, toggleCalls: () => toggleCalls, playerOpens: () => playerOpens,
    queueReads: () => queueReads, playStateReads: () => playStateReads, styles: styles.exports };
}

test("queue list owns native scrolling with controls outside the drag viewport", () => {
  const { sheet, list, children } = fixture().render();
  assert.equal(sheet.props.enableContentPanningGesture, false);
  assert.equal(sheet.props.enablePanDownToClose, true);
  assert.equal(sheet.props.footerComponent, undefined);
  assert.equal(list.props.renderScrollComponent, undefined);
  assert.equal(list.props.dragItemOverflow, undefined);
  assert.equal(list.props.ListFooterComponent, undefined);
  assert.equal(children.at(-1).props.style.height, 34);
  const header = children.find(child => child?.type.displayName === "QueueHeader");
  assert.equal(header.type.displayName, "QueueHeader");
  assert.equal(typeof header.props.onShuffle, "function");
  assert.equal(typeof header.props.onTimer, "function");
  assert.notEqual(sheet.props.handleComponent().type.displayName, "QueueHeader",
    "action buttons are outside the sheet's dismissal pan gesture");
});

test("Playing next remains outside the dragged cells and all rows retain the same layout", () => {
  const f = fixture();
  const { list, children } = f.render();
  const heading = children.find(child => child?.props?.children?.[0]?.props?.children === "Playing next");
  assert.ok(heading);
  assert.ok(children.indexOf(heading) < children.indexOf(list));
  for (const [index, item] of list.props.data.entries()) {
    const row = list.props.renderItem({ item, drag() {}, isActive: index === 0 });
    assert.equal(row.type.displayName, "QueueRow");
    assert.equal(Object.hasOwn(item, "isFirstInSection"), false);
    const layout = list.props.getItemLayout(null, index);
    assert.equal(layout.length, f.styles.s.row.height);
    assert.equal(layout.offset, index * layout.length);
  }
});

test("header controls preserve shuffle and timer actions and their active states", () => {
  const f = fixture();
  f.playback.isShuffled = true;
  f.actions.sleepTimer = { label: "15 min" };
  const { children } = f.render();
  const header = children.find(child => child?.type.displayName === "QueueHeader");
  const rendered = header.type(header.props);
  const controls = rendered.props.children.props.children[1].props.children;
  assert.equal(controls[0].props.accessibilityState.selected, true);
  assert.equal(controls[1].props.accessibilityLabel, "Sleep timer: 15 min");
  controls[0].props.onPress();
  controls[1].props.onPress();
  assert.equal(f.shuffleCalls(), 1);
  const timerPage = f.render();
  assert.equal(timerPage.timer.type, "QueueSleepTimer");
  assert.equal(timerPage.queuePage.props.pointerEvents, "none");
  assert.equal(timerPage.queuePage.props.accessibilityElementsHidden, true);
  assert.equal(f.native.commands.at(-1), "open", "timer must not close or animate another sheet");
  assert.equal(timerPage.list.type, "DraggableFlatList", "queue remains mounted while timer is open");
  timerPage.timer.props.onBack();
  const returned = f.render();
  assert.equal(returned.timer, false);
  assert.equal(returned.queuePage.props.pointerEvents, "auto");
  assert.equal(returned.list.props.data[0].song, timerPage.list.props.data[0].song);
});

test("an unchanged row press reads the latest queue after a reorder", () => {
  const f = fixture();
  const { list } = f.render();
  const item = list.props.data[0];
  const row = list.props.renderItem({ item, drag() {}, isActive: false });
  f.playback.queue = [f.playback.queue[0], ...f.playback.queue.slice(1).reverse()];
  f.render();
  row.props.onPress(item.song);
  assert.equal(f.played[0][0], item.song);
  assert.equal(f.played[0][1], f.playback.queue);
});

test("the drag handle activates on touch without waiting for a long press", () => {
  const { list } = fixture().render();
  let drags = 0;
  const element = list.props.renderItem({ item: list.props.data[0], drag: () => { drags++; }, isActive: false });
  const rendered = element.type(element.props);
  const handle = rendered.props.children[1];
  assert.equal(handle.props.onLongPress, undefined);
  assert.equal(handle.props.delayLongPress, undefined);
  handle.props.onPressIn();
  assert.equal(drags, 1);
});

test("sheet drop moves first upcoming song to last and handles repeated drags", () => {
  const f = fixture();
  const { list } = f.render();
  for (let attempt = 0; attempt < 3; attempt++) {
    list.props.onDragBegin(0);
    list.props.onDragEnd({ from: 0, to: 99 });
  }
  assert.deepEqual(f.moves.map(args => args.slice(0, 2)), [[1, 100], [1, 100], [1, 100]]);
  for (const [, , expectedState] of f.moves) {
    assert.equal(expectedState.queue, f.playback.queue);
    assert.equal(expectedState.queueIndex, 0);
  }
});

test("sheet ignores cancelled or stale drop callbacks after playback changes", () => {
  const f = fixture();
  let { list } = f.render();
  list.props.onDragEnd({ from: 0, to: 99 });
  list.props.onDragBegin(0);
  list.props.onDragEnd({ from: 1, to: 99 });
  assert.equal(f.moves.length, 0);
  list.props.onDragBegin(0);
  f.playback.queueIndex = 1;
  f.playback.currentSong = f.playback.queue[1];
  ({ list } = f.render());
  list.props.onDragEnd({ from: 0, to: 99 });
  assert.equal(f.moves.length, 0);
});

test("closed queue retains native layout without subscribing to playback or building rows", () => {
  const f = fixture();
  const shell = f.renderShell();
  assert.equal(shell.props.index, -1);
  assert.equal(shell.props.children, false);
  assert.equal(f.queueReads(), 0);
  assert.equal(f.playStateReads(), 0);
  const { children } = f.render();
  assert.equal(f.queueReads(), 1);
  assert.equal(f.playStateReads(), 0, "play/pause updates belong to the now-playing row");
  assert.equal(children.some(child => child?.type === "AdMobBanner"), false);
});

test("content and ads are retained through close and released at native completion", () => {
  const f = fixture();
  let { sheet } = f.render();
  f.finishOpen();
  let rendered = f.render();
  assert.ok(rendered.children.find(child => child?.type === "AdMobBanner"));
  f.controls().close();
  sheet = f.renderShell();
  assert.equal(sheet.props.index, -1);
  assert.ok(sheet.props.children, "do not unmount rows during the closing animation");
  assert.equal(sheet.props.children.props.interactionReady, true);
  f.finishClose();
  assert.equal(f.renderShell().props.children, false);
});

test("rapid open-close-open ignores delayed native callbacks and keeps the current sheet", () => {
  const f = fixture();
  for (let cycle = 0; cycle < 30; cycle++) {
    f.controls().expand();
    const opening = f.render().sheet;
    f.controls().close();
    const closing = f.renderShell();
    closing.props.onAnimate(0, -1);
    f.controls().expand();
    // An obsolete callback may reach JS before React commits the new open.
    closing.props.onAnimate(0, -1);
    closing.props.onClose();
    opening.props.onChange(0);
    const current = f.renderShell();
    assert.equal(f.native.commands.at(-1), "open");
    assert.ok(current.props.children);
    assert.equal(current.props.children.props.interactionReady, false);
    current.props.onAnimate(-1, 0);
    current.props.onChange(0);
    assert.equal(f.renderShell().props.children.props.interactionReady, true);
    // Handle/backdrop dismissal has no imperative close request.
    const gestureClose = f.renderShell();
    gestureClose.props.onAnimate(0, -1);
    gestureClose.props.onClose();
    assert.equal(f.renderShell().props.children, false);
  }
});

test("closing before an opening commit never flashes queue content", () => {
  const f = fixture();
  f.controls().expand();
  f.controls().close();
  const shell = f.renderShell();
  assert.equal(shell.props.index, -1);
  assert.equal(f.renderShell().props.children, false);
  assert.deepEqual(f.native.commands, []);
  f.controls().expand();
  f.render();
  assert.equal(f.native.commands.at(-1), "open");
});

test("now-playing artwork opens the player independently from its play/pause button", () => {
  const f = fixture();
  const { children } = f.render();
  const section = children.find(child => child?.type?.displayName === "QueueNowPlaying");
  const row = section.type(section.props).props.children[1];
  const [songPress, playPress] = row.props.children;
  playPress.props.onPress();
  assert.equal(f.toggleCalls(), 1);
  assert.equal(f.playerOpens(), 0);
  assert.ok(f.renderShell().props.children);
  assert.equal(f.native.commands.at(-1), "open");
  songPress.props.onPress();
  assert.equal(f.playerOpens(), 1);
  assert.equal(f.toggleCalls(), 1);
  assert.equal(f.renderShell().props.index, -1);
  assert.equal(f.native.commands.at(-1), "close");
  f.playState.isPlaying = false;
  assert.equal(section.type(section.props).props.children[1].props.children[1].props.accessibilityLabel, "Play");
});

test("opening waits for native row measurements instead of competing with list mounting", () => {
  const f = fixture();
  const { list } = f.render({ prepareNative: false });
  assert.deepEqual(f.native.commands, []);
  list.props.onViewableItemsChanged({ viewableItems: [], changed: [] });
  assert.deepEqual(f.native.commands, []);
  list.props.onViewableItemsChanged({ viewableItems: [{ isViewable: true }], changed: [] });
  assert.deepEqual(f.native.commands, ["open"]);
  list.props.onViewableItemsChanged({ viewableItems: [{ isViewable: true }], changed: [] });
  assert.deepEqual(f.native.commands, ["open"], "scroll events must not reopen the sheet");
  f.finishOpen();
  f.renderShell();
  f.controls().close();
  f.renderShell();
  f.finishClose();
  assert.equal(f.renderShell().props.children, false, "close uses callbacks committed for its request");
});

test("empty queues can open without a viewable row", () => {
  const f = fixture();
  f.playback.queue = [];
  f.playback.currentSong = null;
  const { list } = f.render();
  assert.equal(list.props.data.length, 0);
  assert.deepEqual(f.native.commands, ["open"]);
  f.finishOpen();
  f.renderShell();
  f.controls().close();
  f.renderShell();
  f.finishClose();
  assert.equal(f.renderShell().props.children, false);
});

test("Android back closes the queue before the underlying player and unregisters when closed", () => {
  const f = fixture({ platform: "android" });
  assert.equal(f.backListeners.size, 0);
  f.render();
  assert.equal(f.backListeners.size, 1);
  assert.equal([...f.backListeners][0](), true);
  f.renderShell();
  assert.equal(f.native.commands.at(-1), "close");
  f.finishClose();
  f.renderShell();
  assert.equal(f.backListeners.size, 0);
  const ios = fixture();
  ios.render();
  assert.equal(ios.backListeners.size, 0);
});

test("Android back returns from timer to queue before dismissing the sheet", () => {
  const f = fixture({ platform: "android" });
  const first = f.render();
  first.children.find(child => child?.type.displayName === "QueueHeader").props.onTimer();
  assert.equal(f.render().timer.type, "QueueSleepTimer");
  assert.equal(f.backListeners.size, 2);
  assert.equal([...f.backListeners].at(-1)(), true);
  const returned = f.render();
  assert.equal(returned.timer, false);
  assert.equal(f.backListeners.size, 1);
  assert.equal(f.native.commands.at(-1), "open");
  [...f.backListeners].at(-1)();
  f.renderShell();
  assert.equal(f.native.commands.at(-1), "close");
});
