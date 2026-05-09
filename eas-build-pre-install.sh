#!/usr/bin/env bash

# EAS Build Pre-Install Hook
# This script runs before npm install during EAS builds
# It fixes the build.gradle to use the correct version code resolution

echo "🔧 Fixing build.gradle for EAS build..."

BUILD_GRADLE_PATH="android/app/build.gradle"

if [ -f "$BUILD_GRADLE_PATH" ]; then
  echo "✅ Found build.gradle at $BUILD_GRADLE_PATH"
  
  # Replace the version code resolution logic
  sed -i 's|file("\$projectDir/../../app.json")|file("\$projectRoot/app.json")|g' "$BUILD_GRADLE_PATH"
  
  echo "✅ Fixed build.gradle version code resolution"
else
  echo "⚠️  build.gradle not found at $BUILD_GRADLE_PATH"
fi

# Create a post_install hook for CocoaPods to fix react-native-slider compilation issues
echo "🔧 Creating post-install hook for CocoaPods..."

cat > scripts/fix-pods-post-install.rb << 'EOF'
# Post-install hook for CocoaPods to fix compilation issues
# This fixes issues with react-native-slider and other packages

def fix_react_native_slider_build_settings(installer)
  installer.pods_project.targets.each do |target|
    if target.name == "react-native-slider"
      target.build_configurations.each do |config|
        config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
        config.build_settings['CLANG_WARN_DOCUMENTATION_COMMENTS'] = 'NO'
      end
    end
  end
end

Post.install do |installer|
  fix_react_native_slider_build_settings(installer)
end
EOF

echo "✅ Created CocoaPods post-install hook"
echo "✅ Pre-install hook completed"
