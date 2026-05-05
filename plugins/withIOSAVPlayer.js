const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");

const SWIFT_SOURCE = `import AVFoundation
import AVKit
import Foundation
import React
import UIKit

@objc(MavrixfyAVPlayer)
final class MavrixfyAVPlayer: RCTEventEmitter {
  private var playerViewController: ManagedAVPlayerViewController?
  private var player: AVPlayer?
  private var timeObserver: Any?
  private var lastKnownDurationSeconds: Double = 0

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["MavrixfyAVPlayerDidClose", "MavrixfyAVPlayerError"]
  }

  @objc(present:resolver:rejecter:)
  func present(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard self.playerViewController == nil else {
        reject("player_already_presented", "The native iOS player is already visible.", nil)
        return
      }

      guard
        let urlString = options["url"] as? String,
        let url = URL(string: urlString)
      else {
        reject("invalid_url", "Expected a valid media URL.", nil)
        return
      }

      guard let presenter = self.topViewController() else {
        reject("missing_presenter", "Could not find a visible view controller to present from.", nil)
        return
      }

      self.configureAudioSession()

      let controller = ManagedAVPlayerViewController()
      controller.owner = self
      if #available(iOS 15.0, *) {
        controller.modalPresentationStyle = .pageSheet
        if let sheet = controller.sheetPresentationController {
          sheet.detents = [.large()]
          sheet.prefersGrabberVisible = true
          sheet.preferredCornerRadius = 28
          sheet.prefersScrollingExpandsWhenScrolledToEdge = false
        }
      } else {
        controller.modalPresentationStyle = .automatic
      }
      controller.isModalInPresentation = false
      controller.entersFullScreenWhenPlaybackBegins = false
      controller.exitsFullScreenWhenPlaybackEnds = false
      controller.allowsPictureInPicturePlayback = true
      // Do NOT set updatesNowPlayingInfoCenter = true here.
      // react-native-track-player manages MPNowPlayingInfoCenter exclusively.
      // Two players writing to it simultaneously causes lock screen conflicts.
      controller.updatesNowPlayingInfoCenter = false
      controller.delegate = controller

      let player = AVPlayer(url: url)
      controller.player = player

      self.playerViewController = controller
      self.player = player
      self.lastKnownDurationSeconds = 0
      self.attachTimeObserver(to: player)

      let shouldPlay = options["shouldPlay"] as? Bool ?? true
      let startPositionSeconds = max(options["startPositionSeconds"] as? Double ?? 0, 0)

      if startPositionSeconds > 0 {
        let seekTime = CMTime(seconds: startPositionSeconds, preferredTimescale: 600)
        player.seek(to: seekTime)
      }

      presenter.present(controller, animated: true) {
        if shouldPlay {
          player.play()
        } else {
          player.pause()
        }
        resolve(nil)
      }
    }
  }

  @objc(dismiss:rejecter:)
  func dismiss(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let controller = self.playerViewController else {
        resolve(nil)
        return
      }

      controller.dismiss(animated: true) {
        self.handleDismiss(reason: "programmatic")
        resolve(nil)
      }
    }
  }

  fileprivate func handleDismiss(reason: String) {
    guard let player = player else {
      cleanup()
      return
    }

    let currentTimeSeconds = max(player.currentTime().seconds.isFinite ? player.currentTime().seconds : 0, 0)
    let durationSeconds = currentDurationSeconds()
    let isPlaying = player.rate > 0

    sendEvent(
      withName: "MavrixfyAVPlayerDidClose",
      body: [
        "reason": reason,
        "currentTimeSeconds": currentTimeSeconds,
        "durationSeconds": durationSeconds,
        "wasPlaying": isPlaying,
      ]
    )

    cleanup()
  }

  private func cleanup() {
    if let timeObserver, let player {
      player.removeTimeObserver(timeObserver)
    }

    timeObserver = nil
    player?.pause()
    player = nil
    playerViewController = nil
    lastKnownDurationSeconds = 0
  }

  private func attachTimeObserver(to player: AVPlayer) {
    let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
    timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] _ in
      self?.lastKnownDurationSeconds = self?.currentDurationSeconds() ?? 0
    }
  }

  private func currentDurationSeconds() -> Double {
    guard let duration = player?.currentItem?.duration.seconds, duration.isFinite, duration > 0 else {
      return lastKnownDurationSeconds
    }
    return duration
  }

  private func configureAudioSession() {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [.allowAirPlay])
      try session.setActive(true)
    } catch {
      sendEvent(
        withName: "MavrixfyAVPlayerError",
        body: ["message": error.localizedDescription]
      )
    }
  }

  private func topViewController(base: UIViewController? = nil) -> UIViewController? {
    let root: UIViewController? = {
      if let base {
        return base
      }

      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      let activeScene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
      let keyWindow = activeScene?.windows.first { $0.isKeyWindow } ?? activeScene?.windows.first
      return keyWindow?.rootViewController
    }()

    if let navigation = root as? UINavigationController {
      return topViewController(base: navigation.visibleViewController)
    }

    if let tab = root as? UITabBarController {
      return topViewController(base: tab.selectedViewController)
    }

    if let presented = root?.presentedViewController {
      return topViewController(base: presented)
    }

    return root
  }
}

private final class ManagedAVPlayerViewController: AVPlayerViewController, AVPlayerViewControllerDelegate {
  weak var owner: MavrixfyAVPlayer?

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)

    if isBeingDismissed || navigationController?.isBeingDismissed == true {
      owner?.handleDismiss(reason: "dismissed")
    }
  }
}
`;

const BRIDGE_SOURCE = `#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(MavrixfyAVPlayer, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(dismiss:(RCTPromiseResolveBlock)resolve
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

const withIOSAVPlayer = (config) => {
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

      writeFileIfChanged(path.join(targetDir, "MavrixfyAVPlayer.swift"), SWIFT_SOURCE);
      writeFileIfChanged(path.join(targetDir, "MavrixfyAVPlayerBridge.m"), BRIDGE_SOURCE);

      return config;
    },
  ]);

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

    project.addSourceFile(`${projectName}/MavrixfyAVPlayer.swift`, { target }, group);
    project.addSourceFile(`${projectName}/MavrixfyAVPlayerBridge.m`, { target }, group);
    project.addFramework("AVKit.framework", { target });
    project.addFramework("AVFoundation.framework", { target });

    return config;
  });

  return config;
};

module.exports = withIOSAVPlayer;
