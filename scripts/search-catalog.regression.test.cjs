const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code, {module,exports:module.exports,require: name => {if (name in imports) return imports[name];throw new Error(name);}});
 return module.exports;
}
const empty = {songs:[],artists:[],albums:[],playlists:[]};
test('search reducer starts with songs, clears stale rows while typing and keeps the selected tab on clear', () => {
 const f = load('src/features/search/hooks/searchEngineReducer.ts', {'@/lib/searchRepository':{EMPTY_RESULTS:empty}});
 let state = f.createInitialSearchState(''); assert.equal(state.resultFilter,'songs');
 state = f.searchScreenReducer(state,{type:'SEARCH_SUCCESS',results:{...empty,songs:[{id:'old'}]},displayQuery:'old'});
 state = f.searchScreenReducer(state,{type:'SET_QUERY',query:'a'});
 assert.equal(state.results.songs.length,0);assert.equal(state.suggestionsOpen,true);
 state = f.searchScreenReducer(state,{type:'SET_RESULT_FILTER',filter:'albums'});
 assert.equal(state.suggestionsOpen,false);assert.equal(state.searchLoading,true);
 state = f.searchScreenReducer(state,{type:'CLEAR_SEARCH'});
 assert.equal(state.resultFilter,'albums');assert.equal(state.searchLoading,false);
});
test('search delegates only to the music catalog and autocomplete uses LastWave video suggestions', async () => {
 const calls=[];let endpoint;
 const f = load('src/lib/searchRepository.ts', {
  '@/lib/musicData':{},'@/utils/timeFormatters':{},
  '@/services/youtube/YouTubeMusic':{searchYouTubeMusic:async(...args)=>{calls.push(args);return empty;}},
  '@/utils/asyncUtils':{fetchJsonStrict:async(...args)=>{endpoint=args;return ['a',['a','ab']];}}
 });
 await f.searchRepository(' a ','songs'); assert.equal(calls.length,1);assert.equal(calls[0][0],'a');assert.equal(calls[0][1],'songs');
 const controller = new AbortController();controller.abort();await assert.rejects(f.searchRepository('a','songs',controller.signal), /cancelled/);
 await f.searchRepository('   ','songs'); assert.equal(calls.length,1);
 assert.equal((await f.fetchYouTubeSuggestions('a')).join(),'a,ab');assert.match(endpoint[0], /ds=yt&/);assert.equal(endpoint[2],5000);
});
test('home restores the artists row once while keeping Quick Picks first', () => {
 const {buildHomeSections} = load('src/features/home/hooks/buildHomeSections.ts');
 const result=buildHomeSections('All',true,[],[{id:'artists',type:'artists'},{id:'break',type:'category'}]);
 assert.equal(result[0].type,'youtube-quick-picks');assert.equal(result.filter(row=>row.type==='artists').length,1);
 assert.equal(result.filter(row=>row.type==='category').length,1);
});

// Small hook harness exercises timers and request races without a device or network.
function engineFixture() {
 let slots=[],cursor=0,pending=[],dirty=false,value,now=0,serial=0;const timers=new Map(),requests=[],suggestions=[];
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const react={
  useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;dirty=true;}];},
  useReducer(reducer,arg,init){const i=cursor++;if(!(i in slots))slots[i]=init(arg);return [slots[i],action=>{slots[i]=reducer(slots[i],action);dirty=true;}];},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
  useCallback(fn,deps){return this.useMemo(()=>fn,deps);},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps)){const old=slots[i];slots[i]={deps};pending.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}
 };
 // Destructured hook functions must retain access to the harness.
 react.useCallback=(fn,deps)=>react.useMemo(()=>fn,deps);
 const reducer=load('src/features/search/hooks/searchEngineReducer.ts',{'@/lib/searchRepository':{EMPTY_RESULTS:empty}});
 const noop=()=>{};const scroll={handleHeaderScroll:noop,resetHeaderElevation:noop};const push=noop,play=noop;
 const imports={react,'expo-router':{useRouter:()=>({push}),useFocusEffect:noop},'react-native':{Platform:{OS:'android'},Keyboard:{dismiss:noop}},
 'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0})},'@/components/AppTopHeader':{useAppTopHeaderScrollElevation:()=>scroll},
 '@/contexts/NetworkContext':{useNetwork:()=>({isOnline:true}),useOnReconnect:noop},'@/contexts/PlayerContext':{usePlayerActions:()=>({playSong:play})},
 '@/lib/musicData':{},'@/lib/searchUtils':{normalizeText:s=>s.toLowerCase()},'@/services/youtube/YouTubeMusic':{clearYouTubeSearchCache:noop},
 '@/lib/storage':{addSearchHistoryItem:async()=>[]},'../types':{getRouteSearchQuery:()=>'',normalizeRecentSearchLabel:s=>s.trim(),normalizeSearchSuggestionList:s=>s,STITCH_BROWSE_CATEGORIES:[],toRecentSearchItems:s=>s},
 './searchEngineReducer':reducer,'@/lib/searchRepository':{searchRepository:(q,filter,signal)=>new Promise(resolve=>requests.push({q,filter,signal,resolve})),fetchYouTubeSuggestions:(q,signal)=>new Promise(resolve=>suggestions.push({q,signal,resolve}))}};
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/features/search/hooks/useSearchEngine.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,AbortController,require:n=>{if(n in imports)return imports[n];throw new Error(n);},
 setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 function render(){let count=0;do{dirty=false;cursor=0;value=module.exports.useSearchEngine({});const work=pending;pending=[];work.forEach(fn=>fn());if(++count>20)throw new Error('render loop');}while(dirty);return value;}
 return {render,requests,suggestions,advance(ms){now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}return render();},async settle(){await new Promise(resolve=>setImmediate(resolve));return render();}};
}
test('search debounces, rejects stale responses and restarts after rapid tab reversal', async()=>{
 const f=engineFixture();f.render().handleChangeText('cha');f.render();f.advance(119);assert.equal(f.suggestions.length,0);
 f.advance(1);assert.equal(f.suggestions.length,1);assert.equal(f.requests.length,0);
 f.advance(280);assert.equal(f.requests.length,1);assert.equal(f.requests[0].filter,'songs');
 f.render().handleChangeText('chaleya');f.render();assert.equal(f.requests[0].signal.aborted,true);
 f.requests[0].resolve({...empty,songs:[{id:'stale'}]});assert.equal((await f.settle()).songResults.length,0);
 f.advance(400);assert.equal(f.requests.length,2);
 f.render().handleResultFilterSelect('albums');f.render();
 f.render().handleResultFilterSelect('songs');f.render();f.advance(0);
 assert.equal(f.requests.length,3);assert.equal(f.requests[2].filter,'songs');
 f.requests[2].resolve({...empty,songs:[{id:'fresh'}]});assert.equal((await f.settle()).songResults[0].id,'fresh');
 f.render().handleClear();f.render();f.advance(500);assert.equal(f.render().songResults.length,0);
});

test('submit searches immediately and a late autocomplete response cannot reopen suggestions', async()=>{
 const f=engineFixture();f.render().handleChangeText('chaleya');f.render();f.advance(120);
 f.render().handleSubmitSearch();f.render();assert.equal(f.requests.length,1);
 f.suggestions[0].resolve(['chaleya song']);await f.settle();
 assert.equal(f.render().suggestionsOpen,false);f.advance(400);assert.equal(f.requests.length,1);
 f.requests[0].resolve({...empty,songs:[{id:'played'}]});assert.equal((await f.settle()).songResults[0].id,'played');
});
