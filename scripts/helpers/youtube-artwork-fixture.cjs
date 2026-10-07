const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const moduleState = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/services/youtube/YouTubeArtwork.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleState, exports: moduleState.exports });
module.exports = moduleState.exports;
