const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withXcodeProject,
  withInfoPlist,
  withEntitlementsPlist,
} = require("expo/config-plugins");

const CARPLAY_SCENE_DELEGATE_SWIFT = `import CarPlay
import Foundation
import UIKit

@available(iOS 14.0, *)
@objc(MavrixfyCarPlaySceneDelegate)
public final class MavrixfyCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  public static weak var shared: MavrixfyCarPlaySceneDelegate?

  public var interfaceController: CPInterfaceController?
  public var carWindow: CPWindow?

  private var playlistsTemplate: CPListTemplate?
  private var favoritesTemplate: CPListTemplate?
  private var recentTemplate: CPListTemplate?
  private var tabBarTemplate: CPTabBarTemplate?

  private var cachedPlaylists: [[String: Any]] = []
  private var cachedFavorites: [[String: Any]] = []
  private var cachedRecent: [[String: Any]] = []

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController,
    to window: CPWindow
  ) {
    MavrixfyCarPlaySceneDelegate.shared = self
    self.interfaceController = interfaceController
    self.carWindow = window

    setupCarPlayTemplates()
    MavrixfyCarPlayModule.shared?.sendCarPlayConnectionEvent(connected: true)
  }

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController,
    from window: CPWindow
  ) {
    if MavrixfyCarPlaySceneDelegate.shared === self {
      MavrixfyCarPlaySceneDelegate.shared = nil
    }
    self.interfaceController = nil
    self.carWindow = nil
    MavrixfyCarPlayModule.shared?.sendCarPlayConnectionEvent(connected: false)
  }

  private func setupCarPlayTemplates() {
    guard let interfaceController = interfaceController else { return }

    // 1. Now Playing Tab
    let nowPlayingTemplate = CPNowPlayingTemplate.shared
    nowPlayingTemplate.tabTitle = "Now Playing"
    nowPlayingTemplate.tabSystemItem = .more

    // 2. Playlists Tab
    let playlists = CPListTemplate(title: "Playlists", sections: buildPlaylistsSections())
    playlists.tabTitle = "Playlists"
    playlists.tabSystemItem = .bookmarks
    self.playlistsTemplate = playlists

    // 3. Favorites Tab
    let favorites = CPListTemplate(title: "Favorites", sections: buildSongsSections(songs: cachedFavorites, emptyMessage: "No favorites yet"))
    favorites.tabTitle = "Favorites"
    favorites.tabSystemItem = .favorites
    self.favoritesTemplate = favorites

    // 4. Recently Played Tab
    let recent = CPListTemplate(title: "Recent", sections: buildSongsSections(songs: cachedRecent, emptyMessage: "No recent songs"))
    recent.tabTitle = "Recent"
    recent.tabSystemItem = .recents
    self.recentTemplate = recent

    let tabBar = CPTabBarTemplate(templates: [nowPlayingTemplate, playlists, favorites, recent])
    self.tabBarTemplate = tabBar

    interfaceController.setRootTemplate(tabBar, animated: false, completion: nil)
  }

  private func buildPlaylistsSections() -> [CPListSection] {
    if cachedPlaylists.isEmpty {
      let emptyItem = CPListItem(text: "No Playlists", detailText: "Create playlists in the app")
      emptyItem.isEnabled = false
      return [CPListSection(items: [emptyItem])]
    }

    let items: [CPListItem] = cachedPlaylists.map { playlist in
      let name = (playlist["name"] as? String) ?? "Untitled Playlist"
      let songCount = (playlist["songCount"] as? Int) ?? ((playlist["songs"] as? [Any])?.count ?? 0)
      let detail = songCount == 1 ? "1 song" : "\\(songCount) songs"
      let item = CPListItem(text: name, detailText: detail)
      item.accessoryType = .disclosureIndicator
      item.handler = { [weak self] _, completion in
        self?.handlePlaylistSelect(playlist: playlist)
        completion()
      }
      return item
    }

    return [CPListSection(items: items)]
  }

  private func buildSongsSections(songs: [[String: Any]], emptyMessage: String) -> [CPListSection] {
    if songs.isEmpty {
      let emptyItem = CPListItem(text: emptyMessage, detailText: nil)
      emptyItem.isEnabled = false
      return [CPListSection(items: [emptyItem])]
    }

    let items: [CPListItem] = songs.map { song in
      let title = (song["title"] as? String) ?? (song["name"] as? String) ?? "Unknown Track"
      let artist = (song["artist"] as? String) ?? "Mavrixfy"
      let item = CPListItem(text: title, detailText: artist)
      item.handler = { [weak self] _, completion in
        self?.handleSongSelect(song: song)
        completion()
      }
      return item
    }

    return [CPListSection(items: items)]
  }

  private func handlePlaylistSelect(playlist: [String: Any]) {
    let playlistName = (playlist["name"] as? String) ?? "Playlist"
    let songs = (playlist["songs"] as? [[String: Any]]) ?? []

    let sections = buildSongsSections(songs: songs, emptyMessage: "Playlist is empty")
    let listTemplate = CPListTemplate(title: playlistName, sections: sections)

    interfaceController?.pushTemplate(listTemplate, animated: true, completion: nil)
  }

  private func handleSongSelect(song: [String: Any]) {
    guard let songId = song["id"] as? String else { return }
    MavrixfyCarPlayModule.shared?.sendPlaySongEvent(songId: songId, songData: song)
    interfaceController?.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
  }

  public func updatePlaylists(playlists: [[String: Any]]) {
    cachedPlaylists = playlists
    playlistsTemplate?.updateSections(buildPlaylistsSections())
  }

  public func updateFavorites(songs: [[String: Any]]) {
    cachedFavorites = songs
    favoritesTemplate?.updateSections(buildSongsSections(songs: songs, emptyMessage: "No favorites yet"))
  }

  public func updateRecent(songs: [[String: Any]]) {
    cachedRecent = songs
    recentTemplate?.updateSections(buildSongsSections(songs: songs, emptyMessage: "No recent songs"))
  }
}
`;

