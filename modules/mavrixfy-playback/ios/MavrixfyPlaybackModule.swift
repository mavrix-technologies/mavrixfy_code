import ExpoModulesCore
import AVFoundation
import MediaPlayer
import UIKit

public final class MavrixfyPlaybackModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MavrixfyPlayback")
    Events("playbackEvent")
    AsyncFunction("setup") { () -> [String: Any] in
      let engine = NativePlayback.shared
      engine.emit = { [weak self] name, data in self?.sendEvent("playbackEvent", ["name": name, "data": data]) }
      return engine.snapshot()
    }.runOnQueue(.main)
    AsyncFunction("command") { (name: String, args: [String: Any]) -> [String: Any] in
      return try NativePlayback.shared.command(name, args)
    }.runOnQueue(.main)
    AsyncFunction("snapshot") { NativePlayback.shared.snapshot() }.runOnQueue(.main)
    OnDestroy { NativePlayback.shared.emit = nil }
  }
}

/** Process lifetime is independent of normal/StandBy screen presentation. */
private final class NativePlayback {
  static let shared = NativePlayback()
  let player = AVQueuePlayer()
  var emit: ((String, [String: Any]) -> Void)?
  private var tracks = [[String: Any]]()
  private var items = [AVPlayerItem]()
  private var index = -1
  private var intendedPlay = false
  private var revision = 0
  private var interruptionRevision: Int?
  private var repeatMode = "off"
  private var remoteSelection = false
  private var artworkURL: String?
  private var artworkTask: URLSessionDataTask?
  private var artwork: MPMediaItemArtwork?
  private var observations = [NSKeyValueObservation]()
  private var notifications = [NSObjectProtocol]()
  private var progressObserver: Any?
  private var itemObservation: NSKeyValueObservation?
  private init() {
    player.automaticallyWaitsToMinimizeStalling = true
    observations.append(player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async { guard let self else { return }; self.event("playback-state", ["state": self.status()]); self.nowPlaying() }
    })
    observations.append(player.observe(\.currentItem, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.reconcileItem() }
    })
    progressObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] _ in
      guard let self, self.index >= 0 else { return }
      self.event("playback-progress", ["position": self.position(), "duration": self.duration(), "track": self.index])
      self.nowPlaying()
    }
    let center = NotificationCenter.default
    notifications.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] event in
      guard let self, let raw = event.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
        let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
      if type == .began {
        self.interruptionRevision = self.intendedPlay ? self.revision : nil
        self.player.pause()
        self.event("playback-interruption", ["resumed": false])
      } else {
        let options = AVAudioSession.InterruptionOptions(rawValue: event.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
        let resume = self.intendedPlay && self.interruptionRevision == self.revision && options.contains(.shouldResume)
        self.interruptionRevision = nil
        if resume { do { try self.activate(); self.player.play(); self.event("playback-interruption", ["resumed": true]) } catch { self.fail(error.localizedDescription) } }
      }
    })
    notifications.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] event in
      guard let raw = event.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
        raw == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
      self?.event("remote-pause"); self?.pause()
    })
    notifications.append(center.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] event in
      guard let self, let ended = event.object as? AVPlayerItem, self.items.contains(where: { $0 === ended }) else { return }
      if self.repeatMode == "track", self.intendedPlay { self.player.seek(to: .zero) { [weak self] _ in DispatchQueue.main.async { if self?.intendedPlay == true { self?.player.play() } } } }
      else if ended === self.items.last {
        if self.repeatMode == "queue", self.intendedPlay { do { try self.select(0, 0) } catch { self.fail(error.localizedDescription) } }
        else { self.event("playback-state", ["state": "ended"]); self.event("playback-queue-ended") }
      }
    })
    notifications.append(center.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: nil, queue: .main) { [weak self] event in
      guard let self, let item = event.object as? AVPlayerItem, item === self.player.currentItem else { return }
      self.fail("Native audio stream failed.")
    })
    let commands = MPRemoteCommandCenter.shared()
    commands.playCommand.addTarget { [weak self] _ in guard let self else { return .commandFailed }; do { self.event("remote-play"); try self.play(); return .success } catch { self.fail(error.localizedDescription); return .commandFailed } }
    commands.pauseCommand.addTarget { [weak self] _ in self?.event("remote-pause"); self?.pause(); return .success }
    commands.stopCommand.addTarget { [weak self] _ in self?.event("remote-stop"); self?.pause(); return .success }
    commands.nextTrackCommand.addTarget { [weak self] _ in guard let self else { return .commandFailed }; let next = self.index + 1 < self.tracks.count ? self.index + 1 : (self.repeatMode == "queue" ? 0 : -1); guard next >= 0 else { return .noSuchContent }; do { self.remoteSelection = true; try self.select(next, 0); return .success } catch { self.remoteSelection = false; return .commandFailed } }
    commands.previousTrackCommand.addTarget { [weak self] _ in guard let self else { return .commandFailed }; do { self.remoteSelection = true; try self.select(self.position() > 3 ? self.index : max(0, self.index - 1), 0); return .success } catch { self.remoteSelection = false; return .commandFailed } }
    commands.changePlaybackPositionCommand.addTarget { [weak self] event in guard let change = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }; self?.seek(change.positionTime); return .success }
  }
  private func event(_ name: String, _ body: [String: Any] = [:]) { emit?(name, body) }
  private func position() -> Double { let value = player.currentTime().seconds; return value.isFinite ? max(0, value) : 0 }
  private func duration() -> Double { let value = player.currentItem?.duration.seconds ?? 0; return value.isFinite ? max(0, value) : 0 }
  private func status() -> String {
    if player.currentItem?.status == .failed { return "error" }
    if tracks.isEmpty { return "none" }
    if player.currentItem == nil { return "ended" }
    if player.timeControlStatus == .playing { return "playing" }
    if player.timeControlStatus == .waitingToPlayAtSpecifiedRate { return "buffering" }
    return "paused"
  }
  func snapshot() -> [String: Any] { return ["queue": tracks, "index": index, "state": status(), "position": position(), "duration": duration(), "playWhenReady": intendedPlay, "equalizerAvailable": false] }
  private func activate() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [])
    try session.setActive(true)
  }
  private func play() throws {
    revision += 1; intendedPlay = true
    if player.currentItem == nil, tracks.indices.contains(index) { try select(index, 0) }
    try activate(); player.play(); event("playback-play-when-ready", ["playWhenReady": true]); nowPlaying()
  }
  private func pause() { revision += 1; interruptionRevision = nil; intendedPlay = false; player.pause(); event("playback-play-when-ready", ["playWhenReady": false, "reason": "pause"]); nowPlaying() }
  private func seek(_ seconds: Double) {
    guard seconds.isFinite else { return }
    player.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600)) { [weak self] _ in
      DispatchQueue.main.async { guard let self else { return }; self.event("playback-progress", ["position": self.position(), "duration": self.duration(), "track": self.index]); self.nowPlaying() }
    }
  }
  private func makeItem(_ track: [String: Any]) throws -> AVPlayerItem {
    let raw = (track["url"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "mavrixfy://unresolved/\(track["id"] as? String ?? "track")"
    guard let url = URL(string: raw) else { throw NSError(domain: "MavrixfyPlayback", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid playback URL."]) }
    let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": track["headers"] as? [String: String] ?? [:]])
    return AVPlayerItem(asset: asset)
  }
  private func select(_ next: Int, _ seconds: Double, preserveCurrent: Bool = false) throws {
    guard tracks.indices.contains(next) else { throw NSError(domain: "MavrixfyPlayback", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid queue index."]) }
    var prepared = try tracks[next...].map(makeItem)
    let retained = preserveCurrent ? player.currentItem : nil
    if let retained { prepared[0] = retained }
    revision += 1; interruptionRevision = nil
    if retained == nil { player.pause(); player.removeAllItems() }
    else { player.items().filter { $0 !== retained }.forEach { player.remove($0) } }
    items = prepared
    prepared.filter { $0 !== retained }.forEach { player.insert($0, after: nil) }
    index = next; if retained == nil { seek(seconds) }; reconcileItem()
    if intendedPlay && retained == nil { try activate(); player.play() }
  }
  private func reconcileItem() {
    guard let current = player.currentItem, let offset = items.firstIndex(where: { $0 === current }) else { return }
    // AVQueuePlayer removes completed items; original identities preserve queue indices.
    let base = tracks.count - items.count
    index = base + offset
    itemObservation = current.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
      DispatchQueue.main.async { guard let self, item === self.player.currentItem else { return }; if item.status == .failed { self.fail("Native audio stream failed.") } }
    }
    event("playback-active-track", ["index": index, "track": tracks[index], "externalSelection": remoteSelection])
    remoteSelection = false
    nowPlaying()
  }
  private func fail(_ message: String) { pause(); event("playback-error", ["trackId": tracks.indices.contains(index) ? tracks[index]["id"] ?? "" : "", "message": message]) }
  private func nowPlaying() {
    guard tracks.indices.contains(index) else { MPNowPlayingInfoCenter.default().nowPlayingInfo = nil; return }
    let track = tracks[index]
    let cover = track["artwork"] as? String
    if artworkURL != cover {
      artworkTask?.cancel(); artworkTask = nil; artworkURL = cover; artwork = nil
      if let cover, let url = URL(string: cover) {
        if url.isFileURL, let image = UIImage(contentsOfFile: url.path) { artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image } }
        else {
          artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async { guard let self, self.artworkURL == cover else { return }; self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }; self.nowPlaying() }
          }
          artworkTask?.resume()
        }
      }
    }
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPMediaItemPropertyTitle] = track["title"] ?? ""
    info[MPMediaItemPropertyArtist] = track["artist"] ?? ""
    info[MPMediaItemPropertyAlbumTitle] = track["album"] ?? ""
    info[MPMediaItemPropertyPlaybackDuration] = duration()
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position()
    info[MPNowPlayingInfoPropertyPlaybackRate] = player.timeControlStatus == .playing ? 1.0 : 0.0
    info[MPMediaItemPropertyArtwork] = artwork
    MPRemoteCommandCenter.shared().nextTrackCommand.isEnabled = index + 1 < tracks.count || repeatMode == "queue"
    MPRemoteCommandCenter.shared().previousTrackCommand.isEnabled = true
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }
  func command(_ name: String, _ args: [String: Any]) throws -> [String: Any] {
    let next = args["index"] as? Int ?? 0; let seconds = args["position"] as? Double ?? 0
    switch name {
    case "setQueue":
      let old = tracks.indices.contains(index) ? tracks[index] : nil
      tracks = args["tracks"] as? [[String: Any]] ?? []
      let preserve = args["preserveCurrentTrack"] as? Bool == true && tracks.indices.contains(next) && old?["id"] as? String == tracks[next]["id"] as? String && old?["url"] as? String == tracks[next]["url"] as? String && (old?["headers"] as? [String: String] ?? [:]) == (tracks[next]["headers"] as? [String: String] ?? [:])
      if tracks.isEmpty { pause(); player.removeAllItems(); items = []; index = -1 } else { try select(next, seconds, preserveCurrent: preserve) }
    case "play": try play()
    case "begin": revision += 1; intendedPlay = true; player.pause(); event("playback-play-when-ready", ["playWhenReady": false, "reason": "source-change"])
    case "pause": pause()
    case "stop": pause(); seek(0)
    case "seek": seek(seconds)
    case "skip": try select(next, seconds)
    case "reset": pause(); player.removeAllItems(); items = []; tracks = []; index = -1; MPNowPlayingInfoCenter.default().nowPlayingInfo = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    case "repeat": repeatMode = args["mode"] as? String ?? "off"; player.actionAtItemEnd = repeatMode == "track" ? .pause : .advance
    case "volume": player.volume = Float(max(0, min(1, args["volume"] as? Double ?? 1)))
    case "update":
      if tracks.indices.contains(next) {
        if args["onlyUpcoming"] as? Bool == true && next <= index { return snapshot() }
        let metadata = args["metadata"] as? [String: Any] ?? [:]; let oldURL = tracks[next]["url"] as? String
        let oldHeaders = tracks[next]["headers"] as? [String: String] ?? [:]
        tracks[next].merge(metadata) { _, new in new }
        if oldURL != tracks[next]["url"] as? String || oldHeaders != (tracks[next]["headers"] as? [String: String] ?? [:]) { try select(index, position(), preserveCurrent: next != index) } else { nowPlaying() }
      }
    case "add": let at = max(0, min(tracks.count, next)); let additions = args["tracks"] as? [[String: Any]] ?? []; tracks.insert(contentsOf: additions, at: at); if index >= 0 { try select(at <= index ? index + additions.count : index, position(), preserveCurrent: true) } else if !tracks.isEmpty { try select(0, 0) }
    case "remove": if tracks.indices.contains(next) { let preserve = next != index; let retainedPosition = preserve ? position() : 0; tracks.remove(at: next); if tracks.isEmpty { pause(); player.removeAllItems(); items = []; index = -1 } else { try select(min(index > next ? index - 1 : index, tracks.count - 1), retainedPosition, preserveCurrent: preserve) } }
    case "move": if tracks.indices.contains(next), let to = args["to"] as? Int, tracks.indices.contains(to) {
      var selected = index
      if next == index { selected = to } else if next < index && to >= index { selected -= 1 } else if next > index && to <= index { selected += 1 }
      tracks.insert(tracks.remove(at: next), at: to); try select(selected, position(), preserveCurrent: true)
    }
    case "equalizer": throw NSError(domain: "MavrixfyPlayback", code: 4, userInfo: [NSLocalizedDescriptionKey: "AVPlayer does not provide built-in EQ processing."])
    default: throw NSError(domain: "MavrixfyPlayback", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unknown playback command."])
    }
    return snapshot()
  }
}
