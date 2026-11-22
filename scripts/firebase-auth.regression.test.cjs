const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, require(name) {
    assert.ok(name in imports, `unexpected import ${name}`); return imports[name];
  }, ...globals });
  return module.exports;
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function profileFixture(options = {}) {
  const user = { uid: 'user-a', email: 'a@example.test', displayName: 'Account name', photoURL: '', providerData: [{ providerId: 'google.com' }] };
  const auth = { currentUser: user }, listeners = [], writes = [];
  let transactions = 0;
  const firestore = {
    doc: (_db, collection, uid) => ({ collection, uid }),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    onSnapshot(ref, _options, next, error) {
      const listener = { ref, next, error, active: true }; listeners.push(listener);
      return () => { listener.active = false; };
    },
    async runTransaction(_db, work) {
      transactions++;
      if (options.transactionGate) await options.transactionGate;
      if (options.transactionError) throw options.transactionError;
      return work({
        get: async () => ({ exists: () => !!options.data, data: () => options.data }),
        set: (ref, data) => writes.push({ action: 'set', ref, data }),
        update: (ref, data) => writes.push({ action: 'update', ref, data }),
      });
    },
  };
  const firebase = { auth, db: {} };
  const service = load('src/services/auth/userProfile.ts', { '@/lib/firebase': firebase, 'firebase/firestore': firestore });
  return {
    ...service, user, auth, firebase, listeners, writes, options,
    get transactions() { return transactions; },
    emit(data, fromCache = false, index = listeners.length - 1) {
      listeners[index].next({ exists: () => !!data, data: () => data, metadata: { fromCache } });
    },
  };
}

test('partial OTA manifests retain the bundled Firebase configuration', () => {
  const bundled = require('../app.json');
  for (const Constants of [
    { expoConfig: { extra: { router: { origin: false } } } },
    { manifest2: { extra: { expoClient: { extra: { example: 'ota' } } } } },
    { manifest: { extra: { example: 'legacy' } } },
  ]) {
    const { getExpoExtra } = load('src/lib/expoExtra.ts', {
      'expo-constants': { __esModule: true, default: Constants }, '../../app.json': bundled,
    });
    const extra = getExpoExtra();
    assert.equal(extra.firebaseProjectId, bundled.expo.extra.firebaseProjectId);
    assert.equal(extra.firebaseApiKey, bundled.expo.extra.firebaseApiKey);
  }
});

test('an empty cache does not create or overwrite a remote profile', async () => {
  const f = profileFixture(), profiles = [];
  const stop = f.subscribeToUserProfile(f.user, value => profiles.push(value), assert.fail);
  f.emit(null, true); await flush();
  assert.equal(profiles[0].id, f.user.uid); assert.equal(f.transactions, 0);
  f.emit(null); await flush();
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].action, 'set');
  assert.equal(f.writes[0].data.provider, 'google.com');
  assert.equal(f.writes[0].data.email, f.user.email);
  assert.equal('password' in f.writes[0].data, false);
  f.emit({ fullName: 'Saved name', role: 'admin' }); await flush();
  assert.equal(profiles.at(-1).name, 'Saved name'); assert.equal(profiles.at(-1).isAdmin, true);
  assert.equal(f.transactions, 1, 'profile notifications must not create a write loop'); stop();
});

test('existing profile edits and immutable auth fields survive login synchronization', async () => {
  const f = profileFixture({ data: { fullName: 'Edited name', displayName: 'Edited display', email: 'old@example.test', provider: 'password', role: 'admin', schemaVersion: 1 } });
  await f.syncUserProfile(f.user, { fullName: 'Provider name' });
  const write = f.writes[0]; assert.equal(write.action, 'update');
  assert.deepEqual(Object.keys(write.data).sort(), ['lastLoginAt', 'updatedAt']);
});

test('Apple first-sign-in details fill missing names without replacing stored names', async () => {
  const f = profileFixture({ data: { fullName: '', displayName: 'Existing display' } });
  await f.syncUserProfile(f.user, { fullName: 'Apple Name', appleUserId: 'apple-user' });
  assert.equal(f.writes[0].data.fullName, 'Apple Name');
  assert.equal('displayName' in f.writes[0].data, false);
  assert.equal(f.writes[0].data.appleUserId, 'apple-user');
});

test('logout/account switch ignores late snapshots and cancels writes waiting on a transaction read', async () => {
  const gate = deferred(), f = profileFixture({ transactionGate: gate.promise }), profiles = [];
  const stop = f.subscribeToUserProfile(f.user, value => profiles.push(value), assert.fail);
  f.emit(null); await flush();
  f.auth.currentUser = { ...f.user, uid: 'user-b' }; stop();
  f.emit({ fullName: 'Old user', role: 'admin' }); gate.resolve(); await flush();
  assert.equal(profiles.length, 1); assert.equal(f.writes.length, 0);
});

