const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture(file, exportName, props) {
  let foreground = true, slot = 0, loops = 0, stopped = 0, allocations = 0;
  const slots = [], pending = [];
  const Value = class { constructor(value) { allocations++; this.value = value; } setValue(value) { this.value = value; } interpolate() { return this; } };
  const react = {
    memo: fn => fn, createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: initial => { const index = slot++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef: initial => { const index = slot++; return slots[index] ??= { current: initial }; },
    useMemo: fn => fn(), useCallback: fn => fn,
    useEffect: (fn, deps) => {
      const index = slot++, old = slots[index];
      if (!old || deps.some((value, i) => value !== old.deps[i])) pending.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
    },
  };
  const animation = { start() {}, stop() {} };
  const animated = { Value, View: 'AnimatedView', timing: () => animation, delay: () => animation, sequence: () => animation,
    parallel: () => animation, loop: () => { loops++; return { start() {}, stop() { stopped++; } }; } };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, React: react, require: name => ({
    react, '@/lib/nativeAnimated': animated, '@/lib/appActivity': { useAppIsActive: () => foreground },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'android' },
      Easing: { out: value => value, inOut: value => value, cubic: 0, linear: 0 }, StyleSheet: { create: value => value, flatten: value => value || {} } },
    'expo-linear-gradient': { LinearGradient: 'Gradient' }, './styles/karaokeLyricsStyles': { styles: {} },
  })[name] });
  const render = () => { slot = 0; const tree = module.exports[exportName](props); pending.splice(0).forEach(fn => fn()); return tree; };
  return { render, setActive: value => { foreground = value; }, counts: () => ({ loops, stopped }), allocations: () => allocations,
    unmount: () => slots.forEach(value => value?.cleanup?.()) };
}

test('loading skeleton stops its loop in background and resumes once', () => {
  const f = fixture('src/components/SongRowSkeleton.tsx', 'default', { count: 8 });
  f.render(); assert.deepEqual(f.counts(), { loops: 1, stopped: 0 });
  f.setActive(false); f.render(); assert.deepEqual(f.counts(), { loops: 1, stopped: 1 });
  f.render(); assert.deepEqual(f.counts(), { loops: 1, stopped: 1 });
  f.setActive(true); f.render(); assert.deepEqual(f.counts(), { loops: 2, stopped: 1 });
  f.unmount(); assert.deepEqual(f.counts(), { loops: 2, stopped: 2 });
});

test('instrumental dots release all three loops when backgrounded', () => {
  const props = { item: { time: 0 }, isActive: true, isPassed: false, isPlaying: false };
  const f = fixture('src/components/KaraokeLyricsSubComponents.tsx', 'SpotifyInstrumentalBreak', props);
  f.render(); assert.equal(f.counts().loops, 0, 'a paused active line is static');
  props.isPlaying = true;
  f.render(); assert.equal(f.counts().loops, 3);
  f.setActive(false); f.render(); assert.equal(f.counts().stopped, 3);
  f.setActive(true); f.render(); assert.equal(f.counts().loops, 6);
  f.unmount(); assert.equal(f.counts().stopped, 6);
});

test('overflowing marquee stops while backgrounded and restores on foreground', () => {
  const props = { text: 'A long track title' };
  const f = fixture('src/components/PingPongScroll.tsx', 'PingPongScroll', props);
  let tree = f.render();
  tree.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
  tree.children[0].props.onTextLayout({ nativeEvent: { lines: [{ width: 300 }] } });
  f.render(); assert.equal(f.counts().loops, 1);
  f.setActive(false); f.render(); assert.equal(f.counts().stopped, 1);
  f.setActive(true); f.render(); assert.equal(f.counts().loops, 2);
  for (let render = 0; render < 20; render++) f.render();
  assert.equal(f.allocations(), 2, 'rendering reuses its two animation objects');
  props.text = 'Short'; f.render();
  assert.equal(f.counts().stopped, 2, 'new text does not reuse the old overflow measurement');
  f.unmount(); assert.equal(f.counts().stopped, 2);
});
