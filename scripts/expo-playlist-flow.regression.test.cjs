const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {fixture:expoFixture}=require('./helpers/expo-player-fixture.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function flow(provider='youtube') {
 const adapter=expoFixture();const ref=current=>({current});const noop=()=>{};const errors=[];
 const songs=['a','b','c'].map(id=>({id:provider+'_'+id,source:provider,title:id,artist:'Artist',duration:180,playbackDurationSeconds:180,audioUrl:'https://media.example/'+id}));
 const options={currentSong:null,currentSongRef:ref(null),queueRef:ref([]),originalQueueRef:ref([]),queueIndexRef:ref(0),
 userQueuedSongIdsRef:ref([]),isShuffledRef:ref(false),repeatModeRef:ref('off'),isPlayingRef:ref(false),
 playbackLoadingRef:ref(false),desiredPlayStateRef:ref(null),pendingPlayRequestRef:ref(null),playRequestIdRef:ref(0),
 seekToRef:ref(noop),playSongRef:ref(noop),nextSongRef:ref(noop),prevSongRef:ref(noop),togglePlayRef:ref(noop),sleepTimerRef:ref(null),
 canUseLightweightAudioFallback:true,TrackPlayer:null,streamUrlCache:ref(new Map()),isNativeQueueSyncedRef:ref(false),
 setCurrentSong:noop,setQueue:noop,setSourceQueue:noop,setQueueIndex:noop,setUserQueuedSongIds:noop,setIsPlaying:noop,
 setPlaybackLoading:noop,showPlaybackNotice:msg=>errors.push(msg),prefetchAdjacentTrackStreams:noop,
 resolvePlaybackUrlCached:async song=>song.audioUrl};
 const imports={react:{useCallback:fn=>fn,useRef:ref,useEffect:fn=>fn()},
 '@/services/audio/ExpoAvAdapter':adapter,'@/lib/storage':{getSettings:async()=>({smartAutoplayEnabled:false})},
 '@/services/audio/PlaybackEngine':{updatePlaybackEngineSnapshot:noop},
 '@/services/audio/PlayerPlaybackResolver':{withResolvedPlaybackUrl:(song,audioUrl)=>({...song,audioUrl}),resolveAudioUrl:s=>s.audioUrl},
 '@/services/audio/audioNativeQueueLane':{isSameQueueContent:(a,b)=>a.length===b.length&&a.every((s,i)=>s.id===b[i].id)},
 '@/services/player/playerPersistenceService':{playerPersistenceService:{addRecentlyPlayed:async()=>{},savePlayerState:async()=>{}}},
 '@/services/audio/playbackProgressStore':{updatePlaybackProgress:noop,resetPlaybackProgress:noop},
 '@/services/youtube/YouTubeMusic':{isYouTubeSong:s=>s?.source==='youtube',rejectYouTubeStream:noop,youTubePlaybackErrorMessage:String,youTubePlaybackErrorDetails:String},
 '@/lib/logger':{logger:{error:(...args)=>errors.push(args),warn:noop,debug:noop}},
 '@/utils/timeFormatters':{toDurationSeconds:Number},'./audioTimeline':require('./helpers/audio-timeline-fixture.cjs')};
 function load(path){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,setTimeout:(fn,ms)=>ms===800?0:setTimeout(fn,ms),clearTimeout,require:n=>{if(n in imports)return imports[n];throw new Error(n);}});return module.exports;}
 Object.assign(options,load('src/services/audio/audioProgressTracking.ts').useAudioProgressTracking(options));
 const commands=load('src/services/audio/audioPlaybackCommands.ts').useAudioPlaybackCommands(options);
 return {adapter,options,commands,songs,errors};
}
for(const provider of ['youtube','jiosaavn']) {
 test(`Expo ${provider}: real adapter completion goes through shared next command and starts the following playlist song`,async()=>{
  const f=flow(provider);await f.commands.playSong(f.songs[0],f.songs);
  assert.equal(f.options.queueIndexRef.current,0);
  const first=f.adapter.players[0];first.emit({playing:true,currentTime:179.6,duration:180});
  first.emit({playing:false,currentTime:0,duration:0,playbackState:'ended'});
  for(let i=0;i<5;i++)await tick();
  assert.equal(f.options.queueIndexRef.current,1);assert.equal(f.options.currentSongRef.current.id,f.songs[1].id);
  assert.equal(f.adapter.players[1].calls.some(([name])=>name==='play'),true);
  first.emit({playing:false,currentTime:180,duration:180,didJustFinish:true});await tick();
  assert.equal(f.options.queueIndexRef.current,1);assert.equal(f.errors.length,0);
  await f.commands.nextSong();for(let i=0;i<5;i++)await tick();
  assert.equal(f.options.queueIndexRef.current,2);assert.equal(f.adapter.players[2].calls.some(([name])=>name==='play'),true);
  f.adapter.destroy();
 });
}


