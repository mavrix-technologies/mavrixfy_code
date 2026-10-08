const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const compiled = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/services/audio/audioTimeline.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: compiled, exports: compiled.exports });
module.exports = compiled.exports;
