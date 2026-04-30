# Firestore Data Model

This project uses the same Firestore schema as Mavrixfy-web. Keep new writes in this shape so mobile and web can share indexes, rules, and fast queries.

## Collections

- `users/{uid}`: private profile document.
  - Required fields: `uid`, `email`, `emailLower`, `displayName`, `fullName`, `imageUrl`, `provider`, `schemaVersion`, `createdAt`, `updatedAt`.
- `users/{uid}/likedSongs/{songId}`: normalized liked songs.
  - Required fields: `id`, `title`, `normalizedTitle`, `artist`, `normalizedArtist`, `dedupeKey`, `imageUrl`, `audioUrl`, `duration`, `source`, `likedAt`, `createdAt`, `updatedAt`.
  - Do not write new data to root `likedSongs/{uid}`. That root collection is legacy only.
- `users/{uid}/pushTokens/{tokenId}`: Expo/Firebase push token documents owned by the user.
- `users/{uid}/spotifyTokens`, `users/{uid}/spotifySync`, `users/{uid}/spotifyLikedSongs`: Spotify integration state.
- `playlists/{playlistId}`: user, public, and mood-generated playlists.
  - Required fields: `name`, `searchableName`, `songs`, `songCount`, `createdBy.id`, `createdBy._id`, `createdBy.uid`, `isPublic`, `source`, `schemaVersion`, `createdAt`, `updatedAt`.
- `playlist_shares/{shareId}`: public share records for playlists.
- `songs`, `albums`, `trendingSongs`: public catalog reads, admin writes.
- `mood_playlist_cache`, `mood_playlist_rate_limits`, `mood_playlist_analytics`, `mood_playlist_metrics`, `mood_playlist_alerts`: backend/admin mood playlist collections.

## Planned Extensions

- Offline downloads are not implemented in the current schema. The proposed entitlement, device, offline license, and admin catalog fields are documented in [offline-downloads-prd.md](./offline-downloads-prd.md).

## Deploy

Deploy rules and indexes from either repo:

```bash
npm run firestore:deploy:rules
npm run firestore:deploy:indexes
```

Run the data migration from `Mavrixfy-web`, where the Firebase Admin SDK is configured:

```bash
npm run firestore:migrate
npm run firestore:migrate -- --write
npm run firestore:migrate -- --write --delete-legacy
```

Run without `--write` first. Use `--delete-legacy` only after confirming migrated `users/{uid}/likedSongs` documents are correct.
