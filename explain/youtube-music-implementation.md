# YouTube Music implementation

## Shared Android and iOS transport

The app loads `src/services/youtube/SharedYouTubeTransport.ts` through `YouTubeMusic.ts`. Catalog requests and audio/video stream resolution use YouTube.js with Jinter for player transforms. The playback engine consumes the resolved source and its HTTP headers.

- Search and playlist parsing retain provider-qualified IDs and the selected video's identity.
- Audio resolution validates the video ID, format, media response and stream expiry before returning a source.
- Extraction errors distinguish verification, unavailable content, network failures and media access failures. Verification failures stop automatic retries and expose the existing user-facing recovery action.
- Recovery of transient resolution/media failures is bounded. Client/session rotation is not an unbounded retry strategy.

## Proof-token host

`YouTubePoTokenHost.tsx` owns the hidden WebView used by `YouTubePoToken.ts`. Engine generations reject stale callbacks; minting has a total deadline, shared recovery and a cooldown after repeated failures. The HTTP bridge in `YouTubePoTokenHttp.ts` permits only the endpoints needed by the attestation flow.

The browser entry `scripts/youtube-po-token-browser.mjs` and its `helpers/youtube-page-attestation.mjs` dependency are maintained build inputs. Regenerate the embedded HTML after changing them:

~~~powershell
npm run youtube:build-token
~~~

The generated `YouTubePoTokenHtml.ts` includes the BgUtils license. Tokens and session context are ephemeral runtime data.

## Maintenance checks

~~~powershell
npm run typecheck
npm test
npm run lint
~~~

The regression suite exercises the current transport, proof-token lifecycle, provider identity, stream expiry, cancellation and playback recovery. It does not establish physical-device playback or guarantee that YouTube will accept every request.

`scripts/helpers/youtube-node-transport.mjs` remains required by the liked-song maintenance command `npm run liked:backfill`. Its generated Node adapter files are recreated when the command runs.

Reference clones, historical source-review documents and the standalone live probe are excluded from the maintained runtime workflow. The separate Expo Go prototype is not an application dependency.
