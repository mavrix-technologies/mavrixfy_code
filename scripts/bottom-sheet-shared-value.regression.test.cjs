const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('bottom-sheet layout listeners are released across repeated player mounts', () => {
  const listeners = new Set(), effects = [];
  const module = { exports: {} };
  const source = fs.readFileSync('node_modules/@gorhom/bottom-sheet/src/hooks/useAnimatedLayout.ts', 'utf8');
  const mutable = value => ({ value, get() { return this.value; }, modify(fn) { this.value = fn(this.value); } });
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports,
    require: name => ({
      react: { useMemo: fn => fn(), useState: fn => [fn()], useEffect: fn => effects.push(fn) },
      'react-native': { Platform: { OS: 'android' }, Dimensions: {
        get: () => ({ width: 360, height: 772 }),
        addEventListener: (_event, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; },
      } },
      'react-native-reanimated': { makeMutable: mutable, useAnimatedReaction() {} },
      '../constants': { INITIAL_LAYOUT_VALUE: -999, INITIAL_CONTAINER_LAYOUT: { offset: {} } },
    })[name],
  });
  for (let mount = 0; mount < 50; mount++) {
    const state = module.exports.useAnimatedLayout(undefined, 0, 0, false, true);
    const cleanup = effects.splice(0).map(fn => fn());
    assert.equal(listeners.size, 1);
    listeners.forEach(fn => fn({ window: { width: 772, height: 360 } }));
    assert.equal(state.get().window.height, 360);
    cleanup.forEach(fn => fn?.());
    assert.equal(listeners.size, 0, 'closed player does not retain a window listener or animated state');
  }
});

test('bottom-sheet primitive updates commit without writing shared values during render', () => {
  const slots = [], effects = [], writes = [];
  let index = 0, rendering = false;
  const module = { exports: {} };
  const source = fs.readFileSync('node_modules/@gorhom/bottom-sheet/src/hooks/useReactiveSharedValue.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports,
    require: name => name === 'react' ? {
      useRef: initial => slots[index++] ?? (slots[index - 1] = { current: initial }),
      useLayoutEffect: fn => effects.push(fn), useEffect() {},
    } : { cancelAnimation() {}, makeMutable(initial) {
      let value = initial;
      return { get value() { return value; }, set value(next) {
        assert.equal(rendering, false, 'shared value writes must happen after render');
        writes.push(next); value = next;
      } };
    } },
  });
  const render = value => {
    index = 0; rendering = true;
    const result = module.exports.useReactiveSharedValue(value);
    rendering = false; effects.splice(0).forEach(fn => fn());
    return result;
  };
  const shared = render(-1);
  assert.equal(render(0), shared);
  render(0); render(-1);
  assert.deepEqual(writes, [0, -1], 'same props do not rewrite the animated index');
  assert.equal(shared.value, -1);
});
