// Reuse the app's metadata/identity decoder; matching runs only in this admin helper.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(process.cwd(), 'src/services/liked-songs/likedSongFormat.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleObject, exports: moduleObject.exports, URL });
const format = moduleObject.exports;

const text = (value) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const canonicalTitle = value => text(value
  .replace(/\s*[([]\s*(?:feat\.?|ft\.?)\b[^)\]]*[)\]]/gi, " ")
  .replace(/\s+(?:feat\.?|ft\.?)\b.*$/i, " "));
function rankLikedSongVersions(original, candidates) {
  const tokens = (value) => new Set(text(value).split(" ").filter(Boolean));
  const overlap = (a, b) => a.size && b.size ? [...a].filter(word => b.has(word)).length / Math.max(a.size, b.size) : 0;
  // JioSaavn includes composers/lyricists; YT Music often lists only performers.
  // Compare complete artist names, never accept a shared first/surname alone.
  const names = value => value.split(/,|&|\band\b/i).map(text).filter(Boolean);
  const originalArtists = new Set(names(original.artist));
  const version = (value) => (text(value).match(/\b(remix|cover|live|unplugged|instrumental|slowed|sped|acoustic|karaoke|reprise)\b/g) || []).sort().join("|");
  const originalTitle = canonicalTitle(original.title).replace(/\s+from\s+.*$/, "");
  return candidates.filter(song => !!format.youtubeIdentity(song)).map(song => {
    const title = canonicalTitle(song.title).replace(/\s+from\s+.*$/, "");
    const titleMatch = title === originalTitle ? 1 : overlap(tokens(title), tokens(originalTitle));
    const candidateArtists = names(song.artist);
    const artistMatch = candidateArtists.length && candidateArtists.every(name => originalArtists.has(name))
      ? 1 : overlap(tokens(original.artist), tokens(song.artist));
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
  // Any mapping version belongs to a newer or manually controlled rollout;
  // never let the automated backfill overwrite it just because we cannot read it.
  if (data.playbackMapping != null) return true;
  return !!format.youtubeIdentity({ youtubeUrl: data.youtubeUrl, source: data.source, videoId: data.videoId, youtubeVideoId: data.youtubeVideoId, id: data.id });
}
function classify(documentId, data) {
  if (hasMapping(data)) return 'mapped';
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
  return { youtubeUrl: `https://music.youtube.com/watch?v=${format.youtubeIdentity(selected)}` };
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
async function restoreUpdate(db, reference, deleteField) {
  return db.runTransaction(async transaction => {
    const latest = await transaction.get(reference);
    if (!latest.exists) return 'deleted';
    if (!hasMapping(latest.data())) return 'unchanged';
    transaction.update(reference, { youtubeUrl: deleteField() });
    return 'restored';
  });
}
module.exports = { ...format, rankLikedSongVersions, classify, hasMapping, buildUpdate, applyUpdate, restoreUpdate };
