const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const noop = () => {};
function load(file, modules = {}, globals = {}) {
  const context = { exports: {}, URL, URLSearchParams, __DEV__: false, setTimeout, clearTimeout, ...globals,
    require: name => { assert.ok(name in modules, 'Unexpected module: ' + name); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: false },
  }).outputText, context);
  return context.exports;
}
test('malformed feature links fall back without throwing', () => {
  const links = load('app/+native-intent.tsx');
  assert.equal(links.redirectSystemPath({path:'mavrixfy://feature/%',initial:true}), '/(tabs)');
  assert.equal(links.redirectSystemPath({path:'mavrixfy://feature/search',initial:true}), '/(tabs)/search');
});
test('release URLs reject private hosts, credentials, HTTP and invalid input', () => {
  const policy = load('src/lib/apiUrlPolicy.ts');
  for(const url of ['http://192.168.1.20:3000','https://localhost','https://[::1]','http://api.example.com','https://user:pass@example.com','garbage url']) {
    assert.equal(policy.normalizeApiUrl(url, false), null, url);
  }
  assert.equal(policy.normalizeApiUrl('https://api.example.com///', false), 'https://api.example.com');
  assert.equal(policy.normalizeApiUrl('http://localhost:3000/', true), 'http://localhost:3000');
});
test('account generations invalidate old work even when the same user returns', () => {
  const scope=load('src/lib/accountScope.ts');
  scope.setAccountScope('A'); const old=scope.getAccountScope(); const keyA=scope.accountStorageKey('history');
  scope.setAccountScope('B'); assert.notEqual(scope.accountStorageKey('history'), keyA);
  scope.setAccountScope('A'); assert.equal(scope.isCurrentAccount(old), false);
});
test('download metadata stays isolated after switching accounts and reloading', async () => {
  const scope=load('src/lib/accountScope.ts'); const disk=new Map();
  const storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v),removeItem:async k=>disk.delete(k),multiGet:async keys=>keys.map(k=>[k,disk.get(k)])};
  const store=load('src/lib/downloads/downloadStore.ts', {'@/lib/accountScope':scope,'@react-native-async-storage/async-storage':{default:storage},'@/types/downloads':{DEFAULT_DOWNLOAD_PREFERENCES:{}},'@/lib/logger':{logger:{error:noop}},'@/lib/storage':{getSettings:async()=>({downloadQuality:'high',downloadWifiOnly:false})}});
  scope.setAccountScope('A'); await store.saveDownload({songId:'one',accountId:'A',status:'completed'}); await store.loadAllDownloads();
  assert.equal((await store.loadDownload('one')).accountId,'A');
  scope.setAccountScope('B'); assert.equal((await store.loadAllDownloads()).length,0); assert.equal(await store.loadDownload('one'),null);
  await store.saveDownload({songId:'one',accountId:'B',status:'queued'});
  scope.setAccountScope('A'); assert.equal((await store.loadDownload('one')).status,'completed');
});
function queueHarness(currentIndex=0) {
  const ref=current=>({current}); const a={id:'A'},b={id:'B'},c={id:'C'}; let native=[a,b,c],pending;
  const queue=ref([a,b,c]),index=ref(currentIndex);
  const mod=load('src/services/audio/audioQueueOperations.ts', {react:{useCallback:f=>f},'@/lib/logger':{logger:{error:noop}},'@/services/audio/PlaybackEngine':{updatePlaybackEngineSnapshot:noop},'@/lib/arrayUtils':{},'@/services/audio/PlayerPlaybackResolver':{songToTrack:s=>s,withResolvedPlaybackUrl:s=>s}});
  const ops=mod.useAudioQueueOperations({queueRef:queue,setQueue:v=>queue.current=v,originalQueueRef:ref([a,b,c]),setSourceQueue:noop,queueIndexRef:index,setQueueIndex:v=>index.current=v,userQueuedSongIdsRef:ref([]),setUserQueuedSongIds:noop,isShuffledRef:ref(false),setIsShuffled:noop,repeatModeRef:ref('off'),setRepeatMode:noop,currentSongRef:ref(queue.current[currentIndex]),isPlayingRef:ref(true),positionSecondsRef:ref(12),streamUrlCache:ref(new Map()),TrackPlayer:{getQueue:async()=>native,add:async(s,i)=>native.splice(i,0,...s)},isPlayerReady:true,enqueueNativeQueueMutation:f=>(pending=f()),nativeQueueIdsMatch:(x,y)=>JSON.stringify(x)===JSON.stringify(y),replaceNativeQueuePreservingState:async(s,i,options)=>{native=s;assert.equal(options.position,12);assert.equal(i,index.current);},resolvePlaybackUrlCached:async()=> 'https://audio.test/song',showPlaybackNotice:noop,playSong:noop});
  return {queue,index,get native(){return native},async next(song){ops.playNext(song);await pending;}};
}
test('play next moves existing tracks without duplicating native entries',async()=>{
  const h=queueHarness(); await h.next({id:'C'});
  assert.equal(h.queue.current.map(s=>s.id).join(','),'A,C,B');assert.equal(h.native.map(s=>s.id).join(','),'A,C,B');
});
test('moving an earlier track after the active track updates its active index',async()=>{
  const h=queueHarness(2); await h.next({id:'A'});
  assert.equal(h.native.map(s=>s.id).join(','),'B,C,A');assert.equal(h.index.current,1);
});
function adHarness(show=async()=>{}) {
  const events=new Map(),timers=new Map();let timerId=0;
  const ads={RewardedAd:{createForAdRequest:()=>({addAdEventListener:(event,fn)=>{events.set(event,fn);return()=>events.delete(event);},show,load:noop})},RewardedAdEventType:{LOADED:'loaded',EARNED_REWARD:'earned'},AdEventType:{CLOSED:'closed',ERROR:'error'}};
  const service=load('src/services/ads/rewardedAdService.ts',{'@/constants/admob':{AD_UNITS:{REWARDED:'test'}},'@/lib/googleMobileAds':{getGoogleMobileAdsModule:()=>ads,initializeMobileAds:async()=>{}},'@/lib/logger':{logger:{warn:noop}}},{setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  return {service,events,timers};
}
test('closing an ad without a reward cancels and cleans every listener',async()=>{
  const h=adHarness(),pending=h.service.runRewardedAd();await new Promise(setImmediate);h.events.get('closed')();
  assert.equal(await pending,'cancelled');assert.equal(h.events.size,0);assert.equal(h.timers.size,0);
});
test('reward completion grants access once',async()=>{
  const h=adHarness(),pending=h.service.runRewardedAd();await new Promise(setImmediate);h.events.get('earned')();h.events.get('closed')();assert.equal(await pending,'earned');
});
test('asynchronous ad show rejection settles instead of hanging',async()=>{
  const h=adHarness(async()=>{throw Error('native show rejected');}),pending=h.service.runRewardedAd();await new Promise(setImmediate);h.events.get('loaded')();assert.equal(await pending,'failed');assert.equal(h.events.size,0);
});
test('an ad timeout settles and cleans listeners',async()=>{
  const h=adHarness(),pending=h.service.runRewardedAd();await new Promise(setImmediate);[...h.timers.values()][0]();assert.equal(await pending,'failed');assert.equal(h.events.size,0);
});
const { validateLicenseRequest }=require('../functions/licensePolicy.cjs');
test('server license policy denies bans, restricted territory and DRM',()=>{
  for(const status of ['banned','disabled'])assert.throws(()=>validateLicenseRequest({subscriptionStatus:status},{},{},'high'));
  for(const rights of [{offlineAllowed:false},{downloadable:false},{drmRequired:true},{territoryRights:['IN']}])assert.throws(()=>validateLicenseRequest({},rights,{},'high'));
  assert.equal(validateLicenseRequest({}, {territoryRights:['IN'],offlineMaxQuality:'medium'}, {country:'IN'},'high'),'medium');
});
