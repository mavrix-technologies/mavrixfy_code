# Testing Live Lyrics Feature - Quick Guide

## 🚀 Quick Start

### Prerequisites
1. **Backend Running:** Make sure YouTube Music backend is running
   ```bash
   cd youtube-music-api
   python main.py
   ```

2. **Backend URL Configured:** Check that your app has the backend URL set
   - Default: `http://localhost:8000/api`
   - Can be configured in app settings

### Test Steps

#### 1. Basic Functionality Test
1. Open Mavrixfy app
2. Search for "Kesariya" (popular Hindi song)
3. Play the song
4. Look for the **musical notes icon** 🎵 next to the heart icon
5. Tap the lyrics button
6. Verify:
   - ✅ Lyrics modal opens with blur background
   - ✅ Lyrics are displayed in Hindi
   - ✅ "Synced" badge shows if time-synced
   - ✅ Current line highlights in accent color
   - ✅ Auto-scrolls as song plays

#### 2. Interaction Test
1. **Scroll manually:** Swipe up/down in lyrics
2. **Seek in song:** Drag progress bar
   - Verify lyrics jump to correct position
3. **Play/Pause:** Toggle playback
   - Verify highlighting stops/resumes
4. **Close modal:** Tap X button
   - Verify smooth close animation

#### 3. Language Support Test

Try these songs to test different languages:

**Hindi Songs:**
- "Kesariya" - Brahmāstra
- "Apna Bana Le" - Bhediya
- "Tum Hi Ho" - Aashiqui 2

**English Songs:**
- "Shape of You" - Ed Sheeran
- "Blinding Lights" - The Weeknd

**Tamil Songs:**
- "Enjoy Enjaami"
- "Vaathi Coming"

**Punjabi Songs:**
- "Excuses" - AP Dhillon
- "Brown Munde"

#### 4. Error Handling Test

**Test No Lyrics:**
1. Play a song without lyrics
2. Tap lyrics button
3. Verify error message: "No lyrics available"

**Test Non-YouTube Song:**
1. Play a JioSaavn song
2. Verify lyrics button is **hidden**

**Test Network Error:**
1. Stop the backend
2. Try opening lyrics
3. Verify error message: "Failed to load lyrics"

#### 5. Performance Test

**Smooth Scrolling:**
1. Open lyrics on a long song (5+ minutes)
2. Let it auto-scroll
3. Verify 60fps smooth scrolling

**Memory Test:**
1. Open/close lyrics 10 times rapidly
2. Check for memory leaks
3. Verify app remains responsive

**Seeking Test:**
1. Rapidly seek through song
2. Verify lyrics update correctly
3. No lag or stuttering

## 🎯 Expected Behavior

### Visual Design
- **Background:** Dark blur overlay (opacity 95%)
- **Header:** White text, right-aligned close button
- **Synced Badge:** Green accent color with sync icon
- **Current Line:** 
  - Scale: 1.12x larger
  - Color: Accent color (from player theme)
  - Font weight: Bold (700)
  - Text shadow for depth
- **Past Lines:** 40% opacity, gray
- **Future Lines:** 60% opacity, white
- **Footer:** Small gray text with source attribution

### Animations
- **Modal open:** Fade in (300ms)
- **Active line:** Spring animation (scale + opacity)
- **Auto-scroll:** Smooth with easing
- **Line change:** Fade transition (200ms)

### Responsive Behavior
- **Short screens:** Compact spacing
- **Tall screens:** More padding
- **Landscape:** Adapts to width
- **Notch support:** Safe area insets

## 🐛 Common Issues

### Issue: Lyrics button not appearing
**Cause:** Song is not from YouTube Music
**Solution:** Only YouTube Music songs show lyrics button

### Issue: "No lyrics available" error
**Cause:** Song genuinely has no lyrics on YouTube Music
**Solution:** Try a different song

### Issue: Lyrics out of sync
**Cause:** Source data timing issue
**Solution:** Report to YouTube Music (not a client bug)

### Issue: Backend connection error
**Cause:** Backend not running or wrong URL
**Solution:** 
1. Start backend: `python youtube-music-api/main.py`
2. Check URL in app settings

### Issue: Hindi text not displaying
**Cause:** Font rendering issue (rare)
**Solution:** Device should support Unicode automatically

### Issue: Slow performance
**Cause:** Low-end device or many animations
**Solution:** Performance is optimized, but very old devices may struggle

## 📊 Testing Checklist

### UI/UX
- [ ] Lyrics button visible for YouTube songs
- [ ] Button hidden for non-YouTube songs
- [ ] Modal opens smoothly
- [ ] Modal closes smoothly
- [ ] Blur effect renders correctly
- [ ] Colors match player theme
- [ ] Typography is readable
- [ ] Spacing is consistent

