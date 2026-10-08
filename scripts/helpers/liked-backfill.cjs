// Reuse the app's metadata/identity decoder; matching runs only in this admin helper.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../src/services/liked-songs/likedSongFormat.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleObject, exports: moduleObject.exports, URL });
const format = moduleObject.exports;

const text = (value) => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function rankLikedSongVersions(original, candidates) {
  const tokens = (value) => new Set(text(value).split(" ").filter(Boolean));
  const overlap = (a, b) => a.size && b.size ? [...a].filter(word => b.has(word)).length / Math.max(a.size, b.size) : 0;
  const version = (value) => (text(value).match(/\b(remix|cover|live|unplugged|instrumental|slowed|sped|acoustic|karaoke|reprise)\b/g) || []).sort().join("|");
  const originalTitle = text(original.title).replace(/\s+from\s+.*$/, "");
  return candidates.filter(song => !!format.youtubeIdentity(song)).map(song => {
    const title = text(song.title).replace(/\s+from\s+.*$/, "");
    const titleMatch = title === originalTitle ? 1 : overlap(tokens(title), tokens(originalTitle));
    const artistMatch = overlap(tokens(original.artist), tokens(song.artist));
    const durationKnown = original.duration > 30 && song.duration > 30;
    const delta = Math.abs(original.duration - song.duration);
    const durationMatch = durationKnown ? Math.max(0, 1 - delta / Math.max(15, original.duration * 0.1)) : 0;
    const versionMatch = version(original.title) === version(song.title);
    const score = Math.max(0, Math.round((titleMatch * 45 + artistMatch * 30 + durationMatch * 20
      + (text(original.album) && text(original.album) === text(song.album) ? 5 : 0)) * (durationKnown ? 1 : 1.25) - (versionMatch ? 0 : 45)));
    const durationCompatible = durationKnown ? delta <= Math.max(5, original.duration * 0.03)
      : original.duration === 0 && song.duration > 30 && artistMatch === 1;
    return { song, score, eligible: score >= 85 && titleMatch === 1 && artistMatch >= 0.8 && durationCompatible && versionMatch };
  }).sort((a, b) => b.score - a.score);
}

function hasMapping(data) {
  return data.playbackMapping?.version === 1 && !!format.youtubeIdentity(data.playbackMapping.song || {});
}
function classify(documentId, data) {
  if (hasMapping(data)) return 'mapped';
  if (data.playbackMapping != null) return 'unsupported-mapping';
  const song = format.readLikedSong(documentId, data);
  if (!format.needsLikedSongMigration(song)) return 'other-provider';
  if (!song.title.trim() || !song.artist.trim()) return 'incomplete';
  return 'eligible';
}
function buildUpdate(documentId, data, selected, score, timestamp) {
  if (classify(documentId, data) !== 'eligible') throw Error('Record is not eligible for backfill.');
  const original = format.readLikedSong(documentId, data);
  const match = rankLikedSongVersions(original, [selected])[0];
  if (!match?.eligible || match.score !== score) throw Error('Recording match is not confident.');
  const song = format.youtubeLikedMetadata(selected);
  const raw = { ...data };
  delete raw.playbackBackup; delete raw.playbackMapping; delete raw.playbackLinks;
  return {
    playbackBackup: data.playbackBackup || { version: 1, original: raw, createdAt: timestamp },
    playbackLinks: {
      jiosaavn: { id: documentId, catalogUrl: original.catalogUrl || '', audioUrl: original.audioUrl || '' },
      youtube: { id: song.youtubeVideoId, catalogUrl: song.catalogUrl },
    },
    playbackMapping: { version: 1, enabled: true, song, matchScore: score,
      confirmedBy: 'admin-backfill-v1', confirmedAt: timestamp },
  };
}
async function applyUpdate(db, initial, selected, score, timestamp) {
  return db.runTransaction(async transaction => {
    const latest = await transaction.get(initial.ref);
    if (!latest.exists) return 'deleted';
    const data = latest.data();
    if (hasMapping(data)) return 'mapped';
    if (!latest.updateTime.isEqual(initial.updateTime)) return 'changed';
    if (classify(latest.id, data) !== 'eligible') return 'changed';
    transaction.update(latest.ref, buildUpdate(latest.id, data, selected, score, timestamp()));
    return 'updated';
  });
}
async function restoreUpdate(db, reference, timestamp) {
  return db.runTransaction(async transaction => {
    const latest = await transaction.get(reference);
    if (!latest.exists) return 'deleted';
    const mapping = latest.data().playbackMapping;
    if (!hasMapping(latest.data()) || mapping.confirmedBy !== 'admin-backfill-v1' || mapping.enabled === false) return 'unchanged';
    transaction.update(reference, { 'playbackMapping.enabled': false, 'playbackMapping.restoredAt': timestamp() });
    return 'restored';
  });
}
module.exports = { ...format, rankLikedSongVersions, classify, hasMapping, buildUpdate, applyUpdate, restoreUpdate };