const CARPLAY_MODULE_SWIFT = `import CarPlay
import Foundation
import React

@objc(MavrixfyCarPlayModule)
public final class MavrixfyCarPlayModule: RCTEventEmitter {
  public static weak var shared: MavrixfyCarPlayModule?
  private var hasListeners = false

  public override init() {
    super.init()
    MavrixfyCarPlayModule.shared = self
  }

  public override static func requiresMainQueueSetup() -> Bool {
    true
  }

  public override func supportedEvents() -> [String]! {
    [
      "onCarPlayConnectionChanged",
      "onCarPlayPlaySong",
      "onCarPlayPlayPlaylist"
    ]
  }

  public override func startObserving() {
    hasListeners = true
  }

  public override func stopObserving() {
    hasListeners = false
  }

  @objc(isConnected:rejecter:)
  public func isConnected(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 14.0, *) {
      let connected = MavrixfyCarPlaySceneDelegate.shared?.interfaceController != nil
      resolve(connected)
    } else {
      resolve(false)
    }
  }

  @objc(updatePlaylists:resolver:rejecter:)
  public func updatePlaylists(
    _ playlists: NSArray,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 14.0, *) {
      let swiftArray = (playlists as? [[String: Any]]) ?? []
      DispatchQueue.main.async {
        MavrixfyCarPlaySceneDelegate.shared?.updatePlaylists(playlists: swiftArray)
        resolve(true)
      }
    } else {
      resolve(false)
    }
  }

  @objc(updateFavorites:resolver:rejecter:)
  public func updateFavorites(
    _ songs: NSArray,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 14.0, *) {
      let swiftArray = (songs as? [[String: Any]]) ?? []
      DispatchQueue.main.async {
        MavrixfyCarPlaySceneDelegate.shared?.updateFavorites(songs: swiftArray)
        resolve(true)
      }
    } else {
      resolve(false)
    }
  }

  @objc(updateRecent:resolver:rejecter:)
  public func updateRecent(
    _ songs: NSArray,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 14.0, *) {
      let swiftArray = (songs as? [[String: Any]]) ?? []
      DispatchQueue.main.async {
        MavrixfyCarPlaySceneDelegate.shared?.updateRecent(songs: swiftArray)
        resolve(true)
      }
    } else {
      resolve(false)
    }
  }

  func sendCarPlayConnectionEvent(connected: Bool) {
    guard hasListeners else { return }
    sendEvent(withName: "onCarPlayConnectionChanged", body: ["connected": connected])
  }

  func sendPlaySongEvent(songId: String, songData: [String: Any]) {
    guard hasListeners else { return }
    sendEvent(withName: "onCarPlayPlaySong", body: ["songId": songId, "song": songData])
  }
}
`;

