#!/usr/bin/env bash

# EAS Build Post-Install Hook
# This script runs after npm install during EAS builds on iOS
# It patches the Podfile to fix react-native-slider compilation issues

set -e

echo "📦 Running EAS Build Post-Install Hook for iOS..."

# Check if this is an iOS build
if [ "$EAS_BUILD_PLATFORM" != "ios" ]; then
  echo "⏭️  Skipping iOS-specific fixes (platform: $EAS_BUILD_PLATFORM)"
  exit 0
fi

# Wait for Podfile to be generated (it's generated after npm install in EAS)
sleep 2

PODFILE_PATH="ios/Podfile"

if [ ! -f "$PODFILE_PATH" ]; then
  echo "⚠️  Podfile not found at $PODFILE_PATH, skipping patches"
  exit 0
fi

echo "✅ Found Podfile at $PODFILE_PATH"
echo "🔧 Patching Podfile to fix react-native-slider..."

# Add post_install hook to suppress warnings for react-native-slider
cat >> "$PODFILE_PATH" << 'EOF'

# Post-install hook to fix compilation issues with react-native-slider
post_install do |installer|
  installer.pods_project.targets.each do |target|
    if target.name == 'react-native-slider'
      target.build_configurations.each do |config|
        config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
        config.build_settings['CLANG_WARN_DOCUMENTATION_COMMENTS'] = 'NO'
        config.build_settings['CLANG_WARN_STRICT_PROTOTYPES'] = 'NO'
      end
    end
    
    # Fix all Pods to use proper Swift version settings
    if target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.framework'
      target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
      end
    end
  end
end
EOF

echo "✅ Patched Podfile successfully"
echo "✅ Post-install hook completed"
