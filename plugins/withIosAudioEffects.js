const { withPodfile } = require("expo/config-plugins");

// SwiftAudioEx owns the AVPlayerItem used by react-native-track-player 4.1.2.
// Expose only that item so the effect tap can follow the same queue and seek state.
const PODFILE_PATCH = `
  swift_audio_file = File.join(__dir__, 'Pods', 'SwiftAudioEx', 'Sources', 'SwiftAudioEx', 'AudioPlayer.swift')
  raise 'SwiftAudioEx 1.1.0 source not found for audio effects' unless File.file?(swift_audio_file)
  swift_audio_source = File.read(swift_audio_file)
  unless swift_audio_source.include?('currentAVPlayerItem')
    anchor = 'public class AudioPlayer: AVPlayerWrapperDelegate {'
    raise 'SwiftAudioEx AudioPlayer API changed' unless swift_audio_source.include?(anchor)
    swift_audio_source.sub!(anchor, anchor + "\\n    public var currentAVPlayerItem: AVPlayerItem? { wrapper.currentItem }")
    swift_audio_source.sub!('import Foundation', "import Foundation\\nimport AVFoundation")
    File.write(swift_audio_file, swift_audio_source)
  end
`;

module.exports = (config) =>
  withPodfile(config, (result) => {
    const podfile = result.modResults.contents;
    if (podfile.includes("currentAVPlayerItem")) return result;
    const anchor = "post_install do |installer|";
    if (!podfile.includes(anchor)) {
      throw new Error("Expo Podfile has no post_install hook for iOS audio effects.");
    }
    result.modResults.contents = podfile.replace(anchor, anchor + PODFILE_PATCH);
    return result;
  });
