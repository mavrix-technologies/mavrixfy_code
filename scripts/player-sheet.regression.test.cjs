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
 const slots=[];let index=0;let dirty=false;const ui={current:'mini',revision:0};
 const react={
  useState:initial=>{const i=index++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=value;dirty=true;}];},
  useRef:value=>{const i=index++;if(!(i in slots))slots[i]={current:value};return slots[i];},
  useCallback:(fn,deps)=>{const i=index++;if(!slots[i]||deps.some((d,j)=>d!==slots[i].deps[j]))slots[i]={deps,fn};return slots[i].fn;},
  useLayoutEffect:(fn,deps)=>{const i=index++;if(!slots[i]||deps.some((d,j)=>d!==slots[i].deps[j])){slots[i]={deps};fn();}},
 };
 const {usePlayerSheetState}=load('src/features/player/hooks/usePlayerSheetState.ts',{
  react,'@/lib/playerUIState':{playerUIStateStore:ui,collapsePlayer:()=>setState('mini')},
 });
 function setState(state){if(ui.current!==state){ui.current=state;ui.revision++;}}
 function render(state=ui.current,landscape=false,foreground=true){setState(state);let result;do{dirty=false;index=0;result=usePlayerSheetState(state,landscape,foreground);}while(dirty);return result;}
 return{render,ui};
}

test('dismissal during an unfinished opening bypasses the native mount animation guard',()=>{
 const f=sheetFixture();const opening=f.render('expanded');
 assert.equal(opening.animateOnMount,true);
 const closing=f.render('mini');
 assert.equal(closing.animateOnMount,false);
 closing.onAnimate(0,-1);closing.onClose();
 assert.equal(f.render().visible,false);
});
test('native sheet retains content through closing and loads details after opening completes',()=>{
 const f=sheetFixture();assert.equal(f.render().visible,false);
 let s=f.render('expanded');assert.equal(s.visible,true);assert.equal(s.interactionReady,false);
 s.onAnimate(-1,0);s.onChange(0);assert.equal(f.render().interactionReady,true);
 s=f.render('mini');assert.equal(s.visible,true);s.onAnimate(0,-1);s.onClose();
 assert.equal(f.render().visible,false);assert.equal(f.render().interactionReady,false);
});
test('native sheet reopening ignores an obsolete closing destination',()=>{
 const f=sheetFixture();let s=f.render('expanded');s.onAnimate(0,-1);
 f.render('mini');f.render('expanded');s.onClose();
 assert.equal(f.ui.current,'expanded');assert.equal(f.render().visible,true);
});
test('content pan completion collapses the same global player; next open starts fresh',()=>{
 const f=sheetFixture();const s=f.render('expanded');s.onChange(0);
 s.onAnimate(0,-1);s.onClose();assert.equal(f.ui.current,'mini');assert.equal(f.render().visible,false);
 const next=f.render('expanded');assert.equal(next.visible,true);assert.equal(next.interactionReady,false);
});

test('rapid close and reopen invalidates an old native close completion',()=>{
 const f=sheetFixture();const oldClose=f.render('expanded');
 oldClose.onAnimate(0,-1);
 f.render('mini');
 const reopened=f.render('expanded');
 oldClose.onClose();
 assert.equal(f.ui.current,'expanded');
 assert.equal(f.render().visible,true);
 assert.equal(reopened.interactionReady,false);
});

test('rotation-generated sheet closes cannot collapse an expanded landscape player',()=>{
 const f=sheetFixture();const s=f.render('expanded',true);s.onChange(0);
 s.onAnimate(0,-1);s.onClose();
 assert.equal(f.ui.current,'expanded');assert.equal(f.render('expanded',true).visible,true);
 assert.equal(f.render('expanded',false).visible,true);
});

test('explicit collapse in landscape releases retained content before portrait returns',()=>{
 const f=sheetFixture();f.render('expanded',true).onChange(0);
 const s=f.render('mini',true);assert.equal(s.visible,true);
 s.onAnimate(0,-1);s.onClose();
 assert.equal(f.render('mini',true).visible,false);assert.equal(f.render().interactionReady,false);
});

test('landscape close completion remains obsolete after rapid reopen in portrait',()=>{
 const f=sheetFixture();f.render('expanded',true);
 const oldClose=f.render('mini',true);oldClose.onAnimate(0,-1);
 f.render('expanded',false);oldClose.onClose();
 assert.equal(f.ui.current,'expanded');assert.equal(f.render().visible,true);
});

test('reopening a previously ready sheet waits for its own opening completion',()=>{
 const f=sheetFixture();const oldOpen=f.render('expanded');oldOpen.onChange(0);
 assert.equal(f.render().interactionReady,true);
 f.render('mini');const reopened=f.render('expanded');
 assert.equal(reopened.interactionReady,false);
 oldOpen.onChange(0);assert.equal(f.render().interactionReady,false);
 reopened.onChange(0);assert.equal(f.render().interactionReady,true);
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

test('late portrait sheet callbacks cannot collapse the restored player after a StandBy round trip',()=>{
 const f=sheetFixture();const old=f.render('expanded');old.onChange(0);
 old.onAnimate(0,-1);
 f.render('expanded',true);
 const restored=f.render('expanded',false);
 old.onAnimate(0,-1);old.onClose();old.onChange(0);
 assert.equal(f.ui.current,'expanded');
 assert.equal(restored.animateOnMount,true,'a remounted sheet completes its native opening before enabling content');
 restored.onChange(0);
 restored.onAnimate(0,-1);restored.onClose();
 assert.equal(f.ui.current,'mini','a fresh user dismissal still works');
});

test('background restoration rejects old callbacks even when the player store revision does not change',()=>{
 const f=sheetFixture();const old=f.render('expanded');
 old.onAnimate(0,-1);
 f.render('expanded',false,false);
 const restored=f.render('expanded',false,true);
 old.onClose();old.onAnimate(0,-1);old.onClose();
 assert.equal(f.ui.current,'expanded');
 assert.equal(restored.animateOnMount,true);
 assert.equal(restored.interactionReady,false);
 restored.onChange(0);assert.equal(f.render().interactionReady,true);
});

test('rapid StandBy exit completes a fresh native sheet mount and rejects outgoing callbacks',()=>{
 const f=sheetFixture();assert.equal(f.render('expanded').animateOnMount,true);
 for(let i=0;i<20;i++){
  const outgoing=f.render('expanded');
  f.render('expanded',true);
  const restored=f.render('expanded');
  outgoing.onAnimate(0,-1);outgoing.onClose();
  assert.equal(f.ui.current,'expanded');
  assert.equal(restored.animateOnMount,true);
 }
 f.render('mini').onAnimate(0,-1);f.render('mini').onClose();
 assert.equal(f.render('expanded').animateOnMount,true,'a new user opening retains its normal slide');
});
