# Performance Test Checklist

## Pre-Test Setup
- [ ] Clear app cache and restart app
- [ ] Enable React DevTools profiler (if testing in dev)
- [ ] Monitor device temperature (should not overheat)
- [ ] Check available RAM before testing

## Test 1: Playlist Loading & Scrolling

### YouTube Music Playlist (100+ songs)
- [ ] Open a large YouTube Music playlist (100+ songs)
- [ ] **Expected**: Loads in < 2 seconds
- [ ] **Expected**: Images load progressively with blurhash placeholders
- [ ] Scroll quickly through the playlist
- [ ] **Expected**: Smooth 60fps scrolling, no frame drops
- [ ] **Expected**: Off-screen rows are clipped (memory efficient)
- [ ] Jump to middle of playlist (scroll position 50%)
- [ ] **Expected**: Items render instantly, no blank spaces
- [ ] Pull to refresh
- [ ] **Expected**: Cached data shows immediately, then updates

### JioSaavn Playlist (50+ songs)
- [ ] Open a large JioSaavn playlist
- [ ] **Expected**: Similar performance to YouTube Music
- [ ] Scroll to bottom quickly
- [ ] **Expected**: No stuttering, smooth animation

### Local/Firestore Playlist
- [ ] Open a saved playlist with 30+ songs
- [ ] **Expected**: Instant load from local storage
- [ ] Add/remove songs
- [ ] **Expected**: UI updates without full re-render

## Test 2: Queue Performance

### Queue Rendering
- [ ] Add 50+ songs to queue
- [ ] Open player and swipe to queue tab
- [ ] **Expected**: Queue renders in < 1 second
- [ ] Scroll through queue rapidly
- [ ] **Expected**: Smooth scrolling, current song highlighted
- [ ] Skip to different songs in queue
- [ ] **Expected**: Current song indicator updates instantly

### Queue Operations
- [ ] Add song to queue while playing
- [ ] **Expected**: No playback interruption, instant visual feedback
- [ ] Remove songs from queue
- [ ] **Expected**: Smooth animations, no jank
- [ ] Shuffle queue with 100+ songs
- [ ] **Expected**: Completes in < 500ms

## Test 3: Home Screen Performance

### Initial Load
- [ ] Fresh app launch
- [ ] **Expected**: Home screen content appears in < 3 seconds
- [ ] **Expected**: Skeleton loaders show immediately
- [ ] **Expected**: Sections load progressively (not all at once)

### Scrolling
- [ ] Scroll through entire home feed
- [ ] **Expected**: Smooth scrolling with nested horizontal lists
- [ ] **Expected**: Videos pause when scrolled off-screen
- [ ] Scroll back up quickly
- [ ] **Expected**: Content is cached, no re-render flash

### Section Interactions
- [ ] Scroll horizontal playlist sections
- [ ] **Expected**: Smooth horizontal scrolling
- [ ] **Expected**: Minimal overdraw, good performance
- [ ] Play song from home screen
- [ ] **Expected**: Immediate feedback, song starts < 2s

## Test 4: Song Row Performance

### Visual Updates
- [ ] Play a song from a long playlist
- [ ] **Expected**: Playing indicator appears instantly
- [ ] **Expected**: Equalizer animation is smooth
- [ ] Skip to next song
- [ ] **Expected**: Previous song indicator disappears, new one appears
- [ ] **Expected**: No unnecessary re-renders of other rows

### Interactions
- [ ] Swipe song row to add to queue
- [ ] **Expected**: Smooth swipe gesture, haptic feedback
- [ ] **Expected**: Toast appears, row closes smoothly
- [ ] Long press for options
- [ ] **Expected**: Options modal opens instantly
- [ ] Rapid taps on multiple songs
- [ ] **Expected**: No duplicate actions, debounced properly

## Test 5: YouTube Music Integration

### Search & Results
- [ ] Search for "trending 2024"
- [ ] **Expected**: Results appear in < 2 seconds
- [ ] Switch between Songs/Albums/Playlists tabs
- [ ] **Expected**: Tab switches are instant, data cached

