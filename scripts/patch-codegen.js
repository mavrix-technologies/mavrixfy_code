const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../node_modules/react-native/scripts/codegen/generate-artifacts-executor/index.js');

if (!fs.existsSync(file)) {
  console.log(`⚠️ Codegen file not found at ${file}. Skipping patch.`);
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

if (content.includes('function expand')) {
  console.log('✅ Codegen index.js already patched.');
  process.exit(0);
}

const target = "'use strict';";
if (!content.includes(target)) {
  console.error('❌ Error: Could not find "use strict" line in codegen index.js');
  process.exit(1);
}

const patch = `function expand(p) { return typeof p === 'string' ? [p] : Array.isArray(p) ? p : []; }`;

content = content.replace(target, `${target}\n\n${patch}\n`);
fs.writeFileSync(file, content, 'utf8');
console.log('✅ Successfully patched codegen index.js with expand function!');
