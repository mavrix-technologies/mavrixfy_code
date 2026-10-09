const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
function load(file, deps={}) {
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,require:name=>{if(!(name in deps))throw Error(name);return deps[name];}});return module.exports;
}
const config=load('src/services/audio/equalizerConfig.ts');
const { fixture: playerFixture, tracks } = require('./helpers/audio-player-fixture.cjs');
test('LastWave curves use 15 ISO bands and ±8dB validated migration',()=>{
 assert.equal(config.EQ_FREQUENCIES_HZ.length,15);assert.equal(config.EQ_Q,Math.SQRT2);
 for(const preset of config.EQUALIZER_PRESETS){assert.equal(Object.keys(preset.bands).length,15);assert.equal(config.detectMatchingPreset(preset.bands),preset.id);}
 const migrated=config.normalizeEqualizer({'60Hz':4,'150Hz':-3,'400Hz':1,'1KHz':2,'2.4KHz':3,'15KHz':6});
 assert.equal(migrated['63Hz'],4);assert.equal(migrated['16000Hz'],6);
 const safe=config.normalizeEqualizer({'25Hz':Infinity,'40Hz':100,'63Hz':-100});assert.equal(safe['25Hz'],0);assert.equal(safe['40Hz'],8);assert.equal(safe['63Hz'],-8);
 assert.equal(Object.values(config.normalizeEqualizer(null)).every(v=>v===0),true);
});

for (const platform of ['ios', 'android']) test(`${platform}: disabled/flat EQ bypasses filters, enabled EQ retains safe headroom and system ducking`, async () => {
 const dsp = load('src/services/audio/equalizerDsp.ts', { './equalizerConfig': config });
 const f = playerFixture({ platform, headroomDb: dsp.calculateEqHeadroomDb });
 await f.StandardAudioPlayer.setupPlayer();
 await f.StandardAudioPlayer.setQueue(tracks);
 const audio = f.StandardAudioRenderer().props;
 audio.ref({ pause() {}, play() {}, seekToTime() {} });
 audio.onLoad();
 const source = f.graph.sources[0], gain = f.graph.gains[0], filters = f.graph.filters;
 assert.deepEqual([...source.connections], [f.graph.destination]);
 assert.equal(gain.connections.size, 0, 'unused effects are disconnected from the render graph');
 assert.equal(filters.at(-1).connections.size, 0);
 assert.equal(audio.volume, 1);
 assert.equal(audio.playbackRate, 1);
 assert.equal(audio.preservesPitch, false);
 f.setStandardEqualizer(Array(15).fill(0), true);
 assert.deepEqual([...source.connections], [f.graph.destination]);
 const gains = Array(15).fill(8);
 f.setStandardEqualizer(gains, true);
 assert.deepEqual([...source.connections], [filters[0]]);
 assert.equal(gain.connections.has(f.graph.destination), true);
 assert.ok(gain.gain.value > 0 && gain.gain.value < 1, 'intentional EQ boost receives headroom against clipping');
 assert.equal(filters[0].gain.value, 8);
 f.setStandardEqualizer(gains, false);
 assert.deepEqual([...source.connections], [f.graph.destination]);
 assert.equal(gain.connections.size, 0);
 assert.equal(filters[0].gain.value, 0);
 f.system.get('duck')();
 assert.deepEqual([...source.connections], [gain]);
 assert.equal(gain.gain.value, 0.2);
 await f.StandardAudioPlayer.pause();
 assert.deepEqual([...source.connections], [f.graph.destination]);
 assert.equal(gain.connections.size, 0);
});
test('combined-response headroom is finite and bands above sample rate limit are skipped',()=>{
 const dsp=load('src/services/audio/equalizerDsp.ts',{'./equalizerConfig':config});
 assert.equal(dsp.calculateEqHeadroomDb(Array(15).fill(0),48000),0);
 assert.ok(dsp.calculateEqHeadroomDb(Array(15).fill(8),48000)>8);
 const gains=Array(15).fill(0);gains[14]=8;assert.equal(dsp.calculateEqHeadroomDb(gains,22050),0);
});
for(const os of ['ios','android'])test(`${os}: preset commits atomically, stale restore cannot overwrite preview, Expo Go only persists`,async()=>{
 let expoGo=false, restore;const calls=[],saved=[];
 const api=load('src/services/audio/audioEqualizer.ts',{
 'react-native':{Platform:{OS:os}},expo:{isRunningInExpoGo:()=>expoGo},
 '@/lib/storage':{getSettings:()=>new Promise(resolve=>restore=resolve),saveSettings:async value=>saved.push(value)},
 '@/lib/logger':{logger:{warn(){}}},'./StandardAudioPlayer':{setStandardEqualizer:(...args)=>calls.push(args),getStandardAudioEffects:()=>({equalizerAvailable:true})},'./equalizerConfig':config});
 const pending=api.syncEqualizerWithNative();const next={equalizer:config.EQUALIZER_PRESETS[1].bands,equalizerEnabled:true};
 api.previewEqualizer(next);restore({equalizer:config.FLAT_EQUALIZER,equalizerEnabled:false});await pending;assert.equal(calls.length,1);
 await api.saveEqualizer(next);assert.equal(calls.at(-1)[0].length,15);assert.equal(calls.at(-1)[1],true);assert.equal(saved[0].equalizerEnabled,true);
 expoGo=true;const before=calls.length;await api.saveEqualizer(next);assert.equal(calls.length,before);assert.equal(saved.length,2);
});