### Playlist Details
- [ ] Open YouTube Music playlist
- [ ] **Expected**: Header shows immediately with prefilled data
- [ ] **Expected**: Songs load progressively, not blocking UI
- [ ] Scroll while songs are still loading
- [ ] **Expected**: Scrolling is not blocked by loading state

### Caching
- [ ] Open same YouTube playlist twice
- [ ] **Expected**: Second open is instant from cache
- [ ] Wait 2+ hours and reopen
- [ ] **Expected**: Cache expired, fetches fresh data
- [ ] Turn on Airplane mode
- [ ] **Expected**: Cached playlists still accessible

## Test 6: Memory & Resource Usage

### Memory Monitoring
- [ ] Open DevTools memory profiler
- [ ] Navigate through 10+ playlists
- [ ] **Expected**: Memory usage stays < 200MB
- [ ] **Expected**: No memory leaks (heap size doesn't grow)
- [ ] Return to home screen
- [ ] **Expected**: Memory is released properly

### Battery Usage
- [ ] Play music for 30 minutes
- [ ] Monitor battery drain
- [ ] **Expected**: < 10% battery consumption
- [ ] Background playback
- [ ] **Expected**: Efficient power usage, no wake locks

### Network Usage
- [ ] Monitor network requests in Charles/Proxyman
- [ ] Open cached playlist
- [ ] **Expected**: Zero network requests for cached data
- [ ] Open new playlist
- [ ] **Expected**: Single request, no retry storms
- [ ] **Expected**: Requests timeout after 30s

## Test 7: Edge Cases

### Large Playlists (200+ songs)
- [ ] Load playlist with 200+ songs
- [ ] **Expected**: Loads without crash or freeze
- [ ] **Expected**: Memory usage remains reasonable
- [ ] Scroll to position 150
- [ ] **Expected**: Smooth scrolling, no lag

### Slow Network
- [ ] Throttle network to 3G
- [ ] Open YouTube playlist
- [ ] **Expected**: Loading state shown, no timeout errors
- [ ] **Expected**: Graceful fallback if request fails

### Offline Mode
- [ ] Turn off internet
- [ ] Open previously cached playlist
- [ ] **Expected**: Works perfectly from cache
- [ ] Try to open new playlist
- [ ] **Expected**: Clear offline message, no crash

### Quick Navigation
- [ ] Rapidly tap between playlists
- [ ] **Expected**: No race conditions, always shows correct data
- [ ] **Expected**: Pending requests are cancelled
- [ ] Navigate back before load completes
- [ ] **Expected**: No crash, cleanup handled properly

## Performance Metrics Goals

### Load Times
- Playlist initial render: < 1s
- Full playlist load (100 songs): < 2s
- Home screen initial load: < 3s
- Player screen open: < 500ms

### Frame Rate
- Playlist scrolling: 60fps (16.67ms per frame)
- Queue scrolling: 60fps
- Home screen scrolling: 55-60fps (nested scrolling acceptable)
- Animations: 60fps

### Memory Usage
- Idle app: < 100MB
- Playing with large queue: < 200MB
- After 1 hour usage: < 250MB
- No memory leaks over time

### Network Efficiency
- Cache hit rate: > 80% for repeated access
- Concurrent requests: < 3 simultaneous
- Request timeout: 30s
- Retry attempts: Max 3 with exponential backoff

## Known Limitations

1. **First load**: Always slower due to cold cache
2. **Large images**: May take time on slow networks
3. **Video playback**: YouTube videos add overhead
4. **Background processing**: Some operations deferred for performance

## Regression Tests

After any code changes, re-run:
- [ ] Test 1 (Playlist loading)
- [ ] Test 2 (Queue performance)
- [ ] Test 6 (Memory usage)

## Success Criteria

✅ **Pass**: All tests meet expected performance
⚠️ **Warning**: 1-2 tests slightly below target (investigate)
❌ **Fail**: 3+ tests fail or major regression

## Reporting Issues

When reporting performance issues, include:
1. Device model and OS version
2. App version
3. Specific test case that failed
4. Screenshots/videos of the issue
5. Memory/CPU profiler snapshots if available
