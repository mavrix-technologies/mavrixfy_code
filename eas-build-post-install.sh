#!/usr/bin/env bash

# EAS Build Post-Install Hook
# This script runs after npm install during EAS builds on iOS
# It patches the Podfile to fix compilation issues with react-native-slider
# and suppresses Swift warnings that would cause build failures

set -e

echo "📦 Running EAS Build Post-Install Hook for iOS..."

# Check if this is an iOS build
if [ "$EAS_BUILD_PLATFORM" != "ios" ]; then
  echo "⏭️  Skipping iOS-specific fixes (platform: $EAS_BUILD_PLATFORM)"
  exit 0
fi

# Wait a moment for Podfile to be generated (it's generated after npm install in EAS)
sleep 2

PODFILE_PATH="ios/Podfile"

if [ ! -f "$PODFILE_PATH" ]; then
  echo "⚠️  Podfile not found at $PODFILE_PATH, skipping patches"
  exit 0
fi

echo "✅ Found Podfile at $PODFILE_PATH"

# Check if post_install hook already exists to avoid duplicates
if grep -q "# Post-install hook to fix compilation issues" "$PODFILE_PATH"; then
  echo "⚠️  Post-install hook already exists in Podfile, skipping"
  exit 0
fi

echo "🔧 Patching Podfile to fix compilation issues..."

# Add post_install hook to suppress warnings and fix build settings
cat >> "$PODFILE_PATH" << 'EOF'

# Post-install hook to fix compilation issues with react-native-slider and Swift packages
post_install do |installer|
  installer.pods_project.targets.each do |target|
    # Fix react-native-slider compilation issues
    if target.name == 'react-native-slider'
      target.build_configurations.each do |config|
        config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
        config.build_settings['CLANG_WARN_DOCUMENTATION_COMMENTS'] = 'NO'
        config.build_settings['CLANG_WARN_STRICT_PROTOTYPES'] = 'NO'
      end
    end
    
    # Fix Swift package warnings (MultiplatformBleAdapter, SwiftAudioEx, etc.)
    if target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.framework'
      if target.name.include?('BleAdapter') || target.name.include?('SwiftAudio') || 
         target.name.include?('Reachability')
        target.build_configurations.each do |config|
          config.build_settings['SWIFT_SUPPRESS_WARNINGS'] = 'YES'
          config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
        end
      end
    end
    
    # Set minimum deployment target for all pods
    target.build_configurations.each do |config|
      if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_i < 12
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '12.0'
      end
    end
  end
end
EOF

echo "✅ Patched Podfile successfully"
echo "✅ Post-install hook completed"
