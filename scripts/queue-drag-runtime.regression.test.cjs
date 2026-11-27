const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function fixture(file, platform) {
  let inner, cursor = 0, effects = [];
  const slots = [];
  const values = new Proxy({}, { get: (target, key) => target[key] ??= { value: -1 } });
  values.disabled.value = false;
  const refs = {
    cellDataRef: { current: new Map() }, keyToIndexRef: { current: new Map() },
    propsRef: { current: {} }, animationConfigRef: { value: {} },
    containerRef: {}, flatlistRef: {},
  };
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = next; }];
    },
    useCallback: fn => fn, useMemo: fn => fn(),
    useEffect: fn => effects.push(fn), useLayoutEffect: fn => effects.push(fn),
    forwardRef: fn => fn,
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const native = { Platform: { OS: platform } };
  // RN 0.88 throws for this removed export in development and omits it in release.
  Object.defineProperty(native, "InteractionManager", { get() { throw new Error("removed InteractionManager"); } });
  const gesture = new Proxy({}, { get: () => () => gesture });
  const animated = { createAnimatedComponent: () => "FlatList", View: "View" };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, setTimeout,
    require(name) {
      if (name.startsWith("@babel/runtime/")) return require(name);
      if (name === "react") return react;
      if (name === "react-native") return native;
      if (name === "react-native-gesture-handler") return { FlatList: "FlatList", Gesture: { Pan: () => gesture }, GestureDetector: "GestureDetector" };
      if (name === "react-native-reanimated") return { ...animated, default: animated, __esModule: true,
        runOnJS: fn => fn, useAnimatedReaction() {}, useAnimatedScrollHandler: x => x,
        useSharedValue: value => ({ value }), withSpring: value => value };
      if (name.endsWith("utils")) return { typedMemo: fn => { inner = fn; return fn; } };
      if (name.endsWith("constants")) return { DEFAULT_PROPS: {} };
      if (name.endsWith("useStableCallback")) return { useStableCallback: fn => fn };
      if (name.endsWith("useAutoScroll")) return { useAutoScroll() {} };
      if (name.endsWith("animatedValueContext")) return { useAnimatedValues: () => values };
      if (name.endsWith("refContext")) return { useRefs: () => refs };
      return { default: name, DraggableFlatListProvider: name };
    },
  });
  function render(data) {
    cursor = 0; effects = [];
    refs.propsRef.current = { data };
    const tree = inner({ data, keyExtractor: item => item.id });
    effects.forEach(fn => fn());
    return tree;
  }
  return { render, values };
}

for (const file of ["src/components/DraggableFlatList.tsx", "lib/module/components/DraggableFlatList.js", "lib/commonjs/components/DraggableFlatList.js"]) {
  for (const platform of ["ios", "android"]) {
    test(`${platform} ${file}: drop and queue replacement reset without removed RN APIs`, () => {
      const f = fixture(`node_modules/react-native-draggable-flatlist/${file}`, platform);
      const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
      f.render([a, b, c]);
      f.values.activeIndexAnim.value = 0;
      f.values.spacerIndexAnim.value = 2;
      f.values.touchTranslate.value = 120;
      f.render([b, c, a]);
      assert.equal(f.values.activeIndexAnim.value, -1);
      assert.equal(f.values.spacerIndexAnim.value, -1);
      assert.equal(f.values.touchTranslate.value, 0);
      // An unchanged render must not cancel the next drag.
      f.values.activeIndexAnim.value = 1;
      f.render([b, c, a]);
      assert.equal(f.values.activeIndexAnim.value, 1);
      f.render([]);
      assert.equal(f.values.activeIndexAnim.value, -1);
    });
  }
}
