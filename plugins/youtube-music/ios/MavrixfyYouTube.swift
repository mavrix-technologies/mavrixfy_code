import Foundation
import React
import YouTubeKit

/// Independent anonymous YouTube Music provider. Does not call any JioSaavn API.
@objc(MavrixfyYouTube)
final class MavrixfyYouTube: NSObject, RCTInvalidating {
    private let lock = NSLock()
    private var jobs: [String: Task<Void, Never>] = [:]
    private let catalog = YouTubeMusicCatalog()
    @objc static func requiresMainQueueSetup() -> Bool { false }

    private func request(_ id: String, resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock,
                         operation: @escaping () async throws -> Any) {
        let task = Task {
            do {
                let value = try await operation()
                try Task.checkCancellation()
                resolve(value)
            } catch is CancellationError {
                reject("YOUTUBE_CANCELLED", "YouTube request cancelled", nil)
            } catch {
                reject("YOUTUBE_UNAVAILABLE", "Mavrixfy Music could not load this item. Please retry.", nil)
            }
            self.removeJob(id)
        }
        lock.lock(); jobs[id]?.cancel(); jobs[id] = task; lock.unlock()
        // The JS deadline rejects at 26 seconds; native cancellation also stops URLSession work.
        Task { try? await Task.sleep(nanoseconds: 25_000_000_000); self.cancel(id) }
    }
    private func removeJob(_ id: String) { lock.lock(); jobs.removeValue(forKey: id); lock.unlock() }
    @objc func cancel(_ id: String) { lock.lock(); let job = jobs.removeValue(forKey: id); lock.unlock(); job?.cancel() }
    @objc func rejectStream(_ resolutionId: String) {
        // Each extraction creates a new YouTube instance; JS evicts the exact failed descriptor.
    }
    @objc func invalidate() {
        lock.lock(); let pending = Array(jobs.values); jobs.removeAll(); lock.unlock()
        pending.forEach { $0.cancel() }
        Task { await catalog.clear() }
    }

    @objc(search:filter:requestId:resolver:rejecter:)
    func search(_ query: String, filter: String, requestId: String,
                resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        request(requestId, resolve: resolve, reject: reject) { try await self.catalog.search(query, filter: filter) }
    }
    @objc(playlist:cursor:requestId:resolver:rejecter:)
    func playlist(_ playlistId: String, cursor: String, requestId: String,
                  resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        request(requestId, resolve: resolve, reject: reject) { try await self.catalog.playlist(playlistId, cursor: cursor) }
    }
    @objc(related:requestId:resolver:rejecter:)
    func related(_ videoId: String, requestId: String,
                 resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        request(requestId, resolve: resolve, reject: reject) { try await self.catalog.related(videoId) }
    }
    @objc(resolveStream:quality:requestId:resolver:rejecter:)
    func resolveStream(_ videoId: String, quality: String, requestId: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        request(requestId, resolve: resolve, reject: reject) {
            guard videoId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { throw CatalogError.invalidID }
            // Explicitly local only: no hosted extractor and no alternate song provider.
            let streams = try await YouTube(videoID: videoId, methods: [.local]).streams
            let audio = streams.filterAudioOnly().filter { $0.fileExtension == .m4a && $0.isNativelyPlayable }
                .sorted { ($0.bitrate ?? $0.averageBitrate ?? 0) < ($1.bitrate ?? $1.averageBitrate ?? 0) }
            guard let stream = (quality == "low" ? audio.first : audio.last),
                  stream.url.scheme == "https" else { throw CatalogError.noAudio }
            let expiryText = URLComponents(url: stream.url, resolvingAgainstBaseURL: false)?.queryItems?
                .first(where: { $0.name == "expire" })?.value
            let expiry = expiryText.flatMap { Double($0) }
            return ["videoId": videoId, "resolutionId": UUID().uuidString, "url": stream.url.absoluteString,
                    "mimeType": "audio/mp4", "codec": "aac", "bitrate": stream.bitrate ?? stream.averageBitrate ?? 0,
                    "expiresAt": (expiry ?? Date().timeIntervalSince1970 + 300) * 1000,
                    "clientProfile": "YOUTUBEKIT_LOCAL", "headers": ["User-Agent": YouTubeMusicCatalog.userAgent,
                    "Origin": "https://www.youtube.com", "Referer": "https://www.youtube.com/"]] as [String: Any]
        }
    }
}

