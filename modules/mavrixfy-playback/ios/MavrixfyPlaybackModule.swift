import ExpoModulesCore

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
