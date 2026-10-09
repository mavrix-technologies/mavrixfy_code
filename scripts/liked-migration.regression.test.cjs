const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URL,require:name=>{if(!(name in deps))throw Error(name);return deps[name];}});return module.exports;}
const format=load('src/services/liked-songs/likedSongFormat.ts');
const backfill=require('./helpers/liked-backfill.cjs');
const legacy={id:'saavn-old',source:'jiosaavn',title:'Chaleya',artist:'Arijit Singh, Shilpa Rao',album:'Jawan',duration:200,coverUrl:'old.jpg',audioUrl:'https://saavncdn.com/audio',genre:'',likedSongDocumentIds:['saavn-old']};
const selected={...legacy,id:'youtube_abcdefghijk',source:'youtube',youtubeVideoId:'abcdefghijk',coverUrl:'new.jpg',audioUrl:'https://signed.example/?secret',likedSongDocumentIds:undefined};
function storeFixture(){let state;const create=initializer=>{const set=update=>{const value=typeof update==='function'?update(state):update;state={...state,...value};};state=initializer(set);return{getState:()=>state};};return load('src/services/liked-songs/likedSongsStore.ts',{zustand:{create},'./likedSongFormat':format}).useLikedSongsStore;}
test('youtubeUrl hydrates canonical playback while preserving the released JioSaavn audioUrl',()=>{
 const data={...legacy,likedAt:123,imageUrl:'old.jpg',youtubeUrl:'https://music.youtube.com/watch?v=abcdefghijk'};
 const before=JSON.stringify(data);const song=format.readLikedSong('saavn-old',data);
 assert.equal(song.id,'youtube_abcdefghijk');assert.equal(song.source,'youtube');assert.equal(song.audioUrl,'');
 assert.deepEqual([...song.likedSongDocumentIds],['saavn-old']);assert.equal(JSON.stringify(data),before);
 assert.equal(data.audioUrl,legacy.audioUrl);
 assert.equal(format.readLikedSong('saavn-old',{...data,youtubeUrl:'https://music.youtube.com/watch?v=bad'}).id,'saavn-old');
});
test('a newly selected permanent URL overrides a previous YouTube version without changing the old like ID',()=>{
 const data={...legacy,source:'youtube',youtubeVideoId:'abcdefghijk',videoId:'abcdefghijk',youtubeUrl:'https://music.youtube.com/watch?v=12345678901'};
 const song=format.readLikedSong('saavn-old',data);
 assert.equal(song.id,'youtube_12345678901');assert.equal(song.youtubeVideoId,'12345678901');
 assert.equal(song.likedSongDocumentIds[0],'saavn-old');assert.equal(song.audioUrl,'');
});
test('legacy source=mavrixfy YouTube IDs recover, duplicates retain all unlike identities',()=>{
 const oldYoutube=format.readLikedSong('youtube_abcdefghijk',{title:'Chaleya',artist:'Singer',source:'mavrixfy',audioUrl:'expired'});
 assert.equal(oldYoutube.source,'youtube');assert.equal(oldYoutube.youtubeVideoId,'abcdefghijk');assert.equal(oldYoutube.audioUrl,'');
 const mapped={...selected,likedSongDocumentIds:['saavn-old']};
 const songs=format.mergeLikedSongIdentities([mapped,oldYoutube]);assert.equal(songs.length,1);
 assert.deepEqual(new Set(format.likedSongDocumentIds(songs[0])),new Set(['youtube_abcdefghijk','saavn-old']));
 const store=storeFixture();store.getState().setSongs(songs);assert.equal(store.getState().ids.has('saavn-old'),true);
 store.getState().removeSongOptimistic('saavn-old');assert.equal(store.getState().songs.length,0);assert.equal(store.getState().ids.size,0);
 store.getState().addSongOptimistic(songs[0]);assert.equal(store.getState().ids.has(selected.id),true);
});
test('Firestore writer persists canonical provider/IDs, never a signed YouTube URL',async()=>{
 const writes=[];const api=load('src/lib/firestore.ts',{
 '@/lib/arrayUtils':{},'@/lib/playlistMemoryCache':{},'@/services/liked-songs/likedSongFormat':format,'./firebase':{db:{}},
 'firebase/firestore':{doc:(_, ...parts)=>parts.join('/'),getDoc:async()=>({exists:()=>false}),serverTimestamp:()=>123,setDoc:async(...args)=>writes.push(args)}});
 assert.equal(await api.addLikedSongToFirestore('owner',{...selected,id:'old-id'}),true);
 assert.equal(writes[0][0],'users/owner/likedSongs/youtube_abcdefghijk');assert.equal(writes[0][1].source,'youtube');assert.equal(writes[0][1].youtubeVideoId,'abcdefghijk');assert.equal(writes[0][1].audioUrl,'');
 assert.equal(writes[0][1].youtubeUrl,'https://music.youtube.com/watch?v=abcdefghijk');assert.equal('catalogUrl' in writes[0][1],false);
});

