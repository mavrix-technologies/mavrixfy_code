import Foundation

@main
struct PlaybackCommandValuesTests {
  static func requireIndex(_ value: Any?, equals expected: Int, defaultValue: Int = 0) throws {
    let actual = try PlaybackCommandValues.index(value, defaultValue: defaultValue)
    precondition(actual == expected, "Incorrect queue selection: \(actual), expected \(expected)")
  }

  static func main() throws {
    // This is the representation used by Expo's JavaScriptValue.getAny().
    let bridged: [String: Any] = ["index": Double(2), "to": Double(1)]
    precondition(bridged["index"] as? Int == nil, "Fixture must reproduce the old failed cast")
    try requireIndex(bridged["index"], equals: 2)
    try requireIndex(bridged["to"], equals: 1)
    for selected in 0..<214 {
      try requireIndex(Double(selected), equals: selected)
      try requireIndex(selected, equals: selected)
      try requireIndex(NSNumber(value: selected), equals: selected)
    }
    try requireIndex(nil, equals: 0)
    try requireIndex(nil, equals: 7, defaultValue: 7)
    let invalidValues: [Any] = [0.5, NSNumber(value: 1.5), Double.nan, Double.infinity,
      -Double.infinity, Double.greatestFiniteMagnitude, true, false, NSNumber(value: true), "2", NSNull()]
    for invalid in invalidValues {
      do {
        _ = try PlaybackCommandValues.index(invalid)
        preconditionFailure("Invalid index must fail instead of playing song zero")
      } catch {
        precondition((error as NSError).domain == "MavrixfyPlayback")
      }
    }
    print("iOS playback numeric command tests passed")
  }
}
