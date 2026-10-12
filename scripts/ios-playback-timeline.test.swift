import AVFoundation
import Foundation

@main
struct PlaybackTimelineTests {
  static func wait(_ message: String, until condition: () -> Bool) {
    let deadline = Date().addingTimeInterval(10)
    while !condition(), Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    precondition(condition(), message)
  }

  static func main() throws {
    // Real local PCM asset: two seconds of audio, with a shorter selected-stream
    // boundary. Exercise AVQueuePlayer itself, not a mocked JavaScript clock.
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
    defer { try? FileManager.default.removeItem(at: url) }
    let sampleRate: UInt32 = 8_000
    let samples = Int(sampleRate) * 2
    let bytes = UInt32(samples * 2)
    var wav = Data()
    func text(_ value: String) { wav.append(contentsOf: value.utf8) }
    func number<T: FixedWidthInteger>(_ value: T) {
      var littleEndian = value.littleEndian
      withUnsafeBytes(of: &littleEndian) { wav.append(contentsOf: $0) }
    }
    text("RIFF"); number(bytes + 36); text("WAVEfmt ")
    number(UInt32(16)); number(UInt16(1)); number(UInt16(1))
    number(sampleRate); number(sampleRate * 2); number(UInt16(2)); number(UInt16(16))
    text("data"); number(bytes)
    wav.append(Data(repeating: 0, count: Int(bytes)))
    try wav.write(to: url)

    func item() -> AVPlayerItem {
      AVPlayerItem(asset: AVURLAsset(url: url), automaticallyLoadedAssetKeys: ["tracks", "duration"])
    }
    let first = item()
    let second = item()
    PlaybackTimeline.configure(first, streamDuration: 0.4)
    PlaybackTimeline.configure(second, streamDuration: 0.8)
    let player = AVQueuePlayer(items: [first, second])
    player.isMuted = true
    defer { player.pause(); player.removeAllItems() }
    wait("Local audio must become ready") { first.status == .readyToPlay }
    precondition(abs(first.duration.seconds - 2) < 0.01, "Fixture must retain the longer asset duration")
    precondition(abs(PlaybackTimeline.duration(first) - 0.4) < 0.001, "UI/seek duration must use the native playback boundary")
    PlaybackTimeline.configure(first, streamDuration: 3)
    precondition(abs(PlaybackTimeline.duration(first) - 2) < 0.01, "A boundary cannot extend the actual asset")
    PlaybackTimeline.configure(first, streamDuration: 0.4)

    var completed = [ObjectIdentifier]()
    let observer = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { event in
      if let ended = event.object as? AVPlayerItem { completed.append(ObjectIdentifier(ended)) }
    }
    defer { NotificationCenter.default.removeObserver(observer) }
    player.play()
    wait("Native end boundary must advance to the second queue item") {
      player.currentItem === second && completed.contains(ObjectIdentifier(first))
    }
    player.pause()
    let pausedAt = player.currentTime().seconds
    RunLoop.current.run(until: Date().addingTimeInterval(0.15))
    precondition(abs(player.currentTime().seconds - pausedAt) < 0.05, "Pause must retain the second item's clock")
    var sought = false
    player.seek(to: CMTime(seconds: 0.5, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { finished in sought = finished }
    wait("Seek must complete on the new item") { sought }
    precondition(player.currentItem === second && abs(player.currentTime().seconds - 0.5) < 0.05)
    player.play()
    wait("Resume must finish the second item at its own boundary") { completed.contains(ObjectIdentifier(second)) }

    let unbounded = item()
    for invalid in [Double.nan, Double.infinity, -1, 0] {
      PlaybackTimeline.configure(unbounded, streamDuration: invalid)
      precondition(!unbounded.forwardPlaybackEndTime.isValid, "Invalid durations must never truncate playback")
    }
    PlaybackTimeline.configure(unbounded, streamDuration: nil)
    precondition(!unbounded.forwardPlaybackEndTime.isValid)
    print("iOS native timeline, automatic Next, pause/resume and seek tests passed")
  }
}
