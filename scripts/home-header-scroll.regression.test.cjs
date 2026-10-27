const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadHeader() {
  const jsx = (type, props) => ({ type, props });
  const react = { memo: fn => fn, useCallback: fn => fn, useMemo: fn => fn() };
  const imports = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { Platform: { OS: "ios" }, View: "View", FlatList: "FlatList", StyleSheet: { create: value => value } },
    "react-native-reanimated": {
      __esModule: true,
      default: { View: "AnimatedView" },
      useAnimatedStyle: fn => fn(),
      useDerivedValue: fn => ({ value: fn() }),
    },
    "@/constants/colors": { __esModule: true, default: { background: "#0B0F14" } },
    "@/contexts/AuthContext": { useAuth: () => ({ user: null, isAuthenticated: false }) },
    "@/lib/colorExtractor": { colorWithAlpha: value => value },
    "@/lib/haptics": {},
    "expo-haptics": {},
    "expo-linear-gradient": { LinearGradient: "Gradient" },
    "expo-router": { useRouter: () => ({ push() {} }) },
    "../constants/homeNavConstants": { MAVRIXFY_MUSIC_CATEGORIES: [{ id: "All", label: "All" }], UNIFIED_HEADER_MENU_HEIGHT: 58, UNIFIED_HEADER_TOP_BAR_HEIGHT: 48 },
    "./CategoryTabItem": { CategoryTabItem: "CategoryTabItem" },
    "./HomeTopBarRow": { HomeTopBarRow: "HomeTopBarRow" },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/features/home/components/HomeUnifiedTopHeader.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected header import: ${name}`);
      return imports[name];
    },
  });
  return module.exports.HomeUnifiedTopHeader;
}

function children(tree) {
  return [tree?.props?.children].flat().filter(child => child && typeof child === "object");
}

function find(tree, type) {
  return tree.type === type ? tree : children(tree).map(child => find(child, type)).find(Boolean);
}

const Header = loadHeader();
function render(y, noticeHeight = 72, topInset = 47) {
  return Header({ topInset, scrollY: { value: y }, selectedCategory: "All", onSelectCategory() {},
    announcement: noticeHeight ? { type: "Notice", props: {} } : undefined, announcementHeight: noticeHeight });
}

test("notice scrolls away, categories dock below the safe area, and returning to top restores the header", () => {
  // Swipe down the feed, beyond the collapse limit, then back to the top and into iOS overscroll.
  for (const [y, expectedHeight, expectedTranslation] of [
    [0, 225, 0], [36, 189, -36], [72, 153, -72], [96, 129, -96],
    [120, 105, -120], [900, 105, -120], [36, 189, -36], [0, 225, 0], [-40, 225, 0],
  ]) {
    const tree = render(y);
    assert.equal(tree.props.style[1].height, expectedHeight, `header bounds at scroll ${y}`);
    const moving = children(tree).find(child => child.props.style?.transform);
    assert.equal(moving.props.style.transform[0].translateY, expectedTranslation || -0);
    // Category row starts after safe area + notice + branding in the moving stack.
    const categoryTop = 47 + 72 + 48 + expectedTranslation;
    assert.ok(categoryTop >= 47, "categories must never move behind the status bar");
    assert.equal(expectedHeight - categoryTop, 58, "category rail retains its full touch area");
  }
});

test("branding and category colors begin collapsing only after the notice leaves", () => {
  const before = render(36);
  assert.equal(find(before, "HomeTopBarRow").props.topBarAnimatedStyle.opacity, 1);
  assert.equal(find(before, "FlatList").props.renderItem({ item: { id: "All" }, index: 0 }).props.scrollY.value, 0);
  const after = render(96);
  assert.ok(find(after, "HomeTopBarRow").props.topBarAnimatedStyle.opacity < 1);
  assert.equal(find(after, "FlatList").props.renderItem({ item: { id: "All" }, index: 0 }).props.scrollY.value, 24);
});

test("disabled notices reserve no space; measured notices and varying device insets collapse completely", () => {
  for (const inset of [0, 24, 47, 59]) {
    for (const height of [0, 72, 115]) {
      assert.equal(render(0, height, inset).props.style[1].height, inset + height + 106);
      assert.equal(render(1000, height, inset).props.style[1].height, inset + 58);
    }
  }
});

test("timed entrance and dismissal reclaim header space at every intermediate animation height", () => {
  for (const height of [0, 18, 36, 54, 72, 54, 36, 18, 0]) {
    const tree = Header({ topInset: 47, scrollY: { value: 0 }, selectedCategory: "All", onSelectCategory() {},
      announcement: { type: "Notice", props: {} }, announcementHeight: { value: height } });
    assert.equal(tree.props.style[1].height, 47 + 106 + height);
    assert.equal(find(tree, "HomeTopBarRow").props.topBarAnimatedStyle.opacity, 1);
  }
});

function homeFixture(topInset, platform = "ios") {
  let cursor = 0, slots = [];
  const mode = { visible: false, online: true, hasContent: true, artists: undefined, cachedArtists: [], storedArtists: [],
    events: [], refreshCatalog: () => Promise.resolve() };
  const homeScrollRef = { current: null };
  const jsx = (type, props) => ({ type, props });
  const react = {
    memo: fn => fn,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => fn(),
  };
  const noop = () => {};
  const query = { data: undefined, refetch: async () => { mode.events.push("home"); } };
  const imports = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@tanstack/react-query": { useQuery: () => ({ ...query, data: mode.artists, refetch: async () => { mode.events.push("artists"); } }) },
    "@/data/providers/ArtistProvider": { getCachedFeaturedArtists: async () => mode.storedArtists,
      clearFeaturedArtistsCache: async () => { mode.events.push("clear-artists"); } },
    "@/constants/colors": { __esModule: true, default: { background: "#0B0F14" } },
    "@/components/AdMobBanner": {}, "@/components/OfflineBanner": {}, "@/components/OfflineScreen": {},
    "@/contexts/NetworkContext": { useNetwork: () => ({ isOnline: mode.online, isChecking: false }) },
    "@/contexts/PlayerContext": { usePlayerRowActions: () => ({ playSong: noop }) },
    "@/lib/homeScrollRef": { globalHomeScrollRef: homeScrollRef },
    "react-native": { Platform: { OS: platform }, View: "View", RefreshControl: "RefreshControl", StyleSheet: { create: value => value } },
    "react-native-reanimated": { __esModule: true, default: { FlatList: "Feed", View: "AnimatedView" },
      useAnimatedStyle: fn => fn(), useAnimatedScrollHandler: fn => fn,
      useSharedValue: initial => react.useRef({ value: initial }).current, withTiming: value => value },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: topInset, bottom: 0 }) },
    "@/data/providers/QuickPicksProvider": { getQuickPicksForCategory: () => [] },
    "@/lib/miniPlayerBannerConfig": {
      getCachedMiniPlayerBannerConfig: () => ({ enabled: true, items: [{ text: "Offer", linkUrl: "https://example.com" }] }),
      subscribeToMiniPlayerBannerConfig: () => noop,
    },
    "../components/HomeUnifiedTopHeader": { HomeUnifiedTopHeader: Header, UNIFIED_HEADER_TOTAL_HEIGHT: 106 },
    "../components/HomeAnnouncementBanner": { HomeAnnouncementBanner: "Notice" },
    "../hooks/useHomeAnnouncement": { useHomeAnnouncement: () => ({ visible: mode.visible, dismiss: () => { mode.visible = false; } }) },
    "../hooks/useFestivalTheme": { useFestivalTheme: () => undefined },
    "../hooks/useHomeFeedData": { useHomeFeedData: () => ({ hasContent: mode.hasContent, quickPicksPool: [], featuredArtists: mode.cachedArtists,
      handleRefresh: () => { mode.events.push("catalog"); return mode.refreshCatalog(); } }) },
    "../hooks/useYouTubeHomeFeed": { useYouTubeHomeFeed: () => ({ ...query, explore: { ...query, refetch: async () => { mode.events.push("explore"); } } }) },
    "../hooks/useAppShowcasePrompt": { useAppShowcasePrompt: noop },
    "../hooks/useHomeSectionData": { useHomeSectionData: () => [] },
    "../hooks/buildHomeSections": { buildHomeSections: () => [] },
    "@/components/AppShowcaseModal": {}, "@/services/youtube/YouTubeMusic": { clearYouTubeHomeCache: () => { mode.events.push("clear"); } },
  };
  // These children do not participate in header measurement in this fixture.
  for (const name of ["FestivalHeaderBanner", "HomeAmbientBackdrop", "HomeArtistsSection", "HomeHorizontalSection", "homeDisplayText", "HomeQuickPicks", "HomeRecentlyPlayed", "HomeSkeletons", "HomeYouTubeContent"])
    imports[`../components/${name}`] = {};
  imports['../components/HomeArtistsSection'] = {HomeArtistsSection:'Artists'};
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/features/home/screens/HomeScreen.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (!(name in imports)) throw new Error(`Unexpected Home import: ${name}`);
    return imports[name];
  } });
  return { mode, homeScrollRef, render() { cursor = 0; return module.exports.HomeScreen(); } };
}

test("Home closes both the banner clip and feed spacer fully without painting a black status-bar block", () => {
  const f = homeFixture(47);
  let home = f.render(), header = find(home, Header);
  const measure = find(header.props.announcement, "View").props.onLayout;
  measure({ nativeEvent: { layout: { height: 84 } } });
  f.mode.visible = true;
  home = f.render(); header = find(home, Header);
  assert.equal(header.props.announcement.props.style[1].height, 84);
  assert.equal(Header(header.props).props.style[1].height, 47 + 106 + 84);
  find(header.props.announcement, "Notice").props.onDismiss();
  home = f.render(); header = find(home, Header);
  assert.equal(header.props.announcement.props.style[1].height, 0, "closed banner must retain no safe-area wrapper height");
  assert.equal(find(home, "Feed").props.ListHeaderComponent.props.children[0].props.style.height, 0);
  const closedHeader = Header(header.props);
  assert.equal(closedHeader.props.style[1].height, 47 + 106);
  assert.equal(children(closedHeader).at(-1).props.style[2].opacity, 0, "dismissal must reveal the normal ambient backdrop");
});

test("measured compact and wrapped messages resize Home without subtracting or duplicating safe-area space", () => {
  for (const inset of [0, 47, 59]) {
    const f = homeFixture(inset);
    for (const contentHeight of [52, 84, 160, 248, 52]) {
      let home = f.render(), header = find(home, Header);
      find(header.props.announcement, "View").props.onLayout({ nativeEvent: { layout: { height: contentHeight } } });
      f.mode.visible = true;
      home = f.render(); header = find(home, Header);
      assert.equal(header.props.announcement.props.style[1].height, contentHeight);
      assert.equal(Header(header.props).props.style[1].height, inset + 106 + contentHeight);
      const feed = find(home, "Feed");
      assert.equal(feed.props.contentContainerStyle[1].paddingTop + feed.props.ListHeaderComponent.props.children[0].props.style.height,
        inset + 106 + contentHeight, "feed and visible header must agree on content height");
    }
  }
});

test("Home list connects tab scroll-to-top and category changes to the same live list", () => {
  const f = homeFixture(47), calls = [];
  let home = f.render();
  const list = { scrollToOffset: value => calls.push(value) };
  find(home, "Feed").props.ref(list);
  assert.equal(f.homeScrollRef.current, list);
  find(home, Header).props.onSelectCategory("Albums");
  home = f.render();
  assert.equal(find(home, Header).props.selectedCategory, "Albums");
  assert.deepEqual({ ...calls[0] }, { offset: 0, animated: false });
  find(home, Header).props.onSelectCategory("Albums");
  assert.equal(calls.length, 1, "selecting the current category leaves scrolling alone");
  f.homeScrollRef.current.scrollToOffset({ offset: 0, animated: true });
  assert.equal(calls.length, 2);
  find(home, "Feed").props.ref(null);
  assert.equal(f.homeScrollRef.current, null);
});

test("pull-to-refresh loads feeds concurrently and coalesces repeated pulls", async () => {
  const f = homeFixture(47);
  let finishCatalog;
  f.mode.refreshCatalog = () => new Promise(resolve => { finishCatalog = resolve; });
  const refresh = find(f.render(), "Feed").props.refreshControl.props.onRefresh;
  const first = refresh(), repeated = refresh();
  assert.deepEqual(f.mode.events, ["clear", "catalog", "clear-artists", "home", "explore"], "all independent feeds start while catalog refresh is pending");
  assert.equal(find(f.render(), "Feed").props.refreshControl.props.refreshing, true);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.mode.events.at(-1), "artists", "artists refresh without waiting for the catalog");
  finishCatalog(); await Promise.all([first, repeated]);
  assert.deepEqual(f.mode.events, ["clear", "catalog", "clear-artists", "home", "explore", "artists"]);
  assert.equal(find(f.render(), "Feed").props.refreshControl.props.refreshing, false);
});

test("a catalog refresh failure does not block artist refresh or leave the spinner running", async () => {
  const f = homeFixture(47);
  f.mode.refreshCatalog = async () => { throw Error('Catalog offline'); };
  await find(f.render(), "Feed").props.refreshControl.props.onRefresh();
  assert.equal(f.mode.events.includes('artists'), true);
  assert.equal(find(f.render(), "Feed").props.refreshControl.props.refreshing, false);
});

test("web refresh skips disabled native queries and offline pull does no work", async () => {
  const f = homeFixture(0, "web");
  await find(f.render(), "Feed").props.refreshControl.props.onRefresh();
  assert.deepEqual(f.mode.events, ["catalog"]);
  f.mode.online = false;
  await find(f.render(), "Feed").props.refreshControl.props.onRefresh();
  assert.deepEqual(f.mode.events, ["catalog"]);
});

test("Home renders artist profiles and preserves saved cards when fresh discovery returns empty", () => {
  const f = homeFixture(47);
  const saved = [{id:'youtube_artist_saved',name:'Saved',image:[]}];
  f.mode.cachedArtists = saved; f.mode.artists = [];
  const row = find(f.render(),'Feed').props.renderItem({item:{id:'artists',type:'artists'}});
  const artists = row.type(row.props);
  assert.equal(artists.type,'Artists');
  assert.equal(artists.props.artists,saved);
});

test("offline Home uses disk-cached profiles instead of hiding them behind the offline screen", async () => {
  const f = homeFixture(47);
  f.mode.online = false; f.mode.hasContent = false;
  f.mode.storedArtists = [{id:'youtube_artist_saved',name:'Saved',image:[]}];
  f.render(); await Promise.resolve();
  const feed = find(f.render(),'Feed');
  assert.ok(feed);
  const row = feed.props.renderItem({item:{id:'artists',type:'artists'}});
  assert.equal(row.type(row.props).props.artists,f.mode.storedArtists);
  assert.equal(f.mode.events.length,0);
});
