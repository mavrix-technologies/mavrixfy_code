// Admin-only, resumable backfill. No user UI, no client-side migration traffic.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadYouTubeNodeTransport } from './helpers/youtube-node-transport.mjs';
const require = createRequire(import.meta.url);
const { classify, hasMapping, readLikedSong, rankLikedSongVersions, applyUpdate, restoreUpdate } = require('./helpers/liked-backfill.cjs');
const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const allowed = new Set(['--project', '--credentials', '--limit', '--probe', '--apply', '--restore', '--restart', '--help']);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw Error(`Unknown option: ${args[i]}`);
  if (['--project','--credentials','--limit','--probe'].includes(args[i])) {
    if (!args[i+1] || args[i+1].startsWith('--')) throw Error(`Missing value for ${args[i]}`);
    i++;
  }
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, '.firebaserc'), 'utf8'));
const project = value('--project') || config.projects.default;
if (!/^[a-z][a-z0-9-]{4,62}$/.test(project || '')) throw Error('Invalid project ID.');
const limit = Number(value('--limit') || 0);
if (!Number.isSafeInteger(limit) || limit < 0) throw Error('Invalid record limit.');
const apply = args.includes('--apply'), restore = args.includes('--restore');
let transport;
let sequence = 0;
async function search(original) {
  transport ??= await loadYouTubeNodeTransport();
  const requestId = `liked-backfill-${++sequence}`;
  const timer = setTimeout(() => transport.cancel(requestId), 26000);
  try {
    const result = await transport.search(`${original.title} ${original.artist}`, 'songs', requestId);
    return result.songs.slice(0, 12).map(track => ({ id: `youtube_${track.videoId}`, source: 'youtube',
      youtubeVideoId: track.videoId, videoId: track.videoId, title: track.title, artist: track.artist,
      duration: track.duration, coverUrl: track.coverUrl, album: '', genre: '', audioUrl: '' }));
  } finally { clearTimeout(timer); }
}
if (args.includes('--help')) {
  console.log('node scripts/backfill-liked-youtube.mjs [--project ID] [--credentials LOCAL_JSON] [--limit N] [--apply] [--restart] [--restore]\nDefault: dry-run. Resume checkpoint; --restart rescans unmapped records. --restore disables only admin-backfill mappings. --probe QUERY checks live catalog without Firestore.');
} else if (value('--probe')) {
  const results = await search({ title: value('--probe'), artist: '' });
  console.log(JSON.stringify({ songs: results.map(({ id, title, artist, duration }) => ({ id, title, artist, duration })) }));
} else {
  const adminRequire = createRequire(path.join(root, 'functions', 'package.json'));
  const admin = adminRequire('firebase-admin');
  let credential = admin.credential.applicationDefault();
  if (value('--credentials')) {
    const json = JSON.parse(await fs.readFile(path.resolve(value('--credentials')), 'utf8'));
    if (json.type !== 'service_account' || !json.private_key || !json.client_email) throw Error('Use a service-account credential, not google-services.json.');
    if (json.project_id !== project) throw Error('Credential project does not match target project.');
    credential = admin.credential.cert(json);
  }
  try { await credential.getAccessToken(); }
  catch { throw Error('Firebase Admin credentials unavailable. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, or pass --credentials LOCAL_JSON. No database records were modified.'); }
  admin.initializeApp({ credential, projectId: project });
  const db = admin.firestore();
  const mode = `${restore ? 'restore' : 'backfill'}-${apply ? 'apply' : 'dry-run'}`;
  const directory = path.join(root, '.expo', 'liked-backfill');
  await fs.mkdir(directory, { recursive: true });
  const checkpointPath = path.join(directory, `${project}-${mode}.json`);
  let checkpoint = { version: 1, project, mode, lastPath: '', totals: {}, complete: false };
  if (!args.includes('--restart')) {
    try { checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (checkpoint.project !== project || checkpoint.mode !== mode || checkpoint.version !== 1) throw Error('Checkpoint scope mismatch.');
  }
  // SIGINT stops between records. A committed transaction can always be safely retried.
  let stopped = false;
  process.on('SIGINT', () => { stopped = true; });
  const checkpointTemp = `${checkpointPath}.tmp`;
  async function save() {
    await fs.writeFile(checkpointTemp, JSON.stringify({ ...checkpoint, updatedAt: new Date().toISOString() }));
    await fs.rename(checkpointTemp, checkpointPath);
  }
  const count = status => { checkpoint.totals[status] = (checkpoint.totals[status] || 0) + 1; };
  const auditPath = path.join(directory, `${project}-${mode}-audit.jsonl`);
  const cache = new Map(); // Bounded across users; never stores audio stream URLs.
  let visited = 0;
  while (!stopped && (!limit || visited < limit)) {
    let query = db.collectionGroup('likedSongs').orderBy(admin.firestore.FieldPath.documentId()).limit(100);
    if (checkpoint.lastPath) query = query.startAfter(db.doc(checkpoint.lastPath));
    const page = await query.get();
    if (page.empty) { checkpoint.complete = true; await save(); break; }
    for (const snapshot of page.docs) {
      if (stopped || (limit && visited >= limit)) break;
      visited++;
      const data = snapshot.data();
      let status, selected, score;
      try {
        if (!/^users\/[^/]+\/likedSongs\/[^/]+$/.test(snapshot.ref.path)) status = 'unsupported-path';
        else if (restore) status = apply ? await restoreUpdate(db, snapshot.ref, admin.firestore.FieldValue.serverTimestamp) :
          hasMapping(data) && data.playbackMapping.confirmedBy === 'admin-backfill-v1' && data.playbackMapping.enabled !== false ? 'would-restore' : 'unchanged';
        else {
          status = classify(snapshot.id, data);
          if (status === 'eligible') {
            const original = readLikedSong(snapshot.id, data);
            const key = JSON.stringify([original.title, original.artist]);
            let candidates = cache.get(key);
            if (!candidates) {
              candidates = await search(original);
              if (cache.size >= 100) cache.delete(cache.keys().next().value);
              cache.set(key, candidates);
            }
            const best = rankLikedSongVersions(original, candidates)[0];
            selected = best?.song.id; score = best?.score;
            if (!best?.eligible) status = 'needs-review';
            else {
              status = apply ? await applyUpdate(db, snapshot, best.song, score, admin.firestore.FieldValue.serverTimestamp) : 'would-update';
            }
          }
        }
      } catch (error) {
        // Do not advance past a database/auth failure. Re-run to retry the same record.
        if ([7, 16, 'permission-denied', 'unauthenticated'].includes(error.code)) throw Error('Firestore access denied. Resume after fixing Admin access.');
        status = 'failed';
      }
      await fs.appendFile(auditPath, JSON.stringify({ path: snapshot.ref.path, status, selected, score, at: new Date().toISOString() }) + '\n');
      count(status); checkpoint.lastPath = snapshot.ref.path; checkpoint.complete = false;
      await save();
      if (visited % 20 === 0) console.log(JSON.stringify({ project, mode, totals: checkpoint.totals }));
    }
  }
  console.log(JSON.stringify({ project, mode, visited, complete: checkpoint.complete, stopped, totals: checkpoint.totals }));
}
