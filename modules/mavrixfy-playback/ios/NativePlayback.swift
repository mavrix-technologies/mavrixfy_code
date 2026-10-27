import AVFoundation
import MediaPlayer
import UIKit
import OSLog

/** Process lifetime is independent of normal/StandBy screen presentation. */
final class NativePlayback {
  static let shared = NativePlayback()
  let player = AVQueuePlayer()
  var emit: ((String, [String: Any]) -> Void)?
  private var tracks = [[String: Any]]()
  private var itemIndices = [ObjectIdentifier: Int]()
  private let queueWindowSize = 3
  private let playbackLog = Logger(subsystem: "com.mavrixfy.playback", category: "Playback")
  private var index = -1
  private var intendedPlay = false
  private var revision = 0
  private var interruptionRevision: Int?
  private var repeatMode = "off"
  private var sourceChangePending = false
  private weak var publishedItem: AVPlayerItem?
  private var publishedIndex = -1
  private weak var observedItem: AVPlayerItem?
  private var artworkURL: String?
  private var artworkTask: URLSessionDataTask?
  private var artwork: MPMediaItemArtwork?
  private var observations = [NSKeyValueObservation]()
  private var notifications = [NSObjectProtocol]()
  private var progressObserver: Any?
  private var itemObservation: NSKeyValueObservation?
  private var failedItem: ObjectIdentifier?
  private init() {
    player.automaticallyWaitsToMinimizeStalling = true
    observations.append(player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async {
        guard let self else { return }
        self.reconcileItem()
        self.event("playback-state", ["state": self.status(), "trackId": self.tracks.indices.contains(self.index) ? self.tracks[self.index]["id"] ?? "" : ""])
        self.nowPlaying()
      }
    })
    observations.append(player.observe(\.currentItem, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.reconcileItem() }
    })
    progressObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] _ in
      guard let self, let item = self.player.currentItem,
        let currentIndex = self.itemIndices[ObjectIdentifier(item)], self.tracks.indices.contains(currentIndex) else { return }
      if currentIndex != self.index { self.reconcileItem() }
      self.event("playback-progress", ["position": self.position(), "duration": self.duration(), "buffered": self.bufferedPosition(), "track": currentIndex, "trackId": self.tracks[currentIndex]["id"] ?? ""])
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
        if resume { do { try self.play(); self.event("playback-interruption", ["resumed": true]) } catch { self.fail(error.localizedDescription) } }
      }
    })
    notifications.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] event in
      guard let raw = event.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
        raw == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
      self?.event("remote-pause"); self?.pause()
    })
    notifications.append(center.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] event in
      guard let self, let ended = event.object as? AVPlayerItem, let endedIndex = self.itemIndices[ObjectIdentifier(ended)] else { return }
      if self.repeatMode == "track", self.intendedPlay {
        guard self.player.currentItem === ended else { return }
        let revision = self.revision
        self.player.seek(to: .zero) { [weak self] finished in
          DispatchQueue.main.async {
            guard let self, finished, self.revision == revision, self.interruptionRevision == nil,
              self.player.currentItem === ended, self.intendedPlay else { return }
            self.player.play()
          }
        }
      }
      else {
        // End notifications can arrive before AVQueuePlayer removes the old
        // item. Inspect the resulting queue on the next main-loop turn.
        let revision = self.revision
        DispatchQueue.main.async {
          guard self.revision == revision, !self.sourceChangePending,
            self.player.currentItem == nil else { return }
          self.index = endedIndex
          if endedIndex == self.tracks.count - 1, self.repeatMode == "queue",
            self.intendedPlay, self.isPrepared(self.tracks[0]) {
            do { try self.select(0, 0) } catch { self.fail(error.localizedDescription) }
            return
          }
          let reason = endedIndex < self.tracks.count - 1 || self.repeatMode == "queue" ? "unresolved-next" : "completed"
          self.event("playback-queue-ended", ["reason": reason, "trackId": self.tracks[endedIndex]["id"] ?? "", "index": endedIndex])
          self.nowPlaying()
        }
      }
      if ended !== self.player.currentItem { self.itemIndices.removeValue(forKey: ObjectIdentifier(ended)) }
    })
    notifications.append(center.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: nil, queue: .main) { [weak self] event in
      guard let self, let item = event.object as? AVPlayerItem, item === self.player.currentItem else { return }
      self.failItem(item, error: event.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error)
    })
    let commands = MPRemoteCommandCenter.shared()
    commands.playCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      return self.onMain {
        do { self.event("remote-play"); try self.play(); return .success }
        catch { self.fail(error.localizedDescription); return .commandFailed }
      }
    }
    commands.pauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      return self.onMain { self.event("remote-pause"); self.pause(); return .success }
    }
    commands.stopCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      return self.onMain { self.event("remote-stop"); self.pause(); return .success }
    }
    commands.nextTrackCommand.addTarget { [weak self] _ in self?.remoteSkip(forward: true) ?? .commandFailed }
    commands.previousTrackCommand.addTarget { [weak self] _ in self?.remoteSkip(forward: false) ?? .commandFailed }
    commands.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let self, let change = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      return self.onMain { self.reconcileItem(); self.seek(change.positionTime); return .success }
    }
  }
  private func onMain(_ action: () -> MPRemoteCommandHandlerStatus) -> MPRemoteCommandHandlerStatus {
    Thread.isMainThread ? action() : DispatchQueue.main.sync(execute: action)
  }
  func remoteSkip(forward: Bool) -> MPRemoteCommandHandlerStatus {
    if !Thread.isMainThread { return DispatchQueue.main.sync { self.remoteSkip(forward: forward) } }
    // A second lock-screen tap during JS resolution belongs to that pending
    // selection, rather than the outgoing item still retained by AVPlayer.
    if sourceChangePending {
      guard emit != nil else { return .commandFailed }
      event(forward ? "remote-next" : "remote-previous")
      return .success
    }
    reconcileItem()
    guard tracks.indices.contains(index) else { return .noActionableNowPlayingItem }
    let target: Int
    if forward { target = index + 1 < tracks.count ? index + 1 : (repeatMode == "queue" ? 0 : -1) }
    else { target = position() > 3 ? index : (index > 0 ? index - 1 : (repeatMode == "queue" ? tracks.count - 1 : 0)) }
    guard tracks.indices.contains(target) else { return .noSuchContent }
    if !isPrepared(tracks[target]) {
      guard emit != nil else { return .commandFailed }
      event(forward ? "remote-next" : "remote-previous")
      return .success
    }
    do { try select(target, 0, externalSelection: true); return .success }
    catch { return .commandFailed }
  }
  private func isPrepared(_ track: [String: Any]) -> Bool {
    guard let raw = track["url"] as? String, let url = URL(string: raw),
      ["https", "http", "file"].contains(url.scheme?.lowercased() ?? "") else { return false }
    if url.isFileURL { return true }
    if let expiry = track["youtubeAudioExpiresAt"] as? Double,
      expiry > 0, expiry <= Date().timeIntervalSince1970 * 1000 + 120_000 { return false }
    return true
  }
  private func event(_ name: String, _ body: [String: Any] = [:]) { emit?(name, body) }
  private func position() -> Double { let value = player.currentTime().seconds; return value.isFinite ? max(0, value) : 0 }
  private func duration() -> Double {
    return player.currentItem.map { PlaybackTimeline.duration($0) } ?? 0
  }
  private func bufferedPosition() -> Double {
    let currentPosition = position()
    return player.currentItem?.loadedTimeRanges.compactMap { value -> Double? in
      let range = value.timeRangeValue
      let start = range.start.seconds
      let end = CMTimeRangeGetEnd(range).seconds
      guard start.isFinite, end.isFinite, start <= currentPosition, end >= currentPosition else { return nil }
      return max(0, end)
    }.max() ?? 0
  }
  private func status() -> String {
    if player.currentItem?.status == .failed { return "error" }
    if tracks.isEmpty { return "none" }
    if player.currentItem == nil { return "ended" }
    if player.timeControlStatus == .playing { return "playing" }
    if player.timeControlStatus == .waitingToPlayAtSpecifiedRate { return "buffering" }
    return "paused"
  }
  func snapshot() -> [String: Any] {
    reconcileItem()
    return ["queue": tracks, "index": index, "state": status(), "position": position(), "duration": duration(), "buffered": bufferedPosition(), "playWhenReady": intendedPlay, "equalizerAvailable": false]
  }
  private func activate() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [])
    try session.setActive(true)
  }
  private func play() throws {
    revision += 1; intendedPlay = true
    if sourceChangePending {
      event("playback-play-when-ready", ["playWhenReady": true])
      return
    }
    if tracks.indices.contains(index), player.currentItem == nil || player.currentItem?.status == .failed {
      try select(index, player.currentItem == nil ? 0 : position())
    }
    try activate(); player.play(); event("playback-play-when-ready", ["playWhenReady": true]); nowPlaying()
  }
  private func pause() { revision += 1; interruptionRevision = nil; intendedPlay = false; player.pause(); event("playback-play-when-ready", ["playWhenReady": false, "reason": "pause"]); nowPlaying() }
  private func seek(_ seconds: Double) {
    guard seconds.isFinite else { return }
    let item = player.currentItem
    let end = duration()
    let target = end > 0 ? min(max(0, seconds), end) : max(0, seconds)
    player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
      DispatchQueue.main.async { guard let self, finished, self.player.currentItem === item, self.tracks.indices.contains(self.index) else { return }; self.event("playback-progress", ["position": self.position(), "duration": self.duration(), "track": self.index, "trackId": self.tracks[self.index]["id"] ?? ""]); self.nowPlaying() }
    }
  }
  private func streamURL(_ track: [String: Any]) throws -> URL {
    guard let raw = track["url"] as? String, let url = URL(string: raw),
      ["https", "http", "file"].contains(url.scheme?.lowercased() ?? "") else {
      throw NSError(domain: "MavrixfyPlayback", code: 1, userInfo: [NSLocalizedDescriptionKey: "Playback stream is not ready. Select the song again."])
    }
    return url
  }
  private func makeItem(_ track: [String: Any]) throws -> AVPlayerItem {
    let url = try streamURL(track)
    let asset = AVURLAsset(url: url, options: [
      AVURLAssetPreferPreciseDurationAndTimingKey: true,
      "AVURLAssetHTTPHeaderFieldsKey": track["headers"] as? [String: String] ?? [:]
    ])
    let item = AVPlayerItem(asset: asset, automaticallyLoadedAssetKeys: ["tracks", "duration"])
    PlaybackTimeline.configure(item, streamDuration: track["playbackDurationSeconds"] as? Double)
    return item
  }
  private func select(_ next: Int, _ seconds: Double, preserveCurrent: Bool = false, externalSelection: Bool = false) throws {
    guard tracks.indices.contains(next) else { throw NSError(domain: "MavrixfyPlayback", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid queue index."]) }
    let retained = preserveCurrent && player.currentItem?.status != .failed ? player.currentItem : nil
    let selected = try retained ?? makeItem(tracks[next])
    sourceChangePending = false
    if retained != nil { PlaybackTimeline.configure(selected, streamDuration: tracks[next]["playbackDurationSeconds"] as? Double) }
    // Updating only the upcoming window must preserve an active interruption's
    // resume intent. Only an actual source/selection change invalidates it.
    if retained == nil { revision += 1; interruptionRevision = nil }
    if retained == nil { player.pause(); player.removeAllItems() }
    else { player.items().filter { $0 !== retained }.forEach { player.remove($0) } }
    itemIndices = [ObjectIdentifier(selected): next]
    failedItem = nil
    if retained == nil { player.insert(selected, after: nil) }
    fillQueueWindow(from: next)
    index = next; if retained == nil { seek(seconds) }; reconcileItem(externalSelection: externalSelection)
    if intendedPlay && retained == nil { try activate(); player.play() }
  }
  private func fillQueueWindow(from currentIndex: Int) {
    // AVQueuePlayer starts loading inserted assets. Keep the logical playlist
    // in tracks; enqueue only the current item and two resolved successors.
    var queued = player.items()
    while queued.count < queueWindowSize {
      let next = currentIndex + queued.count
      guard tracks.indices.contains(next), isPrepared(tracks[next]) else { break }
      do {
        let item = try makeItem(tracks[next])
        guard player.canInsert(item, after: nil) else { break }
        itemIndices[ObjectIdentifier(item)] = next
        player.insert(item, after: nil)
        queued.append(item)
      } catch { break }
    }
  }
  private func reconcileItem(externalSelection: Bool = false) {
    guard let current = player.currentItem, let currentIndex = itemIndices[ObjectIdentifier(current)], tracks.indices.contains(currentIndex) else { return }
    index = currentIndex
    fillQueueWindow(from: currentIndex)
    if observedItem !== current {
      observedItem = current
      itemObservation = current.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
        DispatchQueue.main.async {
          guard let self, item === self.player.currentItem,
            let itemIndex = self.itemIndices[ObjectIdentifier(item)] else { return }
          if item.status == .failed { self.failItem(item) }
          else if item.status == .readyToPlay, self.tracks.indices.contains(itemIndex) {
            let track = self.tracks[itemIndex]
            let measured = item.duration.seconds
            let resolved = track["playbackDurationSeconds"] as? Double ?? 0
            let catalog = track["duration"] as? Double ?? 0
            self.playbackLog.info("Ready track=\(track["id"] as? String ?? "unknown", privacy: .public) itemSeconds=\(measured) streamSeconds=\(resolved) catalogSeconds=\(catalog)")
          }
        }
      }
    }
    if publishedItem !== current || publishedIndex != index || externalSelection {
      publishedItem = current
      publishedIndex = index
      event("playback-active-track", ["index": index, "track": tracks[index], "externalSelection": externalSelection])
      nowPlaying()
    }
  }
  private func failItem(_ item: AVPlayerItem, error: Error? = nil) {
    guard item === player.currentItem, let currentIndex = itemIndices[ObjectIdentifier(item)] else { return }
    index = currentIndex
    let identity = ObjectIdentifier(item)
    guard failedItem != identity else { return }
    failedItem = identity
    let nativeError = error ?? item.error
    let log = item.errorLog()?.events.last
    if let log {
      playbackLog.error("Stream error domain=\(log.errorDomain ?? "unknown", privacy: .public) code=\(log.errorStatusCode, privacy: .public)")
    }
    fail(nativeError?.localizedDescription ?? "Native audio stream failed.", error: nativeError)
  }
  private func fail(_ message: String, error: Error? = nil) {
    pause()
    var details: [String: Any] = ["trackId": tracks.indices.contains(index) ? tracks[index]["id"] ?? "" : "", "message": message]
    if let nativeError = error as NSError? {
      details["code"] = "\(nativeError.domain):\(nativeError.code)"
      playbackLog.error("Playback error domain=\(nativeError.domain, privacy: .public) code=\(nativeError.code, privacy: .public)")
      if let underlying = nativeError.userInfo[NSUnderlyingErrorKey] as? NSError {
        details["underlyingCode"] = "\(underlying.domain):\(underlying.code)"
        playbackLog.error("Underlying error domain=\(underlying.domain, privacy: .public) code=\(underlying.code, privacy: .public)")
      }
    }
    event("playback-error", details)
  }
  private func nowPlaying() {
    guard tracks.indices.contains(index) else {
      artworkTask?.cancel(); artworkTask = nil; artworkURL = nil; artwork = nil
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      MPRemoteCommandCenter.shared().nextTrackCommand.isEnabled = false
      MPRemoteCommandCenter.shared().previousTrackCommand.isEnabled = false
      return
    }
    let currentIndex = player.currentItem.flatMap { itemIndices[ObjectIdentifier($0)] } ?? index
    guard tracks.indices.contains(currentIndex) else { return }
    let track = tracks[currentIndex]
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
    var info = [String: Any]()
    info[MPMediaItemPropertyTitle] = track["title"] ?? ""
    info[MPMediaItemPropertyArtist] = track["artist"] ?? ""
    info[MPMediaItemPropertyAlbumTitle] = track["album"] ?? ""
    info[MPMediaItemPropertyPlaybackDuration] = duration()
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position()
    info[MPNowPlayingInfoPropertyPlaybackRate] = player.timeControlStatus == .playing ? 1.0 : 0.0
    info[MPMediaItemPropertyArtwork] = artwork
    info[MPNowPlayingInfoPropertyExternalContentIdentifier] = track["id"] ?? ""
    info[MPNowPlayingInfoPropertyPlaybackQueueIndex] = currentIndex
    info[MPNowPlayingInfoPropertyPlaybackQueueCount] = tracks.count
    MPRemoteCommandCenter.shared().nextTrackCommand.isEnabled = currentIndex + 1 < tracks.count || repeatMode == "queue"
    MPRemoteCommandCenter.shared().previousTrackCommand.isEnabled = true
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }
  func command(_ name: String, _ args: [String: Any]) throws -> [String: Any] {
    // KVO delivery is asynchronous. Never interpret a JS update or snapshot
    // using yesterday's index after AVQueuePlayer has already advanced.
    reconcileItem()
    let next = try PlaybackCommandValues.index(args["index"])
    let seconds = args["position"] as? Double ?? 0
    switch name {
    case "setQueue":
      let old = tracks.indices.contains(index) ? tracks[index] : nil
      let incoming = args["tracks"] as? [[String: Any]] ?? []
      if !incoming.isEmpty {
        guard incoming.indices.contains(next) else { throw NSError(domain: "MavrixfyPlayback", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid queue index."]) }
        _ = try streamURL(incoming[next])
      }
      let preserve = args["preserveCurrentTrack"] as? Bool == true && incoming.indices.contains(next) && old?["id"] as? String == incoming[next]["id"] as? String && old?["url"] as? String == incoming[next]["url"] as? String && (old?["headers"] as? [String: String] ?? [:]) == (incoming[next]["headers"] as? [String: String] ?? [:])
      tracks = incoming
      if tracks.isEmpty { pause(); player.removeAllItems(); itemIndices = [:]; index = -1 } else { try select(next, seconds, preserveCurrent: preserve) }
    case "play": try play()
    case "begin": revision += 1; sourceChangePending = true; intendedPlay = true; player.pause(); event("playback-play-when-ready", ["playWhenReady": false, "reason": "source-change"])
    case "pause": pause()
    case "stop": pause(); seek(0)
    case "seek": seek(seconds)
    case "skip": try select(next, seconds)
    case "reset": pause(); sourceChangePending = false; player.removeAllItems(); itemIndices = [:]; tracks = []; index = -1; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    case "repeat": repeatMode = args["mode"] as? String ?? "off"; player.actionAtItemEnd = repeatMode == "track" ? .pause : .advance
    case "volume": player.volume = Float(max(0, min(1, args["volume"] as? Double ?? 1)))
    case "update":
      if tracks.indices.contains(next) {
        if let expected = args["expectedTrackId"] as? String, expected != tracks[next]["id"] as? String { return snapshot() }
        if args["onlyCurrent"] as? Bool == true && next != index { return snapshot() }
        if args["onlyUpcoming"] as? Bool == true && next <= index { return snapshot() }
        let metadata = args["metadata"] as? [String: Any] ?? [:]; let oldURL = tracks[next]["url"] as? String
        let oldHeaders = tracks[next]["headers"] as? [String: String] ?? [:]
        tracks[next].merge(metadata) { _, new in new }
        if oldURL != tracks[next]["url"] as? String || oldHeaders != (tracks[next]["headers"] as? [String: String] ?? [:]) {
          if next == index || player.currentItem != nil { try select(index, position(), preserveCurrent: next != index) }
        }
        else {
          for item in player.items() where itemIndices[ObjectIdentifier(item)] == next {
            PlaybackTimeline.configure(item, streamDuration: tracks[next]["playbackDurationSeconds"] as? Double)
          }
          nowPlaying()
        }
      }
    case "add": let at = max(0, min(tracks.count, next)); let additions = args["tracks"] as? [[String: Any]] ?? []; tracks.insert(contentsOf: additions, at: at); if index >= 0 { try select(at <= index ? index + additions.count : index, position(), preserveCurrent: true) } else if !tracks.isEmpty { try select(0, 0) }
    case "remove": if tracks.indices.contains(next) { let preserve = next != index; let retainedPosition = preserve ? position() : 0; tracks.remove(at: next); if tracks.isEmpty { pause(); player.removeAllItems(); itemIndices = [:]; index = -1 } else { try select(min(index > next ? index - 1 : index, tracks.count - 1), retainedPosition, preserveCurrent: preserve) } }
    case "move": if tracks.indices.contains(next), let value = args["to"] {
      let to = try PlaybackCommandValues.index(value)
      guard tracks.indices.contains(to) else { break }
      var selected = index
      if next == index { selected = to } else if next < index && to >= index { selected -= 1 } else if next > index && to <= index { selected += 1 }
      tracks.insert(tracks.remove(at: next), at: to); try select(selected, position(), preserveCurrent: true)
    }
    case "equalizer": throw NSError(domain: "MavrixfyPlayback", code: 4, userInfo: [NSLocalizedDescriptionKey: "AVPlayer does not provide built-in EQ processing."])
    default: throw NSError(domain: "MavrixfyPlayback", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unknown playback command."])
    }
    nowPlaying()
    return snapshot()
  }
}
