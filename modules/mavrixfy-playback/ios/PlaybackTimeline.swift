import AVFoundation

/// The selected stream's timeline, shared by native playback, seeking and metadata.
enum PlaybackTimeline {
  static func configure(_ item: AVPlayerItem, streamDuration: Double?) {
    // Catalog/song durations can describe a different recording. Only the
    // resolver's duration for this exact stream may set a native end boundary.
    if let seconds = streamDuration, seconds.isFinite, seconds > 0 {
      item.forwardPlaybackEndTime = CMTime(seconds: seconds, preferredTimescale: 1_000_000)
    } else {
      item.forwardPlaybackEndTime = .invalid
    }
  }

  static func duration(_ item: AVPlayerItem) -> Double {
    // AVPlayerItem.duration excludes forwardPlaybackEndTime (Apple API contract).
    let measured = item.duration.seconds
    let end = item.forwardPlaybackEndTime.seconds
    if end.isFinite && end > 0 {
      return measured.isFinite && measured > 0 ? min(measured, end) : end
    }
    return measured.isFinite && measured > 0 ? measured : 0
  }
}
