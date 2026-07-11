# Security Quick Start Guide

## 🚀 Immediate Actions Required

### Step 1: Install Dependencies (2 minutes)

```bash
npm install zod
```

### Step 2: Review Created Files (5 minutes)

Three new security files have been created:

1. **`lib/validation.ts`** - Input validation schemas using Zod
2. **`lib/rateLimiter.ts`** - Client-side rate limiting
3. **`lib/fileValidation.ts`** - Secure file upload validation

### Step 3: Update Authentication (30 minutes)

#### Update `contexts/AuthContext.tsx`

Add imports:
```typescript
import { safeValidate, loginSchema, registerSchema, emailSchema } from '@/lib/validation';
import { checkRateLimit, clearRateLimit, formatRetryAfter } from '@/lib/rateLimiter';
```

Modify the `login` function:
```typescript
const login = useCallback(async (email: string, password: string) => {
  // Rate limit check
  const rateLimit = await checkRateLimit('auth:login', email.toLowerCase());
  if (!rateLimit.allowed) {
    throw new Error(`Too many login attempts. Please try again in ${formatRetryAfter(rateLimit.retryAfter!)}`);
  }

  // Validate input
  const validation = safeValidate(loginSchema, { email, password });
  if (!validation.success) {
    throw new Error(validation.error);
  }

  const { email: validEmail, password: validPassword } = validation.data;

  try {
    const credential = await signInWithEmailAndPassword(auth, validEmail, validPassword);
    const fbUser = credential.user;
    const appUser = await buildAppUser(fbUser);
    setUser(appUser);
    setFirebaseUser(fbUser);
    setIsGuest(false);
    setLoading(false);
    
    // Clear rate limit on successful login
    await clearRateLimit('auth:login', validEmail);
  } catch (error: any) {
    // Don't clear rate limit on failed login
    throw error;
  }
}, [buildAppUser]);
```

Modify the `register` function:
```typescript
const register = useCallback(async (email: string, password: string, fullName: string) => {
  // Rate limit check
  const rateLimit = await checkRateLimit('auth:register', email.toLowerCase());
  if (!rateLimit.allowed) {
    throw new Error(`Too many registration attempts. Please try again in ${formatRetryAfter(rateLimit.retryAfter!)}`);
  }

  // Validate input
  const validation = safeValidate(registerSchema, { email, password, fullName });
  if (!validation.success) {
    throw new Error(validation.error);
  }

  const { email: validEmail, password: validPassword, fullName: validFullName } = validation.data;

  const credential = await createUserWithEmailAndPassword(auth, validEmail, validPassword);
  const fbUser = credential.user;

  // Update display name
  await updateProfile(fbUser, { displayName: validFullName });

  // Create Firestore user document
  await setDoc(doc(firestore, 'users', fbUser.uid), {
    email: validEmail,
    fullName: validFullName,
    createdAt: new Date().toISOString(),
  });

  const appUser = await buildAppUser(fbUser);
  setUser(appUser);
  setFirebaseUser(fbUser);
  setIsGuest(false);
  setLoading(false);
  
  // Clear rate limit on successful registration
  await clearRateLimit('auth:register', validEmail);
}, [buildAppUser]);
```

### Step 4: Fix Error Exposure (5 minutes)

#### Update `components/ErrorFallback.tsx`

Find the `formatErrorDetails` function and update it:

```typescript
const formatErrorDetails = (): string => {
  let details = `Error: ${error.message}\n\n`;
  
  // Only show stack traces in development mode
  if (__DEV__ && error.stack) {
    details += `Stack Trace:\n${error.stack}`;
  } else if (!__DEV__) {
    details += 'Error details have been logged securely.';
  }
  
  return details;
};
```

### Step 5: Update File Upload Security (15 minutes)

#### Update `lib/cloudinary.ts`

Add imports:
```typescript
import { validateImageFile, sanitizeFilename, isAllowedImageExtension } from './fileValidation';
```

