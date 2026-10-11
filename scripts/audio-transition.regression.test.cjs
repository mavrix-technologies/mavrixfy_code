const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture(native) {
 const listeners = new Map();const ref=current=>({current});let effects=0,pauses=0;
 const options={isPlayerReady:true,TrackPlayer:{pause:async()=>{pauses++;}},Event:{PlaybackPlayWhenReadyChanged:'ready'},
 subscribeTrackPlayerEvent:(event,listener)=>{listeners.set(event,listener);return native ? native.StandardAudioPlayer.addEventListener(event,listener).remove : ()=>{};},
 desiredPlayStateRef:ref(true),playbackLoadingRef:ref(true),pendingPlayRequestRef:ref({id:1,songId:'b'}),
 isPlayingRef:ref(true),setIsPlaying(){},setPlaybackLoading(){},currentSongRef:ref({id:'b'}),queueRef:ref([])};
 if(native){options.TrackPlayer=native.StandardAudioPlayer;options.Event=native.Event;options.State=native.State;}
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync('src/services/audio/audioSyncListeners.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
 if(name==='react')return {useRef:ref,useEffect:fn=>{if(effects++===0)fn();}};
 if(name==='react-native')return {Platform:{OS:'android'}};
 if(name.endsWith('PlaybackEngine'))return {updatePlaybackEngineSnapshot(){}};
 return {};
 }});
 module.exports.useAudioSyncListeners(options);
 return {options,ready:(value,reason)=>listeners.get('ready')({playWhenReady:value,reason}),pauses:()=>pauses};
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

test('system interruption stops output without clearing Play intent after loading completes',()=>{
 const f=fixture();f.options.playbackLoadingRef.current=false;f.options.pendingPlayRequestRef.current=null;
 f.ready(false,'interruption');
 assert.equal(f.options.desiredPlayStateRef.current,true);
 f.ready(true);assert.equal(f.options.desiredPlayStateRef.current,true);assert.equal(f.pauses(),0);
 f.ready(false,'pause');assert.equal(f.options.desiredPlayStateRef.current,false);
});

test('manual Pause remains authoritative during a system interruption',()=>{
 const f=fixture();f.options.playbackLoadingRef.current=false;f.options.pendingPlayRequestRef.current=null;
 f.options.desiredPlayStateRef.current=false;f.options.isPlayingRef.current=false;
 f.ready(false,'interruption');f.ready(true);
 assert.equal(f.options.desiredPlayStateRef.current,false);assert.equal(f.pauses(),1);
});

test('native interruption events and shared listeners preserve intent together',async()=>{
 const {fixture:audioFixture,tracks,tick}=require('./helpers/audio-player-fixture.cjs');
 const native=audioFixture();const player=native.StandardAudioPlayer;
 await player.setupPlayer();await player.setQueue(tracks);await player.play();
 native.StandardAudioRenderer().props.onPlaying();
 const f=fixture(native);f.options.playbackLoadingRef.current=false;f.options.pendingPlayRequestRef.current=null;
 native.system.get('interruption')({type:'began',shouldResume:false});
 assert.equal(f.options.desiredPlayStateRef.current,true);
 assert.equal(f.options.isPlayingRef.current,false);
 native.system.get('interruption')({type:'ended',shouldResume:true});await tick();
 assert.equal(f.options.desiredPlayStateRef.current,true);
 assert.equal(f.options.isPlayingRef.current,true);
 await player.pause();assert.equal(f.options.desiredPlayStateRef.current,false);
});
