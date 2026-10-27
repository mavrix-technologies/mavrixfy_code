import AVFoundation
import Foundation
import MediaPlayer

@main
struct NativePlaybackTests {
  static func wait(_ message: String, until condition: () -> Bool) {
    let deadline = Date().addingTimeInterval(10)
    while !condition(), Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    precondition(condition(), message)
  }

  static func main() throws {
    precondition(Thread.isMainThread)
    let engine = NativePlayback.shared
    engine.player.isMuted = true
    var events = [(String, [String: Any])]()
    engine.emit = { events.append(($0, $1)) }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".wav")
    defer {
      _ = try? engine.command("reset", [:])
      engine.emit = nil
      try? FileManager.default.removeItem(at: url)
    }

    let sampleRate: UInt32 = 8_000
    let bytes: UInt32 = sampleRate * 2 * 2
    var wav = Data()
    func text(_ value: String) { wav.append(contentsOf: value.utf8) }
    func number<T: FixedWidthInteger>(_ value: T) {
      var littleEndian = value.littleEndian
      withUnsafeBytes(of: &littleEndian) { wav.append(contentsOf: $0) }
    }
    text("RIFF"); number(bytes + 36); text("WAVEfmt ")
    number(UInt32(16)); number(UInt16(1)); number(UInt16(1))
    number(sampleRate); number(sampleRate * 2); number(UInt16(2)); number(UInt16(16))
    text("data"); number(bytes); wav.append(Data(repeating: 0, count: Int(bytes)))
    try wav.write(to: url)

    func track(_ id: String, prepared: Bool = true) -> [String: Any] {
      ["id": id, "title": id, "artist": "Test", "url": prepared ? url.absoluteString : "", "playbackDurationSeconds": 0.2]
    }
    func queue() -> [[String: Any]] { engine.snapshot()["queue"] as! [[String: Any]] }
    func title() -> String? { MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String }
    let files = [track("a"), track("b"), track("c")]

    // No run-loop turn between AVQueuePlayer advancing and a pending JS update:
    // KVO has not yet reconciled the index. Audio and metadata must still agree.
    _ = try engine.command("setQueue", ["tracks": files, "index": 1])
    engine.player.advanceToNextItem()
    let actualItem = engine.player.currentItem
    _ = try engine.command("update", ["index": 2, "expectedTrackId": "c", "onlyUpcoming": true,
      "metadata": ["url": "https://invalid.example/outgoing-preload"]])
    precondition(engine.snapshot()["index"] as? Int == 2)
    precondition(engine.player.currentItem === actualItem)
    precondition(queue()[2]["url"] as? String == url.absoluteString)
    precondition(title() == "c", "Now Playing must describe the actual current item")

    // Delayed resolution must not attach a source to another reordered song.
    _ = try engine.command("setQueue", ["tracks": files, "index": 0])
    _ = try engine.command("move", ["index": 2, "to": 1])
    _ = try engine.command("update", ["index": 2, "expectedTrackId": "c", "onlyUpcoming": true,
      "metadata": ["url": "https://invalid.example/wrong-song"]])
    precondition(queue()[2]["id"] as? String == "b")
    precondition(queue()[2]["url"] as? String == url.absoluteString)

    // Active-source quality reload cannot pull playback back after native Next.
    _ = try engine.command("setQueue", ["tracks": files, "index": 0])
    engine.player.advanceToNextItem()
    _ = try engine.command("update", ["index": 0, "expectedTrackId": "a", "onlyCurrent": true,
      "metadata": ["url": "https://invalid.example/old-quality"]])
    precondition(engine.snapshot()["index"] as? Int == 1)
    precondition(queue()[0]["url"] as? String == url.absoluteString)
    precondition(title() == "b")

    // An unavailable selection is validated before changing the logical queue.
    do {
      _ = try engine.command("setQueue", ["tracks": [track("unready", prepared: false)], "index": 0])
      preconditionFailure("An unprepared active item must fail")
    } catch {}
    precondition(queue().count == 3 && title() == "b")

    // A fully prepared lock-screen selection publishes one external event;
    // pending KVO callbacks and snapshot reads must not echo another selection.
    events.removeAll()
    precondition(engine.remoteSkip(forward: true) == .success)
    _ = engine.snapshot(); _ = engine.snapshot()
    RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    let selected = events.filter { $0.0 == "playback-active-track" }
    precondition(selected.count == 1 && selected[0].1["externalSelection"] as? Bool == true)
    precondition(title() == "c")

    // Unprepared songs remain visible in the logical playlist and use the
    // shared resolver once. A failed native selection must never silently win.
    _ = try engine.command("setQueue", ["tracks": [track("a"), track("b", prepared: false)], "index": 0])
    events.removeAll()
    precondition(MPRemoteCommandCenter.shared().nextTrackCommand.isEnabled)
    precondition(engine.remoteSkip(forward: true) == .success)
    precondition(events.filter { $0.0 == "remote-next" }.count == 1)
    precondition(engine.snapshot()["index"] as? Int == 0 && queue().count == 2)
    _ = try engine.command("begin", [:])
    precondition(engine.remoteSkip(forward: true) == .success)
    _ = try engine.command("play", [:])
    precondition(engine.player.rate == 0, "Play during resolution must not resume outgoing audio")
    NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
      userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
    NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
      userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue,
        AVAudioSessionInterruptionOptionKey: AVAudioSession.InterruptionOptions.shouldResume.rawValue])
    precondition(engine.player.rate == 0, "Interruption resume must also respect pending source resolution")

    // EOF notifications may precede AVQueuePlayer's current-item removal.
    // The unresolved-next event must survive that ordering, without replaying A.
    _ = try engine.command("setQueue", ["tracks": [track("a"), track("b", prepared: false)], "index": 0])
    events.removeAll()
    _ = try engine.command("play", [:])
    wait("Unresolved EOF must request the successor") {
      events.contains { $0.0 == "playback-queue-ended" && $0.1["reason"] as? String == "unresolved-next" }
    }
    _ = try engine.command("update", ["index": 1, "expectedTrackId": "b", "onlyUpcoming": true, "metadata": track("b")])
    precondition(engine.player.currentItem == nil, "Preparing B after EOF must not replay A")

    _ = try engine.command("setQueue", ["tracks": files, "index": 2])
    _ = try engine.command("repeat", ["mode": "queue"])
    precondition(MPRemoteCommandCenter.shared().nextTrackCommand.isEnabled, "Repeat-all must refresh lock-screen Next immediately")
    precondition(engine.remoteSkip(forward: true) == .success)
    precondition(engine.snapshot()["index"] as? Int == 0)
    _ = try engine.command("reset", [:])
    precondition(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
    precondition(!MPRemoteCommandCenter.shared().nextTrackCommand.isEnabled)
    print("iOS native queue identity, lock-screen selection, metadata, conditional source updates and EOF tests passed")
  }
}
