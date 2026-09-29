const fs = require('node:fs');
const { test, before, after, beforeEach } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-mavrixfy', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
test('owners cannot set authorization fields or remove a banned profile', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { fullName: 'Alice' }));
  await assertFails(updateDoc(doc(db, 'users/alice'), { subscriptionStatus: 'active' }));
  await assertFails(updateDoc(doc(db, 'users/alice'), { role: 'admin' }));
  await assertFails(deleteDoc(doc(db, 'users/alice')));
  await assertSucceeds(updateDoc(doc(db, 'users/alice'), { fullName: 'Alice Updated' }));
  await assertFails(setDoc(doc(db, 'users/bob'), { fullName: 'Bob' }));
});
test('licenses and device limits cannot be changed by their owner', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(db, 'users/alice/offlineLicenses/song'), { status: 'active' }));
  await assertFails(setDoc(doc(db, 'users/alice/downloadDevices/device'), { active: false }));
  await env.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), 'users/alice/offlineLicenses/song'), { status: 'revoked' }); });
  await assertFails(deleteDoc(doc(db, 'users/alice/offlineLicenses/song')));
  await assertFails(updateDoc(doc(db, 'users/alice/offlineLicenses/song'), { status: 'active' }));
});