function repositoryFixture({failDelete=false,failUpdate=false}={}){
 const store=storeFixture();let listeners=[],deletes=[],updates=[],cache=[];
 const api=load('src/services/liked-songs/likedSongsRepository.ts',{
 '@/lib/accountScope':{getAccountScope:()=>({accountId:'owner'})},'@/lib/firebase':{db:{}},
 '@/lib/firestore':{addLikedSongToFirestore:async()=>true,removeLikedSongFromFirestore:async()=>assert.fail('mapped unlike must remove all identities')},
 '@/lib/logger':{logger:{warn(){},error(){}}},'@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async(...args)=>cache.push(args)},
 'firebase/firestore':{collection:(_, ...parts)=>parts.join('/'),onSnapshot:(ref,fn)=>{listeners.push(fn);return()=>{};},doc:(_, ...parts)=>parts.join('/'),
 writeBatch:()=>({delete:ref=>deletes.push(ref),update:(ref,value)=>updates.push([ref,value]),commit:async()=>{if(failDelete||failUpdate)throw Error('offline');}})},
 './likedSongFormat':format,'./likedSongsStore':{useLikedSongsStore:store}});
 const snapshot=records=>({forEach:fn=>records.forEach(([id,data])=>fn({id,data:()=>data}))});
 return{api,store,listeners,deletes,updates,cache,snapshot};
}
test('legacy likes without likedAt remain visible; realtime hydration preserves aliases and cache',async()=>{
 const f=repositoryFixture();f.api.subscribeLikedSongs('owner');
 f.listeners[0](f.snapshot([['saavn-old',{...legacy,addedAt:2,youtubeUrl:'https://music.youtube.com/watch?v=abcdefghijk'}],['another-old',{...legacy,title:'Other',addedAt:1}]]));
 assert.equal(f.store.getState().songs.length,2);assert.equal(f.store.getState().songs[0].id,selected.id);assert.equal(f.store.getState().ids.has('saavn-old'),true);
 const cached=JSON.parse(f.cache.at(-1)[1]);assert.deepEqual(cached[0].likedSongDocumentIds,['saavn-old']);
 f.api.cleanupLikedSongsSubscription();f.api.subscribeLikedSongs('owner');f.listeners[0](f.snapshot([['stale',{...legacy}]]));assert.equal(f.store.getState().songs.length,0);
});
test('unlike removes canonical and original documents, while failed writes restore both identities',async()=>{
 for(const failDelete of [false,true]){
  const f=repositoryFixture({failDelete});const song={...selected,likedSongDocumentIds:['saavn-old']};f.store.getState().setSongs([song]);
  const liked=await f.api.toggleLikeSong('owner',song);
  assert.deepEqual(new Set(f.deletes),new Set(['users/owner/likedSongs/saavn-old','users/owner/likedSongs/youtube_abcdefghijk']));
  assert.equal(liked,failDelete);assert.equal(f.store.getState().ids.has('saavn-old'),failDelete);assert.equal(f.store.getState().ids.has(selected.id),failDelete);
 }
});
test('selecting a saved-song match updates its YouTube URL and artwork while keeping every original like identity',async()=>{
 const f=repositoryFixture();const saved={...legacy,likedSongDocumentIds:['saavn-old']};const other={...legacy,id:'other-song',title:'Different song',likedSongDocumentIds:['other-song']};f.store.getState().setSongs([other,saved]);
 const match={...selected,title:'Chaleya (Official Audio)',artist:'Arijit Singh',duration:201};
 assert.equal(await f.api.replaceLikedSongYouTubeVersion('owner',saved,match),true);
 assert.deepEqual(JSON.parse(JSON.stringify(f.updates)),[['users/owner/likedSongs/saavn-old',{youtubeUrl:'https://music.youtube.com/watch?v=abcdefghijk',imageUrl:'new.jpg'}]]);
 const currentSongs=f.store.getState().songs;const current=currentSongs[1];assert.equal(current.id,'youtube_abcdefghijk');
 assert.equal(currentSongs.length,2);assert.equal(currentSongs[0].id,'other-song');
 assert.deepEqual([...current.likedSongDocumentIds],['saavn-old']);assert.equal(current.title,match.title);
 assert.equal(f.store.getState().ids.has('saavn-old'),true);
});
test('reselecting the same video refreshes stale saved artwork without changing its identity',async()=>{
 const f=repositoryFixture();const saved={...selected,coverUrl:'stale-art.jpg',likedSongDocumentIds:['saavn-old']};f.store.getState().setSongs([saved]);
 const match={...selected,coverUrl:'fresh-art.jpg'};
 assert.equal(await f.api.replaceLikedSongYouTubeVersion('owner',saved,match),true);
 assert.deepEqual(JSON.parse(JSON.stringify(f.updates)),[
  ['users/owner/likedSongs/youtube_abcdefghijk',{youtubeUrl:'https://music.youtube.com/watch?v=abcdefghijk',imageUrl:'fresh-art.jpg'}],
  ['users/owner/likedSongs/saavn-old',{youtubeUrl:'https://music.youtube.com/watch?v=abcdefghijk',imageUrl:'fresh-art.jpg'}],
 ]);
 assert.equal(f.store.getState().songs[0].id,'youtube_abcdefghijk');
 assert.equal(f.store.getState().songs[0].coverUrl,'fresh-art.jpg');
});
test('failed selected-version writes do not change the local liked-song projection',async()=>{
 const f=repositoryFixture({failUpdate:true});const saved={...legacy,likedSongDocumentIds:['saavn-old']};f.store.getState().setSongs([saved]);
 await assert.rejects(f.api.replaceLikedSongYouTubeVersion('owner',saved,selected));
 assert.equal(f.store.getState().songs[0].id,'saavn-old');assert.equal(f.updates.length,1);
});


