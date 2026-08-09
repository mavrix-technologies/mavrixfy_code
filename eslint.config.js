const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  // ─── Architectural Boundary Rules ────────────────────────────────────────────
  // Rule 1: src/features/** must NOT import directly from legacy root app/ or legacy provider/audio aliases
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/**", "../app/**", "../../app/**"],
              message:
                "Features must not import from legacy root app/. Route adapters in app/ import from src/features/, not the other way around.",
            },
            {
              group: [
                "**/lib/jioSaavnService",
                "**/lib/youtubeMusicService",
                "**/lib/artistService",
                "**/lib/recommendationService",
                "**/lib/newReleaseSongService",
                "**/lib/trackPlayer",
                "**/lib/expoAvPlayer",
                "**/lib/playbackEngine",
                "**/lib/playbackAudioLevels",
              ],
              message:
                "Features must import directly from canonical src/data/providers/ or src/services/audio/ rather than legacy root lib/ aliases.",
            },
          ],
        },
      ],
    },
  },
  // Rule 2: src/data/providers/** must NOT import from src/features/**
  {
    files: ["src/data/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src/features/**", "../features/**", "../../features/**"],
              message:
                "Data providers must not import from feature layer. Data flows up: data → features, not down.",
            },
          ],
        },
      ],
    },
  },
  // Rule 3: src/services/audio/** must NOT import from src/features/**
  {
    files: ["src/services/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src/features/**", "../features/**", "../../features/**"],
              message:
                "Service layer must not import from feature layer. Services flow up: services → features, not down.",
            },
          ],
        },
      ],
    },
  },
]);
