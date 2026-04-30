# 📐 Banner Layouts Guide

## ✅ Implementation Complete

The PromotionBanner component now supports 4 different layout types that can be set from the admin panel.

---

## 🎨 Available Layouts

### 1. Hero Banner (Default for Important Promotions)
**Dimensions:** Full width - 32px padding × 180px height
**Border Radius:** 16px
**Best For:** 
- Major announcements
- New album releases
- Featured content
- High-priority promotions

**Visual Style:**
- Largest size
- Prominent shadow
- More padding
- Bigger text (22px title, 14px description)

**Example Use:**
```
Priority: 90-100
Title: "New Album: Summer Vibes 2026"
Description: "Check out the hottest tracks of the season"
```

---

### 2. Card (Default Layout)
**Dimensions:** Full width - 32px padding × 140px height
**Border Radius:** 12px
**Best For:**
- Regular promotions
- Song of the day
- Playlist features
- Standard announcements

**Visual Style:**
- Medium size
- Standard shadow
- Normal padding
- Standard text (18px title, 13px description)

**Example Use:**
```
Priority: 70-89
Title: "Trending Playlist"
Description: "This week's top hits"
```

---

### 3. Full Width (Edge-to-Edge)
**Dimensions:** Full screen width × 120px height
**Border Radius:** 0px (no rounded corners)
**Best For:**
- Breaking news
- System announcements
- App-wide messages
- Urgent notifications

**Visual Style:**
- Edge-to-edge (no side padding)
- Compact height
- No border radius
- Standard text

**Example Use:**
```
Priority: 95-100
Title: "New Features Available!"
Description: "Update now to get the latest features"
```

---

### 4. Sidebar (Compact Vertical)
**Dimensions:** Half width - 48px padding × 200px height
**Border Radius:** 12px
**Best For:**
- Secondary content
- Quick links
- Artist spotlights
- Compact promotions

**Visual Style:**
- Half width (can show 2 side-by-side)
- Taller aspect ratio (vertical)
- Smaller text (16px title, 12px description)
- More lines (3 lines each)

**Example Use:**
```
Priority: 50-69
Title: "Featured Artist"
Description: "Discover their top tracks and albums"
```

---

## 📊 Layout Comparison

| Layout | Width | Height | Radius | Text Size | Best Priority |
|--------|-------|--------|--------|-----------|---------------|
| **Hero** | Full - 32px | 180px | 16px | Large (22/14) | 90-100 |
| **Card** | Full - 32px | 140px | 12px | Medium (18/13) | 70-89 |
| **Full Width** | Full | 120px | 0px | Medium (18/13) | 95-100 |
| **Sidebar** | Half - 48px | 200px | 12px | Small (16/12) | 50-69 |

---

## 🎯 How to Use in Admin Panel

### Creating a Hero Banner
1. Go to Dashboard → Promotions
2. Click "Create Promotion"
3. Fill in details
4. **Banner Layout:** Select "Hero Banner"
5. Upload large, high-quality image (1200x400px recommended)
6. Set Priority: 90-100
7. Save

### Creating a Card Banner
1. Create promotion
2. **Banner Layout:** Select "Card"
3. Upload standard image (600x400px recommended)
4. Set Priority: 70-89
5. Save

### Creating a Full Width Banner
1. Create promotion
2. **Banner Layout:** Select "Full Width"
3. Upload wide image (1920x300px recommended)
4. Set Priority: 95-100 (for important messages)
5. Save

### Creating a Sidebar Banner
1. Create promotion
2. **Banner Layout:** Select "Sidebar"
3. Upload vertical image (300x400px recommended)
4. Set Priority: 50-69
5. Save

---

## 📱 Mobile App Display

### How Layouts Appear

#### Hero Banner
```
┌─────────────────────────────────────┐
│                                     │
│         [Large Banner Image]        │
│                                     │
│  Large Title Text (22px)            │
│  Description text (14px)            │
│                                     │
└─────────────────────────────────────┘
        ● ○ ○ (dots if multiple)
```

#### Card Banner
```
┌─────────────────────────────────────┐
│                                     │
│      [Medium Banner Image]          │
│                                     │
│  Title Text (18px)                  │
│  Description (13px)                 │
└─────────────────────────────────────┘
        ● ○ ○
```

#### Full Width Banner
```
┌─────────────────────────────────────┐
│    [Full Width Banner Image]        │
│  Title Text (18px)                  │
│  Description (13px)                 │
└─────────────────────────────────────┘
        ● ○ ○
```

