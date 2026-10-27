const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const routes=[];
  const jsx=(type,props)=>({type,props});
  const imports={
    react:{memo:fn=>fn,useCallback:fn=>fn},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{View:'View',Text:'Text',FlatList:'List',Pressable:'Button',StyleSheet:{create:styles=>styles}},
    'expo-image':{Image:'Image'},
    'expo-router':{useRouter:()=>({push:route=>routes.push(route)})},
    'expo-haptics':{ImpactFeedbackStyle:{Light:'light'}},
    '@expo/vector-icons/Ionicons':{__esModule:true,default:'Icon'},
    '@/constants/colors':{__esModule:true,default:{primary:'#fff'}},
    '@/lib/haptics':{triggerImpact:async()=>{}},
    '@/lib/musicData':{getBestImageUrl:images=>images[0]?.url||''},
    '@/lib/artworkDisplay':{displayArtworkUrl:url=>url},
  };
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/home/components/HomeArtistsSection.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
  }).outputText,{module,exports:module.exports,require:name=>{
    if (!(name in imports)) throw Error(name); return imports[name];
  }});
  return {render:module.exports.HomeArtistsSection,routes};
}
function find(node,type) {
  if (node?.type===type) return node;
  return [node?.props?.children].flat().filter(Boolean).map(child=>find(child,type)).find(Boolean);
}

test('Home artist cards open the selected profile with the matching image and channel identity',()=>{
  const f=fixture();
  const artist={id:'youtube_artist_UC'+'a'.repeat(22),name:'Artist',image:[{url:'https://image.example/artist.jpg'}]};
  const tree=f.render({artists:[artist]});
  const item=find(tree,'List').props.renderItem({item:artist});
  const button=item.type(item.props);
  assert.equal(button.props.accessibilityLabel,'Open Artist artist profile');
  assert.equal(find(button,'Image').props.recyclingKey,artist.id);
  assert.equal(find(button,'Image').props.source.uri,artist.image[0].url);
  button.props.onPress();
  assert.equal(f.routes[0].pathname,'/artist/[id]');
  assert.equal(f.routes[0].params.id,artist.id);
  assert.equal(f.routes[0].params.image,artist.image[0].url);
  find(tree,'Button').props.onPress();
  assert.equal(f.routes[1],'/artists');
});

test('empty artist discovery does not leave a blank shelf on Home',()=>{
  assert.equal(fixture().render({artists:[]}),null);
});
