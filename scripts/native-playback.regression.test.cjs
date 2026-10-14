const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture({ expoGo = false, missing = false, failedSetup = false, resolveStream = async () => ({}) } = {}) {
  const preference = { effective: 'medium', preferJioSaavn: false };
  const calls = []; const listeners = new Set(); let setups = 0;
  const state = { queue: [], index: -1, state: 'none', position: 0, duration: 0, playWhenReady: false, equalizerAvailable: true };
  const bridge = {
    setup: async () => { setups++; if(failedSetup) { failedSetup = false; throw Error('Setup rejected'); } return {...state}; },
    snapshot: async () => ({...state}),
    addListener: (_, listener) => {listeners.add(listener); return { remove: () => listeners.delete(listener) };},
    command: async (name, args) => {
      calls.push([name, args]);
      if(name==='setQueue') Object.assign(state, {queue:args.tracks,index:args.index,position:args.position});
      if(name==='update') state.queue[args.index] = {...state.queue[args.index],...args.metadata};
      if(name==='play') Object.assign(state,{state:'playing',playWhenReady:true});
      if(name==='pause') Object.assign(state,{state:'paused',playWhenReady:false});
      if(name==='skip') Object.assign(state,{index:args.index,position:args.position});
      if(name==='reset') Object.assign(state,{queue:[],index:-1,state:'none',playWhenReady:false});
      return {...state};
    },
  };
  const contract = load('src/services/audio/playbackContract.ts',{});
  const api = load('src/services/audio/NativePlaybackPlayer.ts',{
    'expo-modules-core':{requireOptionalNativeModule:()=>missing?null:bridge},expo:{isRunningInExpoGo:()=>expoGo},
    'react-native':{Platform:{OS:'android'}},'./equalizerConfig':{EQ_FREQUENCIES_HZ:Array(15).fill(100)},
    '@/lib/logger':{logger:{warn(){}}},'./playbackContract':contract,'./audioEqualizer':{syncEqualizerWithNative:async()=>{}},
    '@/services/youtube/YouTubeMusic': { resolveYouTubeStream: resolveStream },
    './PlayerPlaybackResolver': { getRequestedQualityPreference: async () => ({ ...preference }) },
    './audioTimeline': { playbackStreamMetadata: () => ({}) },
  });
  return {...api,calls,state,preference,setups:()=>setups,listeners,
    emit:(name,data)=>listeners.forEach(listener=>listener({name,data})),};
}
function load(path, deps) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{Date,module,exports:module.exports,require:name=>{if(!(name in deps))throw Error(name);return deps[name];}});
  return module.exports;
}
test('native progress exposes real buffering and remains compatible with older binaries', async () => {
  const f = fixture();
  f.state.position = 12.25; f.state.duration = 180; f.state.buffered = 64.125;
  assert.equal((await f.NativePlaybackPlayer.getProgress()).buffered, 64.125);
  delete f.state.buffered;
  assert.equal((await f.NativePlaybackPlayer.getProgress()).buffered, 0);
});