test('a failed profile synchronization can retry on the next server connection', async () => {
  const f = profileFixture({ transactionError: Error('unavailable') }), errors = [];
  const stop = f.subscribeToUserProfile(f.user, () => {}, error => errors.push(error));
  f.emit(null); await flush(); assert.equal(errors.length, 1);
  f.options.transactionError = null; f.emit(null); await flush();
  assert.equal(f.transactions, 2); assert.equal(f.writes.length, 1); stop();
});

function authFixture(options = {}) {
  const profile = profileFixture(options), slots = [], effects = [], warnings = [];
  let cursor = 0, authCallback, generation = 0, scopedAccount = null;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    Fragment: 'Fragment', createContext: () => ({ Provider: 'Provider' }), use: () => {},
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) {
        const old = slots[i]; slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  profile.auth.currentUser = null;
  const authenticate = async () => {
    if (options.authError) throw options.authError;
    profile.auth.currentUser = profile.user; await authCallback(profile.user);
    return { user: profile.user };
  };
  class Provider { static credential() { return {}; } credential() { return {}; } addScope() {} }
  const imports = {
    react: { __esModule: true, default: react, ...react },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/constants/platform': { IS_WEB: options.web ?? false },
    '@/lib/accountScope': { getAccountScope: () => ({ accountId: scopedAccount, generation }), setAccountScope: uid => { scopedAccount = uid; generation++; } },
    '@/lib/analytics': { logLogin() {}, logSignUp() {} },
    '@/lib/arrayUtils': { compactMap: () => [] }, '@/lib/authFeatures': { GUEST_LOGIN_ENABLED: false },
    '@/lib/cache': { clearUserCache() {} },
    '@/lib/downloads/downloadQueue': { suspendDownloadQueue: async () => {}, resumeDownloadQueue() {} },
    '@/lib/downloads/filesystem': {}, '@/lib/firebase': profile.firebase,
    '@/lib/logger': { logger: { warn: (...args) => warnings.push(args), error() {} } },
    '@/lib/rateLimiter': { checkRateLimit: async () => ({ allowed: true }), clearRateLimit: async () => {}, formatRetryAfter: String },
    '@/lib/storage': {}, '@/lib/validation': { safeValidate: (_schema, data) => ({ success: true, data }) },
    '@/services/auth/userProfile': profile, 'expo-file-system/legacy': {},
    'firebase/auth': {
      onAuthStateChanged: (_auth, next) => { authCallback = next; return () => {}; },
      signInWithEmailAndPassword: authenticate, createUserWithEmailAndPassword: authenticate,
      signInWithCredential: authenticate, signInWithPopup: authenticate,
      GoogleAuthProvider: Provider, OAuthProvider: Provider,
      getAdditionalUserInfo: () => ({ isNewUser: true }),
      updateProfile: () => options.authProfileGate ?? Promise.resolve(),
    },
  };
  const { AuthProvider } = load('src/contexts/AuthContext.tsx', imports, {
    setTimeout: () => 1, clearTimeout() {},
  });
  function render() {
    cursor = 0; const tree = AuthProvider({ children: 'App' });
    effects.splice(0).forEach(fn => fn()); return tree.props.value;
  }
  render();
  return { ...profile, warnings, render, init: () => authCallback(null), stop: () => slots.forEach(slot => slot?.cleanup?.()) };
}

for (const [method, args, extra] of [
  ['login', ['a@example.test', 'password'], {}],
  ['register', ['a@example.test', 'password', 'New Name'], { authProfileGate: new Promise(() => {}) }],
  ['signInWithGoogleCredential', ['id-token'], {}],
  ['signInWithGoogle', [], { web: true }],
  ['signInWithAppleCredential', [{ idToken: 'apple-token', rawNonce: 'nonce', fullName: 'Apple Name' }], {}],
  ['signInWithApple', [], { web: true }],
]) {
  test(`${method} completes authentication while Firestore is stalled`, async () => {
    const f = authFixture({ ...extra, transactionGate: new Promise(() => {}) });
    await f.init(); const before = f.render(); let settled = false;
    const result = before[method](...args).then(() => { settled = true; }); await flush();
    assert.equal(settled, true, 'Firestore must not hold the authentication promise'); await result;
    const ready = f.render(); assert.equal(ready.loading, false); assert.equal(ready.isAuthenticated, true);
    f.emit({ fullName: 'Firestore name' }); await flush();
    assert.equal(f.render().user.name, 'Firestore name');
    f.listeners.at(-1).error(Error('permission-denied'));
    assert.equal(f.render().isAuthenticated, true, 'profile errors must not turn a successful sign-in into a failed login');
    f.stop();
  });
}

test('failed Firebase credentials still reject login and never subscribe to private profiles', async () => {
  const f = authFixture({ authError: Error('invalid-credential') }); await f.init();
  await assert.rejects(f.render().login('a@example.test', 'wrong'), /invalid-credential/);
  assert.equal(f.render().isAuthenticated, false); assert.equal(f.listeners.length, 0); f.stop();
});
