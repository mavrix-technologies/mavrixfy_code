// One-time Admin migration: reduce migrated liked songs to the legacy audioUrl
// plus one permanent YouTube watch URL, youtubeUrl. Dry-run unless --apply.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const allowed = new Set(['--project', '--credentials', '--apply', '--help']);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw Error(`Unknown option: ${args[i]}`);
  if (['--project', '--credentials'].includes(args[i])) {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Missing value for ${args[i]}`);
    i++;
  }
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, '.firebaserc'), 'utf8'));
const project = value('--project') || config.projects.default;
if (!/^[a-z][a-z0-9-]{4,62}$/.test(project || '')) throw Error('Invalid project ID.');
if (args.includes('--help')) {
  console.log('node scripts/simplify-liked-song-fields.mjs [--project ID] [--credentials LOCAL_JSON] [--apply]\nDry-run by default. Backs up the current likedSongs collection-group snapshot locally before applying.');
} else {
  const adminRequire = createRequire(path.join(root, 'functions', 'package.json'));
  const admin = adminRequire('firebase-admin');
  let credential = admin.credential.applicationDefault();
  if (value('--credentials')) {
    const json = JSON.parse(await fs.readFile(path.resolve(value('--credentials')), 'utf8'));
    if (json.type !== 'service_account' || !json.private_key || !json.client_email || json.project_id !== project) {
      throw Error('Use a service-account JSON for the target Firebase project.');
    }
    credential = admin.credential.cert(json);
  }
  try { await credential.getAccessToken(); }
  catch { throw Error('Firebase Admin credentials unavailable. No database records were modified.'); }
  admin.initializeApp({ credential, projectId: project });
  const db = admin.firestore();
  const snapshots = [];
  let cursorPath;
  while (true) {
    let query = db.collectionGroup('likedSongs').orderBy(admin.firestore.FieldPath.documentId()).limit(250);
    if (cursorPath) query = query.startAfter(db.doc(cursorPath));
    const page = await query.get();
    if (page.empty) break;
    snapshots.push(...page.docs);
    cursorPath = page.docs.at(-1).ref.path;
  }

  const validId = value => typeof value === 'string' && /^[\w-]{11}$/.test(value);
  const idFrom = raw => {
    if (validId(raw)) return raw;
    if (typeof raw !== 'string') return null;
    try {
      const url = new URL(raw);
      if (url.hostname === 'youtu.be') return validId(url.pathname.slice(1).split('/')[0]) ? url.pathname.slice(1).split('/')[0] : null;
      if (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) {
        const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).at(-1);
        return validId(id) ? id : null;
      }
    } catch { /* malformed old value */ }
    return null;
  };
  const changes = snapshots.map(snapshot => {
    const data = snapshot.data();
    const mappingSong = data.playbackMapping?.song || {};
    const linkedUrl = data.playbackLinks?.youtube?.catalogUrl;
    const id = idFrom(data.youtubeUrl) || idFrom(mappingSong.youtubeVideoId) || idFrom(mappingSong.videoId)
      || idFrom(mappingSong.id) || idFrom(mappingSong.catalogUrl) || idFrom(linkedUrl);
    const removeFields = ['playbackBackup', 'playbackLinks', 'playbackMapping'].some(key => key in data);
    return { snapshot, data, id, removeFields };
  }).filter(item => item.id || item.removeFields);
  const backupDir = path.join(root, '.expo', 'liked-backfill');
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${project}-pre-simplify-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(backupPath, JSON.stringify(snapshots.map(snapshot => ({ path: snapshot.ref.path, data: snapshot.data() })), null, 2));
  const mapped = changes.filter(item => item.id).length;
  const staleFields = changes.filter(item => item.removeFields).length;
  console.log(JSON.stringify({ project, mode: args.includes('--apply') ? 'apply' : 'dry-run', scanned: snapshots.length,
    youtubeUrlsToKeepOrAdd: mapped, legacyJioSaavnAudioUrlsPreserved: mapped,
    redundantPlaybackFieldsToRemove: staleFields, backupPath }));
  if (args.includes('--apply')) {
    for (let offset = 0; offset < changes.length; offset += 400) {
      const batch = db.batch();
      for (const { snapshot, id, removeFields } of changes.slice(offset, offset + 400)) {
        const update = {};
        if (id) update.youtubeUrl = `https://music.youtube.com/watch?v=${id}`;
        if (removeFields) {
          for (const field of ['playbackBackup', 'playbackLinks', 'playbackMapping']) update[field] = admin.firestore.FieldValue.delete();
        }
        batch.update(snapshot.ref, update);
      }
      await batch.commit();
    }
    const verify = await db.collectionGroup('likedSongs').get();
    const invalid = verify.docs.filter(snapshot => {
      const data = snapshot.data();
      return 'playbackBackup' in data || 'playbackLinks' in data || 'playbackMapping' in data
        || (data.youtubeUrl && !/^https:\/\/music\.youtube\.com\/watch\?v=[\w-]{11}$/.test(data.youtubeUrl));
    });
    if (invalid.length) throw Error(`Post-migration verification failed for ${invalid.length} documents.`);
    const beforeByPath = new Map(snapshots.map(snapshot => [snapshot.ref.path, snapshot.data()]));
    const changedLegacyAudio = verify.docs.filter(snapshot => beforeByPath.get(snapshot.ref.path)?.audioUrl !== snapshot.get('audioUrl'));
    if (changedLegacyAudio.length) throw Error(`JioSaavn audioUrl changed in ${changedLegacyAudio.length} documents.`);
    console.log(JSON.stringify({ verifiedDocuments: verify.size, redundantFieldDocuments: invalid.length,
      youtubeUrlDocuments: verify.docs.filter(snapshot => !!snapshot.get('youtubeUrl')).length,
      legacyAudioUrlChanges: changedLegacyAudio.length }));
  }
}
