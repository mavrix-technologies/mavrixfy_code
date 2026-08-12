# Backend API Search Fix Guide

## Problem
Your backend API at `https://mavrixfy-song-api.vercel.app/api/search/songs` is only returning 2 songs for "pal pal tawinder" query, but you expect more results.

## Frontend Status
✅ Frontend is now correctly requesting 100 songs via `limit=100` parameter  
✅ Frontend is correctly parsing and displaying all songs returned by the API  
✅ Frontend has removed all artificial restrictions  

## Issue Location
❌ **The backend API itself is limiting results to 2 songs**

## What to Check in Backend

### Location
Navigate to: `e:\Mavrixfy\mavrixfy-song-api\mavrixfy-song-api\src\modules\search`

### Files to Check

#### 1. Search Controller
File: `src/modules/search/controllers/search.controller.ts` (or similar)

Look for:
```typescript
// BAD - Limiting results
const limit = Math.min(req.query.limit || 10, 25); // ❌ Max limit of 25

// GOOD - Allow higher limits
const limit = Math.min(req.query.limit || 10, 100); // ✅ Allow up to 100
```

#### 2. Search Service
File: `src/modules/search/services/search.service.ts` (or similar)

Look for:
```typescript
// Check if there's filtering/deduplication happening
async searchSongs(query: string, limit: number) {
  const results = await this.jiosaavnProvider.search(query);
  
  // ❌ Bad - Aggressive filtering
  const filtered = results.filter(song => 
    song.hasAllFields && 
    song.quality === 'high' &&
    !song.isDuplicate
  );
  
  // ✅ Good - Return all results
  return results.slice(0, limit);
}
```

#### 3. JioSaavn Provider/Use Case
File: `src/modules/search/use-cases/search-songs.use-case.ts` or similar

Look for:
```typescript
// Check the actual JioSaavn API call
const response = await fetch(
  `https://saavn.dev/api/search/songs?query=${query}&limit=${limit}` // ❌ Using wrong limit
);

// Should be:
const response = await fetch(
  `https://saavn.dev/api/search/songs?query=${query}&limit=${requestedLimit}` // ✅ Pass through limit
);
```

### Common Issues to Fix

#### Issue 1: Hardcoded Result Limits
```typescript
// ❌ BAD
return results.slice(0, 10); // Always returns max 10

// ✅ GOOD
return results.slice(0, limit); // Returns requested limit
```

#### Issue 2: Aggressive Duplicate Filtering
```typescript
// ❌ BAD - Filters out too many songs
const unique = results.filter((song, index, self) =>
  index === self.findIndex(s => 
    s.title.toLowerCase() === song.title.toLowerCase() &&
    s.artist.toLowerCase() === song.artist.toLowerCase()
  )
);

// ✅ GOOD - Only filter exact duplicates
const unique = results.filter((song, index, self) =>
  index === self.findIndex(s => s.id === song.id)
);
```

#### Issue 3: Quality Filtering
```typescript
// ❌ BAD - Filters out songs
const quality = results.filter(song => 
  song.hasDownloadUrl && 
  song.hasCoverImage &&
  song.artist !== 'Unknown Artist'
);

// ✅ GOOD - Keep all songs
const quality = results; // No filtering
```

#### Issue 4: Response Limit in Route
```typescript
// ❌ BAD - Route level limit
router.get('/search/songs', async (req, res) => {
  const limit = req.query.limit || 10; // Default 10
  const maxLimit = 25; // Max 25
  const actualLimit = Math.min(limit, maxLimit); // ❌
  // ...
});

// ✅ GOOD - Allow higher limits
router.get('/search/songs', async (req, res) => {
  const limit = req.query.limit || 10;
  const maxLimit = 100; // ✅ Allow 100
  const actualLimit = Math.min(limit, maxLimit);
  // ...
});
```

### How to Test Backend Fix

1. **Direct API Test** (before deploying):
```bash
# Test locally if running backend on localhost:3000
curl "http://localhost:3000/api/search/songs?query=pal%20pal%20tawinder&limit=100"

# Test production
curl "https://mavrixfy-song-api.vercel.app/api/search/songs?query=pal%20pal%20tawinder&limit=100"
```

2. **Check Response**:
```json
{
  "success": true,
  "data": {
    "results": [
      // Should have MANY songs here, not just 2
    ]
  }
}
```

### Quick Fix Steps

1. Open your backend project: `cd e:\Mavrixfy\mavrixfy-song-api\mavrixfy-song-api`

2. Find the search songs endpoint (likely in `src/modules/search/`)

3. Look for these patterns and fix them:
   - Hardcoded limits (increase to 100)
   - Aggressive filtering (remove or simplify)
   - Quality checks (make them optional)
   - Duplicate detection (only filter exact ID matches)

4. Test locally:
```bash
npm run dev
# or
yarn dev
```

5. Deploy to Vercel:
```bash
vercel deploy --prod
```

### Expected Result

After fixing the backend:
- Query: `pal pal tawinder`
- Expected: 20-50+ songs matching the query
- Current: Only 2 songs ❌
- Target: All matching songs ✅

### Frontend Already Fixed

The frontend will automatically display all songs once the backend returns them because:
- ✅ Frontend requests 100 songs via `limit=100`
- ✅ Frontend parses all songs returned
- ✅ Frontend displays all parsed songs
- ✅ Frontend has removed all artificial limits

## Need Help?

If you want me to fix the backend code, please:

1. **Option A**: Change your workspace to include the backend:
   - Open: `e:\Mavrixfy\mavrixfy-song-api\mavrixfy-song-api`
   - Then I can directly modify the backend files

2. **Option B**: Share the backend search code:
   - Copy the search controller/service code here
   - I'll provide the exact fixes

The core issue is: **Backend is returning 2 songs, needs to return 100 songs**