#### Sidebar Banner
```
┌──────────────────┐
│                  │
│  [Tall Image]    │
│                  │
│                  │
│  Title (16px)    │
│  Description     │
│  (12px)          │
│                  │
└──────────────────┘
```

---

## 🎨 Design Recommendations

### Image Dimensions

| Layout | Recommended Size | Aspect Ratio | Format |
|--------|------------------|--------------|--------|
| Hero | 1200 × 400px | 3:1 | JPG/PNG |
| Card | 600 × 400px | 3:2 | JPG/PNG |
| Full Width | 1920 × 300px | 6.4:1 | JPG/PNG |
| Sidebar | 300 × 400px | 3:4 | JPG/PNG |

### Text Guidelines

| Layout | Title Length | Description Length |
|--------|--------------|-------------------|
| Hero | 40-50 chars | 80-100 chars |
| Card | 30-40 chars | 60-80 chars |
| Full Width | 30-40 chars | 50-70 chars |
| Sidebar | 20-30 chars | 40-60 chars |

### Color Contrast
- Ensure text is readable over images
- Use gradient overlay for better readability
- Test on both light and dark images

---

## 🔄 Auto-Rotation

All layouts support auto-rotation:
- Rotates every 8 seconds
- Dots indicator shows position
- Manual switching with dots
- Pauses when app in background

---

## 🎯 Priority & Layout Combinations

### High Priority (90-100)
**Recommended Layouts:**
- Hero Banner (most prominent)
- Full Width (urgent messages)

**Example:**
```
Title: "New Album Release"
Layout: Hero
Priority: 95
Action: Play Song
```

### Medium Priority (70-89)
**Recommended Layouts:**
- Card (standard)
- Hero (if very important)

**Example:**
```
Title: "Trending Playlist"
Layout: Card
Priority: 80
Action: Open Playlist
```

### Low Priority (50-69)
**Recommended Layouts:**
- Card (standard)
- Sidebar (compact)

**Example:**
```
Title: "Featured Artist"
Layout: Sidebar
Priority: 60
Action: View Artist
```

---

## 🧪 Testing Layouts

### Test Each Layout
1. Create 4 promotions, one for each layout
2. Set different priorities
3. Open app
4. Verify each layout displays correctly
5. Check text sizing
6. Check image scaling
7. Test click actions

### Expected Results
- ✅ Hero: Largest, most prominent
- ✅ Card: Standard size, good balance
- ✅ Full Width: Edge-to-edge, compact
- ✅ Sidebar: Half width, vertical

---

## 💡 Best Practices

### Do's ✅
- Use Hero for most important content
- Use Card for regular promotions
- Use Full Width for urgent messages
- Use Sidebar for secondary content
- Match image size to layout
- Keep text concise
- Test on different screen sizes

### Don'ts ❌
- Don't use Hero for everything
- Don't use tiny images for Hero
- Don't use wide images for Sidebar
- Don't exceed text length limits
- Don't forget to set priority
- Don't use low-contrast images

---

## 🐛 Troubleshooting

### Layout Not Showing Correctly
**Issue:** Banner appears wrong size

**Solutions:**
1. Check `layout` field in Firestore
2. Verify it's one of: 'hero', 'card', 'full-width', 'sidebar'
3. Check image dimensions match layout
4. Clear app cache and reload

### Text Cut Off
**Issue:** Title or description truncated

**Solutions:**
1. Reduce text length
2. Use shorter words
3. Check character limits for layout
4. Consider different layout

### Image Stretched
**Issue:** Image looks distorted

**Solutions:**
1. Use correct aspect ratio for layout
2. Upload higher resolution image
3. Use `contentFit="cover"` (already set)
4. Check image dimensions

---

## 📊 Layout Usage Statistics

Track which layouts perform best:
- Click-through rate by layout
- User engagement by layout
- Conversion by layout
- Optimal layout for each action type

---

## 🚀 Future Enhancements

Potential additions:
- [ ] Custom dimensions per promotion
- [ ] Animation options per layout
- [ ] Video backgrounds for Hero
- [ ] Carousel layout (multiple items)
- [ ] Grid layout (2x2)
- [ ] Story-style layout (vertical full screen)

---

## ✅ Summary

**4 Layouts Available:**
1. ✅ Hero - Large, prominent (180px)
2. ✅ Card - Standard (140px)
3. ✅ Full Width - Edge-to-edge (120px)
4. ✅ Sidebar - Compact vertical (200px)

**All layouts support:**
- ✅ All action types
- ✅ Auto-rotation
- ✅ Priority sorting
- ✅ Click actions
- ✅ Media types

**Ready to use!** 🎉
