const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,require:name=>{if(!(name in dependencies))throw Error(name);return dependencies[name];}});
 return module.exports;
}
function sheetFixture() {
 const slots=[];let index=0;let dirty=false;const ui={current:'mini'};
 const react={
  useState:initial=>{const i=index++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=value;dirty=true;}];},
  useRef:value=>{const i=index++;if(!(i in slots))slots[i]={current:value};return slots[i];},
  useCallback:(fn,deps)=>{const i=index++;if(!slots[i]||deps.some((d,j)=>d!==slots[i].deps[j]))slots[i]={deps,fn};return slots[i].fn;},
  useLayoutEffect:fn=>fn(),
 };
 const {usePlayerSheetState}=load('src/features/player/hooks/usePlayerSheetState.ts',{
  react,'@/lib/playerUIState':{playerUIStateStore:ui,collapsePlayer:()=>{ui.current='mini';}},
 });
 function render(state=ui.current){ui.current=state;let result;do{dirty=false;index=0;result=usePlayerSheetState(state);}while(dirty);return result;}
 return{render,ui};
}
test('native sheet retains content through closing and loads details after opening completes',()=>{
 const f=sheetFixture();assert.equal(f.render().visible,false);
 let s=f.render('expanded');assert.equal(s.visible,true);assert.equal(s.interactionReady,false);
 s.onAnimate(-1,0);s.onChange(0);assert.equal(f.render().interactionReady,true);
 s=f.render('mini');assert.equal(s.visible,true);s.onAnimate(0,-1);s.onClose();
 assert.equal(f.render().visible,false);assert.equal(f.render().interactionReady,false);
});
test('native sheet reopening ignores an obsolete closing destination',()=>{
 const f=sheetFixture();let s=f.render('expanded');s.onAnimate(0,-1);
 f.render('mini');s=f.render('expanded');s.onAnimate(-1,0);s.onClose();
 assert.equal(f.ui.current,'expanded');assert.equal(f.render().visible,true);
});
test('content pan completion collapses the same global player; next open starts fresh',()=>{
 const f=sheetFixture();const s=f.render('expanded');s.onChange(0);
 s.onAnimate(0,-1);s.onClose();assert.equal(f.ui.current,'mini');assert.equal(f.render().visible,false);
 const next=f.render('expanded');assert.equal(next.visible,true);assert.equal(next.interactionReady,false);
});

test('player deep-link bridge opens the existing sheet and returns to its underlying screen',()=>{
 for(const canGoBack of [true,false]){
  const actions=[];const route=load('app/player.tsx',{
   react:{useEffect:fn=>fn()},'expo-router':{useRouter:()=>({canGoBack:()=>canGoBack,back:()=>actions.push('back'),replace:href=>actions.push(href)})},
   '@/lib/playerUIState':{expandPlayer:()=>actions.push('expand')},
  });
  assert.equal(route.default(),null);
  assert.deepEqual(actions,[canGoBack?'back':'/(tabs)','expand']);
 }
});