Modify `uploadImageToCloudinary`:
```typescript
export const uploadImageToCloudinary = async (
  imageUri: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    if (!imageUri) {
      throw new Error('No image URI provided');
    }

    // Extract filename
    const filename = imageUri.split('/').pop() || 'image.jpg';
    
    // Check file extension
    if (!isAllowedImageExtension(filename)) {
      throw new Error('Only JPEG, PNG, and WebP images are allowed');
    }

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(imageUri, { size: true });
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    const fileSize = fileInfo.size || 0;
    
    // Determine mime type
    const match = /\.(\w+)$/.exec(filename);
    const ext = match ? match[1].toLowerCase() : 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    // Validate file
    const validation = await validateImageFile({
      uri: imageUri,
      size: fileSize,
      mimeType,
    });

    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file');
    }

    // Sanitize filename
    const safeFilename = sanitizeFilename(filename);

    // Create form data
    const formData = new FormData();
    
    formData.append('file', {
      uri: imageUri,
      name: safeFilename,
      type: mimeType,
    } as any);

    // Rest of the upload code...
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
    formData.append('folder', 'spotify_clone/playlists');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Upload failed');
    }

    const data: CloudinaryUploadResponse = await response.json();
    
    if (onProgress) {
      onProgress(100);
    }

    return data.secure_url;
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    throw new Error(error?.message || 'Failed to upload image. Please try again.');
  }
};
```

Add the FileSystem import at the top:
```typescript
import * as FileSystem from 'expo-file-system';
```

### Step 6: Update Dependencies (30 minutes)

```bash
# Update specific vulnerable packages
npm update protobufjs ws undici tmp js-yaml @babel/core uuid

# Verify fixes
npm audit

# If issues remain, try
npm audit fix
```

**⚠️ Warning**: Some vulnerabilities are in Expo dependencies. You may need to update the Expo SDK:

```bash
# Check current Expo version
npx expo --version

# To upgrade Expo SDK (test thoroughly!)
# npx expo install --fix
```

### Step 7: Test Everything (30 minutes)

Test all security-critical flows:

- [ ] Login with valid credentials
- [ ] Login with invalid credentials (should fail)
- [ ] Login 6 times with wrong password (should get rate limited)
- [ ] Register new account with weak password (should fail validation)
- [ ] Register with strong password
- [ ] Upload image to playlist (valid image)
- [ ] Try to upload non-image file (should fail)
- [ ] Try to upload oversized file (should fail)
- [ ] Trigger error and verify no stack trace in production mode

---

## 📋 Complete Checklist

### Immediate (Do Today)
- [x] Review this security audit
- [ ] Install zod: `npm install zod`
- [ ] Update `contexts/AuthContext.tsx` with validation and rate limiting
- [ ] Update `components/ErrorFallback.tsx` to hide stack traces
- [ ] Update `lib/cloudinary.ts` with file validation
- [ ] Test authentication flows
- [ ] Test file uploads
- [ ] Build and test in production mode

### This Week
- [ ] Update vulnerable dependencies
- [ ] Test app thoroughly after dependency updates
- [ ] Review Firebase Security Rules
- [ ] Set up Firebase App Check
- [ ] Add password strength indicator to registration
- [ ] Deploy fixes to production

### This Month
- [ ] Increase password minimum to 8 characters
- [ ] Implement Cloudinary signed uploads
- [ ] Add comprehensive error logging
- [ ] Schedule regular security audits
- [ ] Review and update Firestore Security Rules
- [ ] Conduct penetration testing

---

## 🛡️ Firebase Security Checklist

### Firebase Console Actions Required

1. **Enable App Check** (High Priority)
   - Go to Firebase Console → App Check
   - Enable for your Android/iOS apps
   - Configure DeviceCheck (iOS) and Play Integrity (Android)

2. **Review API Key Restrictions**
   - Go to Google Cloud Console → Credentials
   - Add HTTP referrer restrictions for web
   - Add bundle ID restrictions for mobile

3. **Update Firestore Security Rules**
   - Review `firestore.rules`
   - Add rate limiting rules
   - Ensure user data is properly protected

4. **Enable Firebase Authentication Security**
   - Go to Firebase Console → Authentication → Settings
   - Enable email enumeration protection
   - Configure password policy

---

## 📚 Additional Reading

- [OWASP Mobile Top 10](https://owasp.org/www-project-mobile-top-10/)
- [Firebase Security Best Practices](https://firebase.google.com/docs/rules/manage-deploy)
- [React Native Security Guide](https://reactnative.dev/docs/security)
- [Zod Documentation](https://zod.dev/)

---

## ❓ Need Help?

If you encounter issues during implementation:

1. Check the created files for inline comments
2. Review the full security audit: `SECURITY_AUDIT_SUMMARY.md`
3. Test incrementally - implement one fix at a time
4. Use TypeScript type checking to catch errors early

**End of Quick Start Guide**