test('native queue resolves only the next track, not the remaining queue', async () => {
  const resolved = [];
  const f = fixture({ resolveStream: async song => {
    resolved.push(song.id);
    return { url: 'https://audio.example/next', expiresAt: Date.now() + 300000 };
  } });
  await f.NativePlaybackPlayer.setQueue(['a', 'b', 'c', 'd'].map(id => ({ id: `youtube_${id}`, source: 'youtube' })), 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(resolved, ['youtube_b']);
  assert.equal(f.calls.filter(([name]) => name === 'update').length, 1);
});

test('development and production share one native initialization and event subscription',async()=>{
  const f=fixture();await Promise.all([f.NativePlaybackPlayer.setupPlayer(),f.NativePlaybackPlayer.setupPlayer()]);
  assert.equal(f.setups(),1);assert.equal(f.listeners.size,1);
});
test('failed setup releases its subscription before retry',async()=>{
  const f=fixture({failedSetup:true});await assert.rejects(f.NativePlaybackPlayer.setupPlayer(),/Setup rejected/);
  assert.equal(f.listeners.size,0);await f.NativePlaybackPlayer.setupPlayer();assert.equal(f.listeners.size,1);
});
test('Expo Go and an outdated native build cannot accidentally instantiate another engine',async()=>{
  for(const options of [{expoGo:true},{missing:true}]){
    const f=fixture(options);await assert.rejects(f.NativePlaybackPlayer.setupPlayer(),/Rebuild/);assert.equal(f.setups(),0);
  }
});
test('native automatic Next only publishes events and never requests a second JS advance',async()=>{
  const f=fixture();const p=f.NativePlaybackPlayer;await p.setupPlayer();let transitions=0;
  const sub=p.addEventListener(f.Event.PlaybackActiveTrackChanged,()=>transitions++);
  f.emit(f.Event.PlaybackActiveTrackChanged,{index:1,track:{id:'b'}});
  assert.equal(transitions,1);assert.equal(f.calls.length,0);sub.remove();
  f.emit(f.Event.PlaybackActiveTrackChanged,{index:2});assert.equal(transitions,1);
});
test('shared Play, Next and Seek delegate to native ownership and preserve seconds',async()=>{
  const f=fixture();const p=f.NativePlaybackPlayer;await p.setQueue([{id:'a',url:'https://a'},{id:'b',url:'https://b'}]);await p.play();await p.skipToNext();await p.seekTo(43.5);
  assert.equal(f.state.index,1);assert.equal(f.state.playWhenReady,true);
  assert.equal(f.calls.at(-1)[1].position,43.5);await assert.rejects(p.seekTo(NaN),/Invalid/);
});
test('invalid queue selections cannot mutate native state',async()=>{
  const f=fixture();const p=f.NativePlaybackPlayer;await p.setQueue([{id:'a',url:'https://a'}]);
  const before=f.calls.length;
  for(const index of [-1,1,0.5,NaN]) await assert.rejects(p.skip(index),/Invalid/);
  await assert.rejects(p.skip(0,Infinity),/Invalid/);
  assert.equal(f.calls.length,before);assert.equal(f.state.index,0);
});
test('native bridge payload omits undefined optional song fields at every depth',async()=>{
  const f=fixture();const p=f.NativePlaybackPlayer;
  await p.setQueue([{id:'a',url:'https://a',artist:undefined,headers:{Authorization:undefined,Referer:'music'},details:{missing:undefined,present:null},duration:0}]);
  const track=f.calls.find(([name])=>name==='setQueue')[1].tracks[0];
  assert.equal(Object.hasOwn(track,'artist'),false);
  assert.equal(Object.hasOwn(track.headers,'Authorization'),false);
  assert.equal(track.headers.Referer,'music');assert.equal(track.details.present,null);
  assert.equal(Object.hasOwn(track.details,'missing'),false);assert.equal(track.duration,0);
  await p.updateMetadataForTrack(0,{artist:undefined,title:'Updated'});
  assert.equal(Object.hasOwn(f.calls.at(-1)[1].metadata,'artist'),false);
});
test('resolved next source updates the native queue without allocating a preload player',async()=>{
  const f=fixture();const p=f.NativePlaybackPlayer;await p.setQueue([{id:'a',url:'https://a'},{id:'b',url:''}]);
  await p.prepareTrack({id:'b',url:'https://b',headers:{Referer:'music'}});
  assert.equal(f.state.queue[1].url,'https://b');assert.equal(f.state.queue[1].headers.Referer,'music');
  assert.equal(f.calls.at(-1)[0],'update');
  assert.equal(f.calls.at(-1)[1].onlyUpcoming,true);
});

test('source preference refresh updates only the upcoming song and reaches native preloading', async () => {
  const requests=[];
  const f=fixture({resolveStream:async(song,quality,prefer)=>{
    requests.push({id:song.id,quality,prefer,duration:song.duration});
    return {url:prefer?'https://aac.saavncdn.com/preferred.mp4':'https://media.example/youtube',headers:{},expiresAt:Date.now()+300000};
  }});
  await f.NativePlaybackPlayer.setQueue([{id:'a',url:'https://current'},
    {id:'youtube_b',source:'youtube',title:'Song',artist:'Artist',duration:214,url:'https://old',youtubeAudioExpiresAt:Date.now()+300000}]);
  f.preference.preferJioSaavn=true;
  await f.NativePlaybackPlayer.refreshUpcomingSources();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requests,[{id:'youtube_b',quality:'medium',prefer:true,duration:214}]);
  assert.equal(f.state.queue[0].url,'https://current');
  assert.equal(f.state.queue[1].url,'https://aac.saavncdn.com/preferred.mp4');
  f.preference.preferJioSaavn=false;
  await f.NativePlaybackPlayer.refreshUpcomingSources();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.state.queue[1].url,'https://media.example/youtube');
  assert.equal(f.state.index,0);
});
test('Android car browsing acknowledges the native request without a second playback command',async()=>{
  const f=fixture();const car=f.getNativeCarClient();let event;
  car.addListener('MavrixfyPlayMediaId',value=>event=value);await f.NativePlaybackPlayer.setupPlayer();
  f.emit('car-play-media',{id:'b',requestId:'selection-1'});assert.deepEqual(event,{id:'b',requestId:'selection-1'});
  await car.completeSelection(event.requestId,event.id);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))),['carResolution',{requestId:'selection-1',mediaId:'b'}]);
  await car.completeSelection('selection-2',undefined,'Unavailable');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))),['carResolution',{requestId:'selection-2',error:'Unavailable'}]);
  assert.equal(f.calls.some(([name])=>name==='play'||name==='setQueue'),false);
});
