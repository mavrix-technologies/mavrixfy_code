const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const dependencySlot = {useAnimatedStyle:1,useAnimatedProps:1,useDerivedValue:1,useAnimatedReaction:2,useAnimatedScrollHandler:1,useHandler:1};
function hookName(node) {
  if (ts.isParenthesizedExpression(node)) return hookName(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) return hookName(node.right);
  return ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : '';
}
function files(folder) {
  return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry => {
    const file=path.join(folder,entry.name);
    return entry.isDirectory()?files(file):[file];
  });
}
function argumentsIn(file) {
  const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const result=[];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const slot=dependencySlot[hookName(node.expression)];
      const argument=slot===undefined?undefined:node.arguments[slot];
      if (argument) result.push({argument,sf});
    }
    ts.forEachChild(node,visit);
  }
  visit(sf); return result;
}

test('dependency packages pass no native dependency arrays and retain their web dependencies',()=>{
  let checked=0;
  for (const pkg of ['@gorhom/bottom-sheet','react-native-draggable-flatlist']) {
    for (const folder of ['src','lib/module','lib/commonjs']) {
      for (const file of files(path.join('node_modules',pkg,folder))) {
        if (!['.ts','.tsx','.js'].some(ext=>file.endsWith(ext)) || file.includes('.web.') || file.includes('.webx.')) continue;
        for (const {argument,sf} of argumentsIn(file)) {
          const text=argument.getText(sf);
          for (const OS of ['ios','android']) {
            // No dependency expressions should even be read on native. This
            // also catches shared-value reads that would occur during render.
            assert.equal(vm.runInNewContext(text,{ReanimatedDependencyPlatform:{OS}}),undefined,file);
          }
          assert.ok(ts.isConditionalExpression(argument) && ts.isArrayLiteralExpression(argument.whenTrue),file);
          const scope={ReanimatedDependencyPlatform:{OS:'web'}};
          function bind(node) {
            if (ts.isIdentifier(node) && node.text!=='undefined') scope[node.text]??={value:node.text};
            ts.forEachChild(node,bind);
          }
          bind(argument.whenTrue);
          const expected=vm.runInNewContext(argument.whenTrue.getText(sf),scope);
          const actual=vm.runInNewContext(text,scope);
          assert.deepEqual(Array.from(actual),Array.from(expected),file);
          checked++;
        }
      }
    }
  }
  assert.ok(checked>100,'Cover the native source and both distributed JS entry points');
});

test('bottom-sheet callbacks still compile into UI-thread worklets after the dependency fix',()=>{
  const babel=require('@babel/core');
  const file='node_modules/@gorhom/bottom-sheet/src/components/bottomSheetBackdrop/BottomSheetBackdrop.tsx';
  const result=babel.transformSync(fs.readFileSync(file,'utf8'),{
    filename:file,babelrc:false,configFile:false,
    presets:[require.resolve('@babel/preset-typescript')],
    plugins:[require.resolve('@babel/plugin-transform-react-jsx'),require.resolve('react-native-worklets/plugin')],
  });
  assert.match(result.code,/__workletHash/);
});
