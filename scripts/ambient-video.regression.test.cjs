const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture() {
  let cursor = 0, effects = [], starts = 0, plays = 0, pauses = 0;
  const slots = [], events = [], listeners = new Map();
  const same = (a,b) => a && b && a.length===b.length && a.every((v,i)=>Object.is(v,b[i]));
  const react = { memo: fn=>fn, createElement: (type,props,...children)=>({type,props:{...props,children}}),
    useRef: value=>slots[cursor++] ??= {current:value}, useState: value=>[slots[cursor++] ??= (typeof value === "function" ? value() : value),()=>{}],
    useCallback: fn=>{cursor++;return fn;},
    useEffect: (fn,deps)=>{const i=cursor++; if(!slots[i] || !same(slots[i].deps,deps)) {
      const old=slots[i]; slots[i]={deps}; effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});
    }} };
  const player = { currentTime:0, seekBy(seconds){this.currentTime+=seconds;}, play:()=>plays++, pause:()=>pauses++,
    addListener:(name,fn)=>{listeners.set(name,fn);return{remove:()=>listeners.delete(name)};} };
  const query=[];
  const module={exports:{}};
  const dependencies={react, 'react-native':{StyleSheet:{absoluteFillObject:{}}},
    '@/lib/nativeAnimated':{Value:class{},View:'AnimatedView',timing:()=>({start:()=>starts++,stop(){}})},
    '@/services/audio/playbackProgressStore':{getPlaybackProgressSnapshot:()=>({positionMillis:60000})},
    '@/services/youtube/YouTubeMusic':{resolveYouTubeVideoStream(){}},
    '@tanstack/react-query':{useQuery:options=>{query.push(options);return{};}},
    'expo-video':{VideoView:'VideoView',useVideoPlayer:(source,setup)=>{cursor++;if(!player.initialized){setup(player);player.initialized=true;}return player;}},
  };
  const code=ts.transpileModule(fs.readFileSync('src/features/player/components/BackgroundYoutubeVideo.tsx','utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}
  }).outputText+'\nexports.NativeVisual = NativeVisual;';
  vm.runInNewContext(code,{module,exports:module.exports,React:react,require:name=>{if(!(name in dependencies))throw Error(name);return dependencies[name];}});
  const props={videoId:'abcdefghijk',active:true,quality:'high',initialOffsetMs:0,containerHeight:800,
    stream:{url:'https://example.test/video',headers:{}},onVideoActive:v=>events.push(v),onVideoError:v=>events.push(v)};
  return {props,player,listeners,events,query,api:module.exports,
    render:()=>{cursor=0;effects=[];const tree=module.exports.NativeVisual(props);effects.forEach(fn=>fn());return tree.props.children[0].props;},
    counts:()=>({starts,plays,pauses}),dispose:()=>slots.forEach(s=>s?.cleanup?.())};
}
test('native visual stays muted, mixes with song audio and owns no media notification',()=>{
  const f=fixture(), view=f.render();
  assert.equal(f.player.muted,true);assert.equal(f.player.volume,0);assert.equal(f.player.audioMixingMode,'mixWithOthers');
  assert.equal(f.player.showNowPlayingNotification,false);assert.equal(f.player.staysActiveInBackground,false);
  assert.equal(view.contentFit,'cover');assert.equal(view.nativeControls,false);assert.equal(f.player.currentTime,60);
  f.dispose();
});
test('first decoded frame reveals once, errors report once, screen inactivity pauses the decoder',()=>{
  const f=fixture(),view=f.render();view.onFirstFrameRender();view.onFirstFrameRender();assert.equal(f.counts().starts,1);
  const error=f.listeners.get('statusChange');error({status:'error'});error({status:'error'});
  assert.equal(f.events.filter(e=>e==='Background video unavailable').length,1);
  f.props.active=false;f.render();assert.ok(f.counts().pauses > 0);assert.equal(f.player.loop,true);
  f.props.active=true;f.render();assert.equal(f.player.currentTime,60);f.dispose();
});
test('progress renders do not restart video, and auto chooses low quality on low-end devices',()=>{
  const f=fixture();f.render();const plays=f.counts().plays;f.props.initialOffsetMs=61000;f.render();assert.equal(f.counts().plays,plays);f.dispose();
  f.api.BackgroundYoutubeVideo({...f.props,quality:'auto',isLowEnd:true});
  assert.equal(f.query[0].queryKey[2],'low');assert.equal(f.query[0].retry,false);
});
test('resolution selection respects every manual bandwidth ceiling',()=>{
  const {selectVideoFormats}=require('./helpers/youtube-video-fixture.cjs');
  const formats=[240,360,480,720,1080].map(height=>({height,bitrate:height*1000}));
  for(const [quality,height] of [['low',360],['medium',480],['auto',720],['high',1080]])assert.equal(selectVideoFormats(formats,quality)[0].height,height);
  assert.throws(()=>selectVideoFormats([{height:1080,bitrate:1}], 'low'));
});


test('unmount after Expo releases the native player performs no decoder calls',()=>{
  const f=fixture();f.render();
  f.player.pause=()=>{throw Error('Native shared object was already released');};
  f.player.seekBy=()=>{throw Error('Native shared object was already released');};
  assert.doesNotThrow(()=>f.dispose());
  assert.equal(f.listeners.size,0);
});
test('native cover restores the original 260px top and bottom crop',()=>{
  const f=fixture(),view=f.render();
  assert.equal(view.style.top,-260);assert.equal(view.style.bottom,-260);assert.equal(view.contentFit,'cover');f.dispose();
});

test('background uses only the current YouTube audio ID, ignoring alternate visual IDs and other providers',()=>{
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/player/hooks/useBackgroundVisualVideo.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,{module,exports:module.exports,require:()=>({})});
  const id=module.exports.getBackgroundSongVideoId;
  assert.equal(id({id:'youtube_abcdefghijk',source:'youtube',youtubeVideoId:'abcdefghijk',youtubeVisualVideoId:'otherid1234'}),'abcdefghijk');
  assert.equal(id({id:'youtube_abcdefghijk'}),'abcdefghijk');
  assert.equal(id({id:'saavn_123',source:'jiosaavn',youtubeVisualVideoId:'abcdefghijk'}),null);
  assert.equal(id({id:'youtube_bad',source:'youtube',youtubeVideoId:'bad'}),null);
  assert.equal(id(null),null);
});
test('the visible backdrop runs independently of song play/pause',()=>{
  const react={memo:fn=>fn,useMemo:fn=>fn(),createElement:(type,props,...children)=>({type,props:{...props,children}})};
  const module={exports:{}};
  const deps={react,'@/lib/nativeAnimated':{View:'AnimatedView'},'expo-linear-gradient':{LinearGradient:'Gradient'},
    '../styles/playerScreenStyles':{styles:{}},'./BackgroundYoutubeVideo':{BackgroundYoutubeVideo:'Video'}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/player/components/PlayerAmbientBackdrop.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}
  }).outputText,{module,exports:module.exports,require:name=>deps[name]});
  const tree=module.exports.PlayerAmbientBackdrop({shouldRender:true,backgroundVideoId:'abcdefghijk',screenHeight:800,screenWidth:390,
    isLowEnd:false,quality:'high',isScreenFocused:true,playerIsPlaying:false,fullscreenLyricsVisible:false,
    artScrollX:{interpolate:()=>1},activeQueueIndex:0,artCarouselSnapInterval:390});
  assert.equal(tree.props.children[0].props.active,true);assert.equal(tree.props.children[0].props.videoId,'abcdefghijk');
});
