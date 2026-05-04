#!/usr/bin/env node
/**
 * Fixes expo-notifications DateComponentsSerializer.swift for Xcode 16.4 / iOS SDK 18.5
 * The `isRepeatedDay` property only exists in iOS 26+, so it needs an availability check.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-notifications',
  'ios',
  'ExpoNotifications',
  'Notifications',
  'DateComponentsSerializer.swift'
);

if (!fs.existsSync(filePath)) {
  console.log('[fix-expo-notifications] File not found, skipping.');
  process.exit(0);
}

const content = fs.readFileSync(filePath, 'utf8');

// Already fixed
if (content.includes('#available(iOS 26.0, *)')) {
  console.log('[fix-expo-notifications] Already patched, skipping.');
  process.exit(0);
}

// Not the version we expect
if (!content.includes('isRepeatedDay ?? false')) {
  console.log('[fix-expo-notifications] isRepeatedDay not found, skipping.');
  process.exit(0);
}

const fixed = content.replace(
  '    serializedComponents["isRepeatedDay"] = dateComponents.isRepeatedDay ?? false',
  '    if #available(iOS 26.0, *) {\n      serializedComponents["isRepeatedDay"] = dateComponents.isRepeatedDay ?? false\n    }'
);

fs.writeFileSync(filePath, fixed, 'utf8');
console.log('[fix-expo-notifications] Successfully patched DateComponentsSerializer.swift');