test('ranking puts the best version first and refuses covers, duration mismatch and missing metadata for auto',()=>{
 const cover={...selected,title:'Chaleya Cover',artist:'Different Singer'};
 const close={...selected,id:'youtube_12345678901',youtubeVideoId:'12345678901',duration:203,album:''};
 const ranked=backfill.rankLikedSongVersions(legacy,[cover,close,selected]);
 assert.equal(ranked[0].song.id,selected.id);assert.equal(ranked[0].score,100);assert.equal(ranked[0].eligible,true);
 for(const changes of [{title:'Chaleya Remix'},{artist:'Someone Else'},{duration:376},{duration:0}])
  assert.equal(backfill.rankLikedSongVersions(legacy,[{...selected,...changes}])[0].eligible,false);
});


function adminFixture({exists=true,changed=false,record={...legacy,likedAt:42},retry=false}={}) {
 let data=record,writes=[];const ref={path:'users/owner/likedSongs/saavn-old'};
 const initial={ref,id:legacy.id,updateTime:{revision:1}};
 const db={runTransaction:async callback=>{
  const transaction={get:async()=>({ref,id:legacy.id,exists,data:()=>data,updateTime:{isEqual:()=>!changed}}),update:(reference,update)=>{writes.push(update);data={...data,...update};if(update.youtubeUrl===null)delete data.youtubeUrl;}};
  return callback(transaction);
 }};
 return{db,initial,writes,data:()=>data};
}
test('admin backfill adds just youtubeUrl and preserves every legacy field',async()=>{
 const f=adminFixture();const before=JSON.stringify(f.data());
 assert.equal(await backfill.applyUpdate(f.db,f.initial,selected,100,()=>123),'updated');
 assert.equal(JSON.stringify({...f.data(),youtubeUrl:undefined}),before);
 assert.deepEqual(Object.keys(f.writes[0]),['youtubeUrl']);
 assert.equal(f.data().likedAt,42);assert.equal(f.data().audioUrl,legacy.audioUrl);
 assert.equal(f.data().youtubeUrl,'https://music.youtube.com/watch?v=abcdefghijk');
 assert.equal(await backfill.applyUpdate(f.db,f.initial,selected,100,()=>456),'mapped');assert.equal(f.writes.length,1);
});
test('admin backfill never overwrites changed, deleted, unsupported or manually restored records',async()=>{
 for(const options of [{exists:false},{changed:true}]){const f=adminFixture(options);assert.notEqual(await backfill.applyUpdate(f.db,f.initial,selected,100,()=>123),'updated');assert.equal(f.writes.length,0);}
 for(const mapping of [{version:2},{version:1,song:format.youtubeLikedMetadata(selected),enabled:false}]) {
  const data={...legacy,playbackMapping:mapping};assert.notEqual(backfill.classify(legacy.id,data),'eligible');
  assert.throws(()=>backfill.buildUpdate(legacy.id,data,selected,100,123));
 }
 assert.throws(()=>backfill.buildUpdate(legacy.id,legacy,{...selected,title:'Chaleya Remix'},10,123));
});
test('admin rollback removes youtubeUrl and reveals the preserved JioSaavn song',async()=>{
 const f=adminFixture();await backfill.applyUpdate(f.db,f.initial,selected,100,()=>123);
 assert.equal(await backfill.restoreUpdate(f.db,f.initial.ref,()=>null),'restored');
 assert.equal(format.readLikedSong(legacy.id,f.data()).id,legacy.id);
 assert.equal(await backfill.restoreUpdate(f.db,f.initial.ref,()=>789),'unchanged');
});
test('LastWave identity deduplicates normalized title/artist while preserving both provider IDs',()=>{
 const merged=format.mergeLikedSongIdentities([{...legacy,title:'  Chaleya  ',artist:'Arijit  Singh, Shilpa Rao'},selected]);
 assert.equal(merged.length,1);assert.equal(merged[0].id,selected.id);
 assert.equal(format.mergeLikedSongIdentities([...merged,{...selected,title:'Chaleya Official Video'}]).length,1);
 assert.equal(format.likedSongDocumentIds(merged[0]).includes(legacy.id),true);
 const versions=format.mergeLikedSongIdentities([legacy,{...selected,title:'Chaleya Remix'}]);assert.equal(versions.length,2);
});
test('migration tools are absent from user screens and client has no all-user writes',()=>{
 const screen=fs.readFileSync('src/features/library/screens/LikedSongsScreen.tsx','utf8');
 assert.equal(screen.includes('LikedSongMigrationReview'),false);
 assert.equal(fs.existsSync('src/features/library/components/LikedSongMigrationReview.tsx'),false);
 assert.equal(fs.existsSync('src/services/liked-songs/likedSongMigration.ts'),false);
});


