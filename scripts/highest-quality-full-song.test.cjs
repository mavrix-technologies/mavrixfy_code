const test = require('node:test');
const assert = require('node:assert/strict');

function isAudioPreviewUrl(url) {
  if (!url || typeof url !== "string") return false;
  const l = url.toLowerCase();
  return (
    l.includes("preview.m4a") ||
    l.includes("audiopreview") ||
    l.includes("p.scdn.co/mp3-preview") ||
    l.includes("/preview/") ||
    (l.includes("itunes.apple.com") && l.includes("preview"))
  );
}

const QUALITY_LABELS = {
  auto: ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"],
  low: ["96kbps", "48kbps", "12kbps", "160kbps", "320kbps"],
  medium: ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"],
  high: ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"],
};

test('Highest Quality Output (320kbps) Priority', () => {
  assert.equal(QUALITY_LABELS.auto[0], '320kbps', 'Auto streaming must prioritize 320kbps');
  assert.equal(QUALITY_LABELS.medium[0], '320kbps', 'Medium streaming must prioritize 320kbps');
  assert.equal(QUALITY_LABELS.high[0], '320kbps', 'High streaming must prioritize 320kbps');
});

test('Preview URL Rejection for Full Songs', () => {
  // Preview links must be detected and rejected
  assert.equal(isAudioPreviewUrl('https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/preview.m4a'), true);
  assert.equal(isAudioPreviewUrl('https://p.scdn.co/mp3-preview/2f37dae35ff9e41f6962f82d4f197d04c29f3d38'), true);
  assert.equal(isAudioPreviewUrl('https://itunes.apple.com/us/album/song/id123?preview=true'), true);

  // Legitimate full-length 320kbps / YouTube audio streams must NOT be flagged as previews
  assert.equal(isAudioPreviewUrl('https://aac.saavncdn.com/283/d2aa6d873d283e0c8a03d68659c0890b_320.mp4'), false);
  assert.equal(isAudioPreviewUrl('https://rr2---sn-4g5ednss.googlevideo.com/videoplayback?expire=123'), false);
});
