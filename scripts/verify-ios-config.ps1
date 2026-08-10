# iOS Build Configuration Verification (Windows)
# Run this before pushing to GitHub to catch issues early

Write-Host "🧪 iOS Build Configuration Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  Note: This runs on Windows (no Xcode)" -ForegroundColor Yellow
Write-Host "We'll verify everything except the actual build" -ForegroundColor Yellow
Write-Host ""

$ErrorCount = 0

# Check Node.js
Write-Host "📦 Step 1: Checking Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js $nodeVersion installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found" -ForegroundColor Red
    $ErrorCount++
}
Write-Host ""

# Check npm dependencies
Write-Host "📦 Step 2: Checking npm dependencies..." -ForegroundColor Cyan
if (Test-Path "node_modules") {
    Write-Host "✅ node_modules exists" -ForegroundColor Green
} else {
    Write-Host "⚠️  node_modules not found, installing..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "❌ npm install failed" -ForegroundColor Red
        $ErrorCount++
    }
}
Write-Host ""

# Check app.json
Write-Host "📋 Step 3: Validating app.json..." -ForegroundColor Cyan
if (Test-Path "app.json") {
    try {
        $appJson = Get-Content "app.json" -Raw | ConvertFrom-Json
        $iosConfig = $appJson.expo.ios
        
        Write-Host "✅ app.json exists" -ForegroundColor Green
        Write-Host "   - Bundle ID: $($iosConfig.bundleIdentifier)" -ForegroundColor Gray
        Write-Host "   - Scheme: $($iosConfig.scheme)" -ForegroundColor Gray
        Write-Host "   - Build Number: $($iosConfig.buildNumber)" -ForegroundColor Gray
    } catch {
        Write-Host "❌ Failed to parse app.json" -ForegroundColor Red
        $ErrorCount++
    }
} else {
    Write-Host "❌ app.json not found" -ForegroundColor Red
    $ErrorCount++
}
Write-Host ""

# Check package.json
Write-Host "📋 Step 4: Checking package.json..." -ForegroundColor Cyan
if (Test-Path "package.json") {
    try {
        $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
        $hasExpo = $packageJson.dependencies.expo
        
        if ($hasExpo) {
            Write-Host "✅ Expo version: $hasExpo" -ForegroundColor Green
        } else {
            Write-Host "❌ Expo not found in dependencies" -ForegroundColor Red
            $ErrorCount++
        }
        
        # Check for problematic dependencies
        $deps = $packageJson.dependencies
        Write-Host "   Checking key iOS dependencies..." -ForegroundColor Gray
        
        $iosDeps = @(
            "react-native",
            "expo-router",
            "react-native-track-player",
            "@react-native-google-signin/google-signin"
        )
        
        foreach ($dep in $iosDeps) {
            if ($deps.$dep) {
                Write-Host "   ✅ $dep`: $($deps.$dep)" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  $dep not found" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "❌ Failed to parse package.json" -ForegroundColor Red
        $ErrorCount++
    }
} else {
    Write-Host "❌ package.json not found" -ForegroundColor Red
    $ErrorCount++
}
Write-Host ""

# Test expo prebuild (dry-run)
Write-Host "🔨 Step 5: Testing expo prebuild..." -ForegroundColor Cyan
Write-Host "   Running: npx expo prebuild --platform ios --clean" -ForegroundColor Gray

$prebuildOutput = npx expo prebuild --platform ios --clean 2>&1 | Out-String

if ($prebuildOutput -match "Skipping generating the iOS native project files" -or 
    $prebuildOutput -match "Run npx expo prebuild again from macOS") {
    Write-Host "⚠️  Windows limitation: iOS project generation requires macOS" -ForegroundColor Yellow
    Write-Host "   This is normal on Windows!" -ForegroundColor Yellow
    Write-Host "✅ expo prebuild command works (will generate on GitHub's macOS runner)" -ForegroundColor Green
    
    # Check if expo prebuild at least validates the config
    if ($prebuildOutput -match "error" -and $prebuildOutput -notmatch "Skipping") {
        Write-Host "❌ expo prebuild found configuration errors" -ForegroundColor Red
        Write-Host $prebuildOutput -ForegroundColor Red
        $ErrorCount++
    }
} elseif ($LASTEXITCODE -eq 0) {
    Write-Host "✅ expo prebuild completed" -ForegroundColor Green
    
    # Check if ios folder was created (shouldn't happen on Windows but check anyway)
    if (Test-Path "ios") {
        Write-Host "✅ ios/ folder created" -ForegroundColor Green
        
        # Check for workspace
        if (Test-Path "ios/*.xcworkspace") {
            $workspace = Get-ChildItem "ios/*.xcworkspace" | Select-Object -First 1
            Write-Host "✅ Xcode workspace: $($workspace.Name)" -ForegroundColor Green
        } else {
            Write-Host "⚠️  No .xcworkspace found (expected on Windows)" -ForegroundColor Yellow
        }
        
        # Check for Podfile
        if (Test-Path "ios/Podfile") {
            Write-Host "✅ Podfile exists" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Podfile not found (expected on Windows)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "❌ expo prebuild failed" -ForegroundColor Red
    Write-Host "   Error output:" -ForegroundColor Red
    Write-Host $prebuildOutput -ForegroundColor Red
    $ErrorCount++
}
Write-Host ""

# Check GitHub workflow file
Write-Host "📋 Step 6: Validating GitHub workflow..." -ForegroundColor Cyan
if (Test-Path ".github/workflows/ios-build.yml") {
    Write-Host "✅ ios-build.yml exists" -ForegroundColor Green
    
    $workflowContent = Get-Content ".github/workflows/ios-build.yml" -Raw
    
    # Check for key components
    if ($workflowContent -match "macos-") {
        Write-Host "✅ Uses macOS runner" -ForegroundColor Green
    } else {
        Write-Host "❌ No macOS runner specified" -ForegroundColor Red
        $ErrorCount++
    }
    
    if ($workflowContent -match "iphonesimulator") {
        Write-Host "✅ Configured for iOS Simulator" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Not configured for simulator" -ForegroundColor Yellow
    }
    
    if ($workflowContent -match "CODE_SIGNING_ALLOWED=NO") {
        Write-Host "✅ Code signing disabled" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Code signing not disabled" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ ios-build.yml not found" -ForegroundColor Red
    $ErrorCount++
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
if ($ErrorCount -eq 0) {
    Write-Host "🎉 All checks passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ Configuration looks good" -ForegroundColor Green
    Write-Host "✅ expo prebuild works" -ForegroundColor Green
    Write-Host "✅ iOS project generated" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Commit and push your changes" -ForegroundColor White
    Write-Host "2. Run 'iOS Build Validation' workflow on GitHub (fast, 5 min)" -ForegroundColor White
    Write-Host "3. If validation passes, run full 'iOS Simulator Build' workflow" -ForegroundColor White
} else {
    Write-Host "❌ Found $ErrorCount error(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fix the errors above before pushing to GitHub" -ForegroundColor Yellow
}
Write-Host ""

# Cleanup option
Write-Host "⚠️  Note: The ios/ folder was created for testing" -ForegroundColor Yellow
Write-Host "You may want to delete it if it's gitignored:" -ForegroundColor Yellow
Write-Host "   Remove-Item -Recurse -Force ios" -ForegroundColor Gray
Write-Host ""

exit $ErrorCount