test('LastWave permanent URL identity restores YouTube likes without saved stream URLs',()=>{
 for(const url of ['https://music.youtube.com/watch?v=abcdefghijk','https://youtu.be/abcdefghijk','https://www.youtube.com/shorts/abcdefghijk']) {
  const song=format.readLikedSong('old-key',{title:'Chaleya',artist:'Singer',url,source:'mavrixfy'});
  assert.equal(song.id,'youtube_abcdefghijk');assert.equal(song.audioUrl,'');assert.equal(song.catalogUrl,'https://music.youtube.com/watch?v=abcdefghijk');
 }
 assert.equal(format.youtubeIdentity({...legacy,catalogUrl:'https://fakeyoutube.com/watch?v=abcdefghijk'}),null);
});
test('JioSaavn mapping eligibility requires a valid legacy playback URL',()=>{
 assert.equal(format.needsLikedSongMigration(legacy),true);
 assert.equal(format.needsLikedSongMigration({...legacy,audioUrl:''}),false);
 assert.equal(format.needsLikedSongMigration({...legacy,source:'gaana'}),false);
 assert.equal(format.needsLikedSongMigration({...legacy,source:'youtube',youtubeUrl:'https://music.youtube.com/watch?v=abcdefghijk'}),false);
 assert.equal(format.needsLikedSongMigration({...legacy,audioUrl:'not-a-url'}),false);
});
test('missing legacy duration can match exact title/artist but never a different artist',()=>{
 const unknown={...legacy,duration:0};assert.equal(backfill.classify(legacy.id,unknown),'eligible');
 assert.equal(backfill.rankLikedSongVersions(unknown,[selected])[0].eligible,true);
 assert.equal(backfill.rankLikedSongVersions(unknown,[{...selected,artist:'Different Artist'}])[0].eligible,false);
});
test('serialized heart mutations settle in tap order',async()=>{
 const f=repositoryFixture();const song={...selected,likedSongDocumentIds:[selected.id]};
 const first=f.api.toggleLikeSong('owner',song),second=f.api.toggleLikeSong('owner',song);
 assert.equal(await first,true);assert.equal(await second,false);assert.equal(f.store.getState().songs.length,0);
});


test('complete performer names can be a subset of original composer/lyricist credits',()=>{
 const original={...legacy,artist:'Shellee, Mame Khan, Amit Trivedi'};
 assert.equal(backfill.rankLikedSongVersions(original,[{...selected,artist:'Mame Khan, Amit Trivedi'}])[0].eligible,true);
 assert.equal(backfill.rankLikedSongVersions(original,[{...selected,artist:'Mame Unknown'}])[0].eligible,false);
});

test('backfill normalizes accents and featuring suffixes while retaining version and duration guards',()=>{
 const original={...legacy,title:'No Batidao (Reborn)',artist:'ZXKAI',duration:106};
 const reborn={...selected,title:'No Batidão [Reborn] (feat. ATLXS)',artist:'ZXKAI',duration:106};
 assert.equal(backfill.rankLikedSongVersions(original,[reborn])[0].eligible,true);
 assert.equal(backfill.rankLikedSongVersions(original,[{...reborn,title:'No Batidão (Ultra Slowed)'}])[0].eligible,false);
 assert.equal(backfill.rankLikedSongVersions(original,[{...reborn,duration:220}])[0].eligible,false);
});
