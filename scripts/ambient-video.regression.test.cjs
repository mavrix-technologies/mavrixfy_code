const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture() {
  let cursor = 0, effects = [], starts = 0, plays = 0, pauses = 0;
  const slots = [];
  const same = (a,b) => a && b && a.length===b.length && a.every((v,i)=>Object.is(v,b[i]));
  const react = { memo: fn=>fn, createElement: (type,props,...children)=>({type,props:{...props,children}}),
    useRef: value=>slots[cursor++] ??= {current:value}, useState: value=>[slots[cursor++] ??= (typeof value === "function" ? value() : value),()=>{}],
    useCallback: fn=>{cursor++;return fn;},
    useEffect: (fn,deps)=>{const i=cursor++; if(!slots[i] || !same(slots[i].deps,deps)) {
      const old=slots[i]; slots[i]={deps}; effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});
    }} };
  const player = { currentTime:0, seekBy(seconds){this.currentTime+=seconds;}, play:()=>plays++, pause:()=>pauses++,
    addListener:()=>({remove(){}}) };
  const query=[];
  const module={exports:{}};
  const dependencies={react, 'react-native':{StyleSheet:{absoluteFillObject:{}}},
    '@/lib/nativeAnimated':{Value:class{},View:'AnimatedView',timing:()=>({start:()=>starts++,stop(){}})},
    '@/services/audio/playbackProgressStore':{getPlaybackProgressSnapshot:()=>({positionMillis:60000})},
    '@/services/youtube/YouTubeMusic':{resolveYouTubeVideoStream(){},resolveOfficialYouTubeMusicVideo(){}},
    '@/lib/logger':{logger:{warn(){}}},
    '@tanstack/react-query':{useQuery:options=>{query.push(options);return{};}},
    'expo-video':{VideoView:'VideoView',useVideoPlayer:(source,setup)=>{cursor++;if(!player.initialized){setup(player);player.initialized=true;}return player;}},
  };
  const code=ts.transpileModule(fs.readFileSync('src/features/player/components/BackgroundYoutubeVideo.tsx','utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}
  }).outputText+'\nexports.NativeVisual = NativeVisual;';
  vm.runInNewContext(code,{module,exports:module.exports,React:react,__DEV__:false,
    require:name=>{if(!(name in dependencies))throw Error(name);return dependencies[name];}});
  const props={videoId:'abcdefghijk',active:true,quality:'high',initialOffsetMs:0,
    song:{id:'youtube_abcdefghijk',title:'Test Song',artist:'Test Artist',duration:180,artistRefs:[]},
    stream:{url:'https://example.test/video',headers:{}}};
  return {props,player,query,api:module.exports,
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
test('first decoded frame reveals once and screen inactivity pauses the decoder',()=>{
  const f=fixture(),view=f.render();view.onFirstFrameRender();view.onFirstFrameRender();assert.equal(f.counts().starts,1);
  f.props.active=false;f.render();assert.ok(f.counts().pauses > 0);assert.equal(f.player.loop,true);
  f.props.active=true;f.render();assert.equal(f.player.currentTime,60);f.dispose();
});
test('progress renders do not restart video, and auto chooses low quality on low-end devices',()=>{
  const f=fixture();f.render();const plays=f.counts().plays;f.props.initialOffsetMs=61000;f.render();assert.equal(f.counts().plays,plays);f.dispose();
  f.api.BackgroundYoutubeVideo({...f.props,quality:'auto',isLowEnd:true});
  assert.equal(f.query[1].queryKey[2],'low');assert.equal(f.query[1].retry,false);
});

test('reopening the player reuses a successful official-video miss without another catalog lookup', async()=>{
  const {QueryClient,QueryObserver}=require('@tanstack/query-core');
  const f=fixture();f.api.BackgroundYoutubeVideo(f.props);
  const options=f.query[0];let searches=0;
  const client=new QueryClient();
  const makeObserver=()=>new QueryObserver(client,{...options,queryFn:async()=>{searches++;return null;}});
  const first=makeObserver(),unsubscribe=first.subscribe(()=>{});
  while(first.getCurrentResult().isFetching)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(first.getCurrentResult().data,null);
  unsubscribe();first.destroy();
  const reopened=makeObserver(),stop=reopened.subscribe(()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(searches,1);
  assert.equal(reopened.getCurrentResult().data,null);
  stop();reopened.destroy();client.clear();
});

test('player recommendations deduplicate YouTube songs and retain cache across open-close',async()=>{
  const {QueryClient,QueryObserver}=require('@tanstack/query-core');
  const module={exports:{}};let options,calls=0;
  const original={id:'youtube_abcdefghijk',title:'Song',artist:'Artist'};
  const recommendation={id:'youtube_lmnopqrstuv',title:'Next',artist:'Artist'};
  const deps={
    react:{useState:value=>[value,()=>{}],useEffect(){},useCallback:fn=>fn},
    '@tanstack/react-query':{useQuery:value=>{options=value;return{};}},
    '@/data/providers/ArtistProvider':{},'@/lib/musicData':{},'@/services/youtube/YouTubeArtists':{validArtistChannelId:()=>false},
    '@/utils/navigation':{},'expo-router':{},
    '@/services/youtube/YouTubeMusic':{isYouTubeSong:song=>song.id.startsWith('youtube_'),
      relatedYouTubeSongs:async(song,signal)=>{calls++;assert.equal(song.id,original.id);assert.ok(signal);
        return[original,recommendation,recommendation,{id:'saavn_old'}];}},
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/player/hooks/useArtistDiscovery.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,{module,exports:module.exports,require:name=>{if(!(name in deps))throw Error(name);return deps[name];}});
  const render=song=>module.exports.useArtistDiscovery({enabled:true,screenSong:song,playingQueue:[],activeQueueIndex:0,playSong(){}});
  render(original);
  const client=new QueryClient(),first=new QueryObserver(client,options),unsubscribe=first.subscribe(()=>{});
  while(first.getCurrentResult().isFetching)await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(Array.from(first.getCurrentResult().data,song=>song.id),[recommendation.id]);
  unsubscribe();first.destroy();
  render({...original}); // New song object after player reopen has the same catalog identity.
  const reopened=new QueryObserver(client,options),stop=reopened.subscribe(()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);assert.equal(reopened.getCurrentResult().data[0].id,recommendation.id);
  stop();reopened.destroy();client.clear();
});
test('resolution selection respects every manual bandwidth ceiling',()=>{
  const {selectVideoFormats}=require('./helpers/youtube-video-fixture.cjs');
  const formats=[240,360,480,720,1080].map(height=>({height,bitrate:height*1000}));
  for(const [quality,height] of [['low',360],['medium',480],['auto',720],['high',1080]])assert.equal(selectVideoFormats(formats,quality)[0].height,height);
  assert.throws(()=>selectVideoFormats([{height:1080,bitrate:1}], 'low'));
});

test('official background video selection rejects audio uploads, fan uploads, wrong artists and mismatched songs',()=>{
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/youtube/officialMusicVideo.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,{module,exports:module.exports});
  const select=module.exports.selectOfficialMusicVideo;
  const query={title:'Test Song',artist:'Test Artist',durationSeconds:180,artistChannelIds:['UCartist']};
  const candidates=[
    {videoId:'audio123456',title:'Test Song',durationSeconds:180,musicVideoType:'MUSIC_VIDEO_TYPE_ATV',artists:[{id:'UCartist',name:'Test Artist'}]},
    {videoId:'fanvid12345',title:'Test Song Official Video',durationSeconds:180,musicVideoType:'MUSIC_VIDEO_TYPE_UGC',artists:[{id:'UCartist',name:'Test Artist'}]},
    {videoId:'wrongart123',title:'Test Song',durationSeconds:180,musicVideoType:'MUSIC_VIDEO_TYPE_OMV',artists:[{id:'UCother',name:'Other Artist'}]},
    {videoId:'wrongdur1234',title:'Test Song',durationSeconds:260,musicVideoType:'MUSIC_VIDEO_TYPE_OMV',artists:[{id:'UCartist',name:'Test Artist'}]},
    {videoId:'official123',title:'Test Song (Official Video)',durationSeconds:181,musicVideoType:'MUSIC_VIDEO_TYPE_OMV',artists:[{id:'UCartist',name:'Test Artist'}]},
  ];
  assert.equal(select(candidates,query),'official123');
  assert.equal(select(candidates.slice(0,4),query),null);
  const collaborators={title:'Maand',artist:'Bayaan, Hasan Raheem & Rovalio',durationSeconds:185,artistChannelIds:[]};
  const original={videoId:'zFk1ke2pcTA',title:'Maand',durationSeconds:186,musicVideoType:'MUSIC_VIDEO_TYPE_OMV',artists:[{name:'Bayaan'}]};
  assert.equal(select([original],collaborators),'zFk1ke2pcTA');
  for(const title of ['Maand Female Version','Maand (Lyrics)','Maand (Visualizer)']) {
    assert.equal(select([{...original,title}],collaborators),null,title);
  }
  const alternative={...original,videoId:'official123',title:'Maand - Lofi',durationSeconds:185};
  assert.equal(select([alternative,original],collaborators),'zFk1ke2pcTA');
  assert.equal(select([alternative],collaborators),'official123');
});


test('unmount stops only the JS frame reveal animation',()=>{
  const f=fixture();f.render();
  f.player.pause=()=>{throw Error('Native shared object was already released');};
  f.player.seekBy=()=>{throw Error('Native shared object was already released');};
  assert.doesNotThrow(()=>f.dispose());
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
  const react={memo:fn=>fn,useMemo:fn=>fn(),useEffect:fn=>fn(),useRef:value=>({current:value}),
    useState:initial=>[initial,()=>{}],createElement:(type,props,...children)=>({type,props:{...props,children}})};
  class Value { constructor(value){this.value=value;} interpolate(){return 1;} setValue(value){this.value=value;} stopAnimation(){} }
  const module={exports:{}};
  const deps={react,'@/lib/nativeAnimated':{View:'AnimatedView',Value,timing:()=>({}),parallel:()=>({start(){},stop(){}})},
    '@/lib/colorExtractor':{ARTWORK_AMBIENT_GRADIENT_LOCATIONS:[0,.4,.75,1],ARTWORK_AMBIENT_TRANSITION_DURATION_MS:850,
      getArtworkAmbientGradientStops:()=>['a','b','c','#000']},'react-native':{StyleSheet:{absoluteFillObject:{fill:true}}},
    'expo-linear-gradient':{LinearGradient:'Gradient'},
    '../styles/playerScreenStyles':{styles:{}},'./BackgroundYoutubeVideo':{BackgroundYoutubeVideo:'Video'}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/player/components/PlayerAmbientBackdrop.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}
  }).outputText,{module,exports:module.exports,require:name=>deps[name]});
  const tree=module.exports.PlayerAmbientBackdrop({shouldRender:true,backgroundVideoId:'abcdefghijk',screenHeight:800,screenWidth:390,
    isLowEnd:false,quality:'high',isScreenFocused:true,playerIsPlaying:false,fullscreenLyricsVisible:false,
    trackScrollX:{interpolate:()=>1},activeQueueIndex:0,trackPageWidth:390,
    artworkPalette:{accent:'#f00',background:'#200',text:'#fff',isDark:true,primary:'#f00'}});
  const nodes=[];const visit=node=>{if(!node||typeof node!=='object')return;nodes.push(node);for(const child of node.props?.children||[])visit(child);};visit(tree);
  const video=nodes.find(node=>node.type==='Video');
  assert.equal(video.props.active,true);assert.equal(video.props.videoId,'abcdefghijk');
  assert.ok(nodes.some(node=>node.type==='Gradient'&&node.props.colors[0]==='a'));
  assert.ok(nodes.some(node=>node.type==='Gradient'&&node.props.style.height===320));
});