### Functionality
- [ ] Lyrics fetch correctly
- [ ] Time-synced lyrics work
- [ ] Plain text lyrics work
- [ ] Auto-scroll follows playback
- [ ] Manual scroll works
- [ ] Seeking updates position
- [ ] Play/pause state handled
- [ ] Current line highlights

### Languages
- [ ] Hindi lyrics display correctly
- [ ] English lyrics display correctly
- [ ] Tamil lyrics display correctly
- [ ] Telugu lyrics display correctly
- [ ] Punjabi lyrics display correctly
- [ ] Mixed language lyrics work
- [ ] Special characters render
- [ ] Emoji in lyrics work

### Error Handling
- [ ] No lyrics message shows
- [ ] Network error handled
- [ ] Backend down handled
- [ ] Non-YouTube songs handled
- [ ] Loading state shows
- [ ] Error state shows

### Performance
- [ ] 60fps scrolling
- [ ] No memory leaks
- [ ] Fast modal open/close
- [ ] Smooth animations
- [ ] Responsive to input
- [ ] No jank or stuttering

### Edge Cases
- [ ] Very long songs (>10 min)
- [ ] Very short songs (<1 min)
- [ ] Songs with long lines
- [ ] Songs with special characters
- [ ] Rapid seeking
- [ ] Background/foreground
- [ ] Screen rotation
- [ ] Low battery mode

## 🎬 Demo Flow

### Perfect Demo Scenario:
1. **Start:** Open Mavrixfy to home screen
2. **Search:** Type "Kesariya" in search bar
3. **Play:** Tap first result to play
4. **Wait:** Let it play for 5-10 seconds
5. **Open Lyrics:** Tap musical notes icon
6. **Show Features:**
   - Point out "Synced" badge
   - Show auto-scrolling
   - Demonstrate seeking
   - Show current line highlight
7. **Try Hindi:** Point out Hindi text rendering perfectly
8. **Close:** Tap X button
9. **Try English:** Search for "Shape of You"
10. **Repeat:** Show it works for English too

### Recording Demo:
```bash
# Record screen while going through demo flow
# Show both Hindi and English songs
# Highlight key features:
# - Auto-scroll
# - Time-sync
# - Multilingual support
# - Smooth animations
```

## 📝 Test Report Template

```
## Lyrics Feature Test Report

**Date:** YYYY-MM-DD
**Tester:** [Name]
**Device:** [Device Model]
**OS:** [iOS/Android Version]
**App Version:** [Version]

### Test Results

| Feature | Status | Notes |
|---------|--------|-------|
| Button Visibility | ✅/❌ | |
| Modal Open/Close | ✅/❌ | |
| Lyrics Fetch | ✅/❌ | |
| Time Sync | ✅/❌ | |
| Auto-scroll | ✅/❌ | |
| Hindi Display | ✅/❌ | |
| English Display | ✅/❌ | |
| Error Handling | ✅/❌ | |
| Performance | ✅/❌ | |

### Issues Found
1. [Issue description]
2. [Issue description]

### Recommendations
1. [Recommendation]
2. [Recommendation]

### Overall Rating: ⭐⭐⭐⭐⭐ (X/5)
```

## 🎉 Success Criteria

The feature is ready for release if:

1. ✅ **Core Functionality Works:**
   - Lyrics fetch and display correctly
   - Time-sync works accurately
   - Auto-scroll is smooth

2. ✅ **Languages Supported:**
   - Hindi renders perfectly
   - English renders perfectly
   - At least 3 other Indian languages tested

3. ✅ **User Experience:**
   - Intuitive button placement
   - Smooth animations
   - Clear error messages
   - Easy to close

4. ✅ **Performance:**
   - 60fps scrolling
   - No memory leaks
   - Responsive on low-end devices

5. ✅ **Edge Cases:**
   - Handles errors gracefully
   - Works with various song lengths
   - Stable on repeated use

## 🔧 Developer Testing

### Quick Test Commands:

```bash
# Start backend
cd youtube-music-api
python main.py

# Check backend health
curl http://localhost:8000/api/healthz

# Test lyrics endpoint directly
curl http://localhost:8000/api/lyrics/video/VIDEO_ID

# Start app in dev mode
npm start
```

### Debug Logs to Check:

Look for these in console:
```
[LyricsService] Fetching lyrics from...
[LyricsService] Successfully fetched lyrics
[LiveLyrics] Lyrics loaded successfully
[LiveLyrics] Current line index: X
```

### Common Debug Commands:

```javascript
// In React DevTools console:

// Check if lyrics button should show
console.log(screenSongIsYouTube);

// Check current song
console.log(screenSong);

// Check lyrics state
console.log(showLyrics);

// Check video ID extraction
console.log(getYouTubeVideoIdFromSong(screenSong));
```

---

## 🎊 Ready to Test!

Follow the steps above and enjoy testing the new live lyrics feature. 

**Remember:** This feature makes Mavrixfy even more awesome for music lovers, especially for Hindi song fans! 🎵🇮🇳

Happy Testing! 🚀
