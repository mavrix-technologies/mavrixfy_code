const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleOutput = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/youtube/YouTubeVideoFormats.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: moduleOutput, exports: moduleOutput.exports });
module.exports = moduleOutput.exports;
