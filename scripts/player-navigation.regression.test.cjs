const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, require: name => {
    if (!(name in dependencies)) throw Error(name);
    return dependencies[name];
  } });
  return module.exports;
}

test('player opening delegates to navigation without speculative visibility or animation locks', () => {
  const actions = [];
  const player = load('src/lib/playerUIState.ts', {
    react: { useSyncExternalStore: (_subscribe, get) => get() },
    'expo-router': { router: {
      navigate: path => actions.push(['navigate', path]),
    } },
  });
  for (let i = 0; i < 50; i++) {
    player.expandPlayer();
    assert.equal(player.playerUIStateStore.current, 'hidden', 'route focus owns visibility');
    player.playerUIStateStore.expandPlayer();
    player.playerUIStateStore.collapsePlayer();
    player.expandPlayer();
    assert.equal(player.playerUIStateStore.current, 'mini', 'a new request never waits for an old close callback');
    player.playerUIStateStore.hidePlayer();
  }
  assert.equal(actions.filter(([action]) => action === 'navigate').length, 100);
  assert(actions.filter(([action]) => action === 'navigate').every(([, path]) => path === '/player'));
});

test('player deep link renders the same native route directly without a redirect cycle', () => {
  const screen = () => null;
  const route = load('app/player.tsx', {
    '@/features/player/screens/PlayerScreen': { __esModule: true, default: screen },
  });
  assert.equal(route.default, screen);
});

test('back navigation follows the native stack even while a player is visible', () => {
  const actions = [];
  let canGoBack = true;
  const { safeGoBack } = load('src/utils/navigation.ts', {
    'expo-router': { router: {
      canGoBack: () => canGoBack, back: () => actions.push('back'), replace: path => actions.push(path),
    } },
  });
  safeGoBack(); canGoBack = false; safeGoBack();
  assert.deepEqual(actions, ['back', '/(tabs)']);
});

test('native queue reuses queue content and returns to the player without redirecting into a root overlay', () => {
  const actions = [];
  const route = load('src/features/player/screens/QueueScreen.tsx', {
    react: { useCallback: fn => fn },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@/components/QueueBottomSheet': { QueueContent: 'QueueContent' },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureHandlerRootView' },
    'expo-router': {
      useIsFocused: () => true,
      useNavigation: () => ({ canGoBack: () => true, goBack: () => actions.push('back') }),
      router: { dismissTo: path => actions.push(path) },
    },
  });
  const content = route.default().props.children;
  assert.equal(content.type, 'QueueContent');
  assert.equal(content.props.nativeScreen, true);
  content.props.onClose(); content.props.onOpenPlayer();
  assert.deepEqual(actions, ['back', '/player']);
});

test('covered navigation retains the selected tab through repeated player and queue open/close', () => {
  let pathname = '/library', state;
  const { useActiveNavTab } = load('src/features/navigation/useActiveNavTab.ts', {
    react: { useState: initial => { state ??= initial; return [state, next => { state = next; }]; } },
    'expo-router': { usePathname: () => pathname },
  });
  const render = path => { pathname = path; return useActiveNavTab(); };
  for (const [path, expected] of [['/library', 'library'], ['/search', 'search'], ['/liked-songs', 'liked-songs'], ['/downloads', 'library']]) {
    assert.equal(render(path), expected);
    for (let i = 0; i < 50; i++) {
      assert.equal(render('/player'), expected);
      assert.equal(render('/queue'), expected);
      assert.equal(render('/song-options'), expected);
      assert.equal(render('/player'), expected);
      assert.equal(render(path), expected);
    }
  }
  assert.equal(render('/'), 'index', 'an actual Home navigation still changes selection');
});

test('secondary screens own their dock so a modal naturally covers it', () => {
  let auth = { loading: false, isAuthenticated: true, isGuest: false };
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const { ScreenWithNavigation } = load('src/features/navigation/ScreenWithNavigation.tsx', {
    'react/jsx-runtime': jsx,
    'react-native': { View: 'View' },
    '@/contexts/AuthContext': { useAuth: () => auth },
    '@/lib/authFeatures': { GUEST_LOGIN_ENABLED: true },
    './AppNavBar': { AppNavBar: 'AppNavBar' },
  });
  const dependencies = {
    'react/jsx-runtime': jsx,
    '@/features/navigation/ScreenWithNavigation': { ScreenWithNavigation },
    '@/constants/colors': { __esModule: true, default: { background: '#000' } },
    'expo-router': { Stack: 'Stack' },
    '@/features/downloads/screens/DownloadedSongsScreen': { DownloadedSongsScreen: 'Downloads' },
  };
  for (const file of ['app/playlist/_layout.tsx', 'app/artist/_layout.tsx', 'app/downloads.tsx']) {
    const tree = load(file, dependencies).default();
    assert.equal(tree.type, ScreenWithNavigation);
    const rendered = tree.type(tree.props);
    assert.equal(rendered.props.children[0], tree.props.children);
    assert.equal(rendered.props.children[1].type, 'AppNavBar');
  }
  const downloads = load('app/downloads.tsx', dependencies).default;
  assert.equal(load('app/downloaded-songs.tsx', { './downloads': { __esModule: true, default: downloads } }).default, downloads,
    'both download URLs keep the same screen-owned dock');
  auth = { loading: true, isAuthenticated: true, isGuest: false };
  assert.equal(ScreenWithNavigation({ children: 'screen' }).props.children[1], false);
  auth = { loading: false, isAuthenticated: false, isGuest: false };
  assert.equal(ScreenWithNavigation({ children: 'screen' }).props.children[1], false);
  auth.isGuest = true;
  assert.equal(ScreenWithNavigation({ children: 'screen' }).props.children[1].type, 'AppNavBar');
});
