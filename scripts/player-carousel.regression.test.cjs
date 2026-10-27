const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const slots = []; let cursor = 0;
  const plays = [];
  const songs = ['a', 'b', 'c'].map(id => ({id}));
  const react = {
    useRef: value => { const index = cursor++; return slots[index] ??= {current:value}; },
    useState: value => { const index = cursor++; return [slots[index] ??= typeof value === 'function' ? value() : value, () => {}]; },
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useEffect: (effect, deps) => {
      const index = cursor++; const previous = slots[index]; slots[index] = deps;
      if (!previous || deps.some((value, at) => value !== previous[at])) effect();
    },
  };
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync('src/features/player/hooks/usePlayerQueueCarousel.ts','utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code, {module, exports:module.exports, require:name => {
    if (name === 'react') return react;
    if (name === '@/lib/nativeAnimated') return {Value: class {}, event: () => () => {}};
    throw Error(name);
  }});
  const render = (index = 0) => {
    cursor = 0;
    return module.exports.usePlayerQueueSwipe({
      playingQueue:songs, activeQueueIndex:index, currentSongId:songs[index].id,
      pageWidth:100, playSong:song => plays.push(song.id),
    });
  };
  return {render, plays};
}
const finish = index => ({nativeEvent:{contentOffset:{x:index*100}}});

test('programmatic artwork alignment cannot select another song', () => {
  const f=fixture(); const hook=f.render(1);
  hook.handleScrollFinished(finish(0));
  assert.deepEqual(f.plays,[]);
});

test('a user swipe selects once and subsequent programmatic momentum is ignored', () => {
  const f=fixture(); const hook=f.render();
  hook.handleScrollBeginDrag(); hook.handleScrollFinished(finish(1));
  hook.handleScrollFinished(finish(2));
  assert.deepEqual(f.plays,['b']);
});

test('rapid intentional swipes are not dropped while artwork advances', () => {
  const f=fixture(); const hook=f.render();
  hook.handleScrollBeginDrag(); hook.handleScrollFinished(finish(1));
  hook.handleScrollBeginDrag(); hook.handleScrollFinished(finish(2));
  assert.deepEqual(f.plays,['b','c']);
});

test('a native lock-screen selection cancels an outgoing artwork gesture', () => {
  const f=fixture(); let hook=f.render(); hook.handleScrollBeginDrag();
  hook=f.render(2); hook.handleScrollFinished(finish(1));
  assert.deepEqual(f.plays,[]);
});