private enum CatalogError: Error { case invalidID, invalidResponse, incompletePage, noAudio }

private actor YouTubeMusicCatalog {
    static let userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
    private let session: URLSession
    private var version: String?
    private struct Cursor { let playlist: String; let continuation: String; let created: Date }
    private var cursors: [String: Cursor] = [:]
    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 24
        session = URLSession(configuration: configuration)
    }
    func clear() { cursors.removeAll(); session.invalidateAndCancel() }
    private func clientVersion() async throws -> String {
        if let version { return version }
        var request = URLRequest(url: URL(string: "https://music.youtube.com/")!)
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
        let (data, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let html = String(data: data, encoding: .utf8),
              let expression = try? NSRegularExpression(pattern: #""INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)""#),
              let match = expression.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
              let range = Range(match.range(at: 1), in: html) else { throw CatalogError.invalidResponse }
        let found = String(html[range]); version = found; return found
    }
    private func post(_ endpoint: String, _ fields: [String: Any]) async throws -> [String: Any] {
        let version = try await clientVersion()
        var body = fields
        body["context"] = ["client": ["clientName": "WEB_REMIX", "clientVersion": version, "hl": "en", "gl": "IN"]]
        var request = URLRequest(url: URL(string: "https://music.youtube.com/youtubei/v1/\(endpoint)?prettyPrint=false")!)
        request.httpMethod = "POST"; request.httpBody = try JSONSerialization.data(withJSONObject: body)
        for (key, value) in ["Content-Type": "application/json", "User-Agent": Self.userAgent,
                             "Origin": "https://music.youtube.com", "Referer": "https://music.youtube.com/",
                             "X-Youtube-Client-Name": "67", "X-Youtube-Client-Version": version] {
            request.setValue(value, forHTTPHeaderField: key)
        }
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any], json["error"] == nil else { throw CatalogError.invalidResponse }
        return json
    }
    func search(_ query: String, filter: String) async throws -> [String: Any] {
        var songs: [[String: Any]] = [], playlists: [[String: Any]] = []
        if filter != "playlists" {
            let json = try await post("search", ["query": query, "params": "EgWKAQIIAWoKEAkQBRAKEAMQBA=="])
            songs = Self.renderers(json, "musicResponsiveListItemRenderer").compactMap(Self.song)
        }
        if filter != "songs" {
            let json = try await post("search", ["query": query, "params": "Eg-KAQwIABAAGAAgACgB"])
            playlists = Self.renderers(json, "musicResponsiveListItemRenderer").compactMap(Self.playlistItem)
        }
        return ["songs": songs, "playlists": playlists]
    }
    func playlist(_ id: String, cursor: String) async throws -> [String: Any] {
        guard id.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { throw CatalogError.invalidID }
        var fields: [String: Any] = ["browseId": "VL" + id]
        if !cursor.isEmpty {
            guard let saved = cursors[cursor], saved.playlist == id, Date().timeIntervalSince(saved.created) < 600 else { throw CatalogError.incompletePage }
            fields = ["continuation": saved.continuation]
        }
        let json = try await post("browse", fields)
        let shelf = Self.renderers(json, "musicPlaylistShelfRenderer").first
            ?? Self.renderers(json, "musicPlaylistShelfContinuation").first
            ?? Self.renderers(json, "appendContinuationItemsAction").first
        guard let shelf else { throw CatalogError.incompletePage }
        let items = Self.renderers(shelf, "musicResponsiveListItemRenderer").compactMap(Self.song)
        let next = Self.renderers(shelf, "nextContinuationData").first?["continuation"] as? String
            ?? Self.renderers(shelf, "continuationCommand").first?["token"] as? String ?? ""
        var token = ""
        cursors = cursors.filter { Date().timeIntervalSince($0.value.created) < 600 }
        if cursors.count >= 100 { cursors.removeAll() }
        if !next.isEmpty { token = UUID().uuidString; cursors[token] = Cursor(playlist: id, continuation: next, created: Date()) }
        cursors.removeValue(forKey: cursor)
        let header = Self.renderers(json, "musicDetailHeaderRenderer").first ?? Self.renderers(json, "musicResponsiveHeaderRenderer").first ?? [:]
        return ["songs": items, "cursor": token, "name": Self.text(header["title"]), "coverUrl": Self.thumbnail(header), "songCount": items.count]
    }
    func related(_ videoId: String) async throws -> [[String: Any]] {
        guard videoId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { throw CatalogError.invalidID }
        let json = try await post("next", ["videoId": videoId, "playlistId": "RDAMVM" + videoId, "isAudioOnly": true])
        return Self.renderers(json, "playlistPanelVideoRenderer").compactMap { item in
            guard let id = item["videoId"] as? String else { return nil }
            return ["videoId": id, "title": Self.text(item["title"]), "artist": Self.text(item["longBylineText"]),
                    "coverUrl": Self.thumbnail(item), "duration": Self.duration(Self.text(item["lengthText"]))]
        }
    }
    private static func renderers(_ node: Any, _ key: String) -> [[String: Any]] {
        if let dictionary = node as? [String: Any] {
            if let item = dictionary[key] as? [String: Any] { return [item] }
            return dictionary.values.flatMap { renderers($0, key) }
        }
        return (node as? [Any] ?? []).flatMap { renderers($0, key) }
    }
    private static func text(_ node: Any?) -> String {
        guard let value = node as? [String: Any] else { return "" }
        return value["simpleText"] as? String ?? (value["runs"] as? [[String: Any]] ?? []).compactMap { $0["text"] as? String }.joined()
    }
    private static func thumbnail(_ node: Any) -> String {
        let thumbnail = (renderers(node, "musicThumbnailRenderer").first?["thumbnail"] as? [String: Any])
            ?? ((node as? [String: Any])?["thumbnail"] as? [String: Any])
        let images = thumbnail?["thumbnails"] as? [[String: Any]]
        return images?.last?["url"] as? String ?? ""
    }
    private static func columns(_ item: [String: Any]) -> [String] {
        (item["flexColumns"] as? [[String: Any]] ?? []).map { text(($0["musicResponsiveListItemFlexColumnRenderer"] as? [String: Any])?["text"]) }
    }
    private static func song(_ item: [String: Any]) -> [String: Any]? {
        let id = (item["playlistItemData"] as? [String: Any])?["videoId"] as? String
            ?? renderers(item, "watchEndpoint").first?["videoId"] as? String
        guard let id, id.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { return nil }
        let labels = columns(item)
        let durations = renderers(item, "musicResponsiveListItemFixedColumnRenderer").map { text($0["text"]) }
        let artist = labels.dropFirst().first?.components(separatedBy: " • ").first ?? "Mavrixfy Music"
        return ["videoId": id, "title": labels.first ?? "", "artist": artist,
                "coverUrl": thumbnail(item), "duration": duration(durations.first ?? labels.last?.components(separatedBy: " • ").last ?? "")]
    }
    private static func playlistItem(_ item: [String: Any]) -> [String: Any]? {
        guard let browse = renderers(item, "browseEndpoint").compactMap({ $0["browseId"] as? String }).first(where: { $0.hasPrefix("VL") }) else { return nil }
        let id = String(browse.dropFirst(2)), labels = columns(item)
        return ["id": id, "name": labels.first ?? "", "coverUrl": thumbnail(item), "songCount": 0,
                "url": "https://music.youtube.com/playlist?list=\(id)", "description": labels.dropFirst().joined(separator: " • ")]
    }
    private static func duration(_ label: String) -> Int {
        let parts = label.split(separator: ":").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        return parts.count >= 2 && parts.count <= 3 ? parts.reduce(0) { $0 * 60 + $1 } : 0
    }
}
