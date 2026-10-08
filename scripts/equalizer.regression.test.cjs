const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
function load(file, deps={}) {
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,require:name=>{if(!(name in deps))throw Error(name);return deps[name];}});return module.exports;
}
const config=load('src/services/audio/equalizerConfig.ts');
test('LastWave curves use 15 ISO bands and ±8dB validated migration',()=>{
 assert.equal(config.EQ_FREQUENCIES_HZ.length,15);assert.equal(config.EQ_Q,Math.SQRT2);
 for(const preset of config.EQUALIZER_PRESETS){assert.equal(Object.keys(preset.bands).length,15);assert.equal(config.detectMatchingPreset(preset.bands),preset.id);}
 const migrated=config.normalizeEqualizer({'60Hz':4,'150Hz':-3,'400Hz':1,'1KHz':2,'2.4KHz':3,'15KHz':6});
 assert.equal(migrated['63Hz'],4);assert.equal(migrated['16000Hz'],6);
 const safe=config.normalizeEqualizer({'25Hz':Infinity,'40Hz':100,'63Hz':-100});assert.equal(safe['25Hz'],0);assert.equal(safe['40Hz'],8);assert.equal(safe['63Hz'],-8);
 assert.equal(Object.values(config.normalizeEqualizer(null)).every(v=>v===0),true);
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
