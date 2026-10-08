const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture() {
 const listeners = new Map();const ref=current=>({current});let effects=0,pauses=0;
 const options={isPlayerReady:true,TrackPlayer:{pause:async()=>{pauses++;}},Event:{PlaybackPlayWhenReadyChanged:'ready'},
 subscribeTrackPlayerEvent:(event,listener)=>{listeners.set(event,listener);return ()=>{};},
 desiredPlayStateRef:ref(true),playbackLoadingRef:ref(true),pendingPlayRequestRef:ref({id:1,songId:'b'}),
 isPlayingRef:ref(true),setIsPlaying(){},setPlaybackLoading(){},currentSongRef:ref({id:'b'}),queueRef:ref([])};
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync('src/services/audio/audioSyncListeners.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
 if(name==='react')return {useRef:ref,useEffect:fn=>{if(effects++===0)fn();}};
 if(name==='react-native')return {Platform:{OS:'android'}};
 if(name.endsWith('PlaybackEngine'))return {updatePlaybackEngineSnapshot(){}};
 return {};
 }});
 module.exports.useAudioSyncListeners(options);
 return {options,ready:value=>listeners.get('ready')({playWhenReady:value}),pauses:()=>pauses};
}
test('native queue load cannot replace requested Play with a transient Pause',()=>{
 const f=fixture();f.ready(false);assert.equal(f.options.desiredPlayStateRef.current,true);
 assert.equal(f.options.isPlayingRef.current,true);
 f.options.playbackLoadingRef.current=false;f.ready(false);assert.equal(f.options.desiredPlayStateRef.current,true);
 f.options.pendingPlayRequestRef.current=null;f.ready(false);assert.equal(f.options.desiredPlayStateRef.current,false);
});
test('explicit user Pause wins over a late native resume during next-track loading',()=>{
 const f=fixture();f.options.desiredPlayStateRef.current=false;f.options.isPlayingRef.current=false;
 f.ready(true);assert.equal(f.options.desiredPlayStateRef.current,false);assert.equal(f.pauses(),1);
});