const CARPLAY_BRIDGE_SOURCE = `#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(MavrixfyCarPlayModule, RCTEventEmitter)

RCT_EXTERN_METHOD(isConnected:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updatePlaylists:(NSArray *)playlists
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateFavorites:(NSArray *)songs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateRecent:(NSArray *)songs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`;

function writeFileIfChanged(filePath, contents) {
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, "utf8");
    if (current === contents) {
      return;
    }
  }
  fs.writeFileSync(filePath, contents, "utf8");
}

const withCarPlay = (config) => {
  // 1. Entitlements Plist: Add carplay-audio entitlement
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.carplay-audio"] = true;
    return config;
  });

  // 2. Info.plist: Add Scene Manifest for CarPlay
  config = withInfoPlist(config, (config) => {
    const sceneManifest = config.modResults.UIApplicationSceneManifest || {};
    sceneManifest.UIApplicationSupportsMultipleScenes = true;

    const sceneConfig = sceneManifest.UISceneConfigurations || {};
    sceneConfig.CPTemplateApplicationSceneSessionRoleApplication = [
      {
        UISceneClassName: "CPTemplateApplicationScene",
        UISceneConfigurationName: "CarPlayConfiguration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).MavrixfyCarPlaySceneDelegate",
      },
    ];

    sceneManifest.UISceneConfigurations = sceneConfig;
    config.modResults.UIApplicationSceneManifest = sceneManifest;
    return config;
  });

  // 3. Write Swift and Objective-C bridge files
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;

      if (!iosRoot || !projectName) {
        return config;
      }

      const targetDir = path.join(iosRoot, projectName);
      fs.mkdirSync(targetDir, { recursive: true });

      writeFileIfChanged(
        path.join(targetDir, "MavrixfyCarPlaySceneDelegate.swift"),
        CARPLAY_SCENE_DELEGATE_SWIFT
      );
      writeFileIfChanged(
        path.join(targetDir, "MavrixfyCarPlayModule.swift"),
        CARPLAY_MODULE_SWIFT
      );
      writeFileIfChanged(
        path.join(targetDir, "MavrixfyCarPlayBridge.m"),
        CARPLAY_BRIDGE_SOURCE
      );

      return config;
    },
  ]);

  // 4. Xcode Project: Add files and link CarPlay.framework
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;

    if (!projectName) {
      return config;
    }

    const target = project.getFirstTarget().uuid;
    const group =
      project.findPBXGroupKey({ name: projectName }) ||
      project.findPBXGroupKey({ path: projectName });

    project.addSourceFile(`${projectName}/MavrixfyCarPlaySceneDelegate.swift`, { target }, group);
    project.addSourceFile(`${projectName}/MavrixfyCarPlayModule.swift`, { target }, group);
    project.addSourceFile(`${projectName}/MavrixfyCarPlayBridge.m`, { target }, group);
    project.addFramework("CarPlay.framework", { target });

    return config;
  });

  return config;
};

module.exports = withCarPlay;