test('Expo repeat-one creates a fresh playback owner for the same song',async()=>{
 const f=flow();f.options.repeatModeRef.current='one';await f.commands.playSong(f.songs[0],f.songs);
 f.adapter.players[0].emit({playing:false,currentTime:180,duration:180,didJustFinish:true});
 for(let i=0;i<5;i++)await tick();assert.equal(f.options.queueIndexRef.current,0);assert.equal(f.adapter.players.length,2);
 f.adapter.players[1].emit({playing:false,currentTime:180,duration:180,didJustFinish:true});
 for(let i=0;i<5;i++)await tick();assert.equal(f.adapter.players.length,3);assert.equal(f.errors.length,0);f.adapter.destroy();
});
test('Expo explicit pause prevents a late completion from advancing the queue',async()=>{
 const f=flow();await f.commands.playSong(f.songs[0],f.songs);f.options.desiredPlayStateRef.current=false;
 f.adapter.pause();f.adapter.players[0].emit({playing:false,currentTime:180,duration:180,didJustFinish:true});
 for(let i=0;i<5;i++)await tick();assert.equal(f.options.queueIndexRef.current,0);assert.equal(f.adapter.players.length,1);f.adapter.destroy();
});
test('Expo final playlist item stops normally; repeat-all returns to the first item',async()=>{
 const f=flow();await f.commands.playSong(f.songs[2],f.songs);
 f.adapter.players[0].emit({playing:false,currentTime:180,duration:180,didJustFinish:true});
 for(let i=0;i<5;i++)await tick();assert.equal(f.options.desiredPlayStateRef.current,false);assert.equal(f.adapter.players.length,1);
 f.options.repeatModeRef.current='all';await f.commands.playSong(f.songs[2],f.songs);
 f.adapter.players[1].emit({playing:false,currentTime:180,duration:180,didJustFinish:true});
 for(let i=0;i<5;i++)await tick();assert.equal(f.options.queueIndexRef.current,0);assert.equal(f.adapter.players.length,3);assert.equal(f.errors.length,0);f.adapter.destroy();
});

test('Expo stopped-at-tail event without a native EOF advances the actual shared playlist flow',async()=>{
 const f=flow();await f.commands.playSong(f.songs[0],f.songs);const old=f.adapter.players[0];
 old.emit({playing:true,currentTime:179.6,duration:180,isBuffering:false});
 old.emit({playing:false,currentTime:0,duration:0,isBuffering:false,playbackState:'ready',didJustFinish:false});
 for(let i=0;i<5;i++)await tick();assert.equal(f.options.queueIndexRef.current,1);
 assert.equal(f.adapter.players[1].calls.some(([name])=>name==='play'),true);assert.equal(f.errors.length,0);f.adapter.destroy();
});
test('Expo tail position alone, buffering and user pause cannot advance a playlist',async()=>{
 const f=flow();await f.commands.playSong(f.songs[0],f.songs);const old=f.adapter.players[0];
 old.emit({playing:true,currentTime:180,duration:180,isBuffering:false});await tick();assert.equal(f.options.queueIndexRef.current,0);
 old.emit({playing:false,currentTime:180,duration:180,isBuffering:true});await tick();assert.equal(f.options.queueIndexRef.current,0);
 f.options.desiredPlayStateRef.current=false;old.emit({playing:false,currentTime:180,duration:180,isBuffering:false});
 await tick();assert.equal(f.options.queueIndexRef.current,0);f.adapter.destroy();
});

test('Expo inflated iPhone decoder timeline advances once at the resolved stream end',async()=>{
 const f=flow();f.songs[0].playbackDurationSeconds=305.272;
 await f.commands.playSong(f.songs[0],f.songs);const old=f.adapter.players[0];
 old.emit({playing:true,currentTime:305.1,duration:610.497596,isBuffering:false});
 await tick();assert.equal(f.options.queueIndexRef.current,0);
 old.emit({playing:true,currentTime:306.001,duration:610.497596,isBuffering:false});
 for(let i=0;i<5;i++)await tick();
 assert.equal(f.options.queueIndexRef.current,1);
 assert.equal(f.adapter.players[1].calls.some(([name])=>name==='play'),true);
 assert.equal(old.calls.some(([name])=>name==='pause'),true);
 assert.equal(old.calls.some(([name])=>name==='remove'),true);
 old.emit({playing:true,currentTime:307,duration:610.497596,isBuffering:false});
 await tick();assert.equal(f.options.queueIndexRef.current,1);
 assert.equal(f.errors.length,0);f.adapter.destroy();
});

test('Expo inflated timeline cannot complete while buffering or explicitly paused',async()=>{
 const f=flow();await f.commands.playSong(f.songs[0],f.songs);const old=f.adapter.players[0];
 old.emit({playing:true,currentTime:181,duration:360,isBuffering:true});
 await tick();assert.equal(f.options.queueIndexRef.current,0);
 f.options.desiredPlayStateRef.current=false;
 old.emit({playing:true,currentTime:181,duration:360,isBuffering:false});
 await tick();assert.equal(f.options.queueIndexRef.current,0);f.adapter.destroy();
});

test('Expo catalog duration alone cannot trigger inflated-timeline completion',async()=>{
 const f=flow();delete f.songs[0].playbackDurationSeconds;
 await f.commands.playSong(f.songs[0],f.songs);
 f.adapter.players[0].emit({playing:true,currentTime:181,duration:360,isBuffering:false});
 await tick();assert.equal(f.options.queueIndexRef.current,0);f.adapter.destroy();
});
