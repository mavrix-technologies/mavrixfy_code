const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture({ expoGo = false, missing = false, failedSetup = false } = {}) {
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
  });
  return {...api,calls,state,setups:()=>setups,listeners,
    emit:(name,data)=>listeners.forEach(listener=>listener({name,data})),};
}
function load(path, deps) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(!(name in deps))throw Error(name);return deps[name];}});
  return module.exports;
}
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
test('Android car browsing uses the same native bridge',async()=>{
  const f=fixture();const car=f.getNativeCarClient();let id;
  car.addListener('MavrixfyPlayMediaId',event=>id=event.id);await f.NativePlaybackPlayer.setupPlayer();
  f.emit('car-play-media',{id:'b'});assert.equal(id,'b');
});
