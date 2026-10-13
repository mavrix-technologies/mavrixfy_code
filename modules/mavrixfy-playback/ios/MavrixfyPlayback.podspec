Pod::Spec.new do |s|
  s.name = 'MavrixfyPlayback'
  s.version = '1.0.0'
  s.summary = 'Mavrixfy native playback'
  s.description = 'AVFoundation music playback for development and production.'
  s.license = { :type => 'MIT' }
  s.author = 'Mavrixfy'
  s.homepage = 'https://mavrixfy.com'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'AVFoundation', 'AVKit', 'MediaPlayer', 'AudioToolbox'
end
