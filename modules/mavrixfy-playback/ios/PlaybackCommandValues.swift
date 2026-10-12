import Foundation
import CoreFoundation

/// Expo's untyped JS dictionaries contain Double values, not Swift Int values.
/// Never turn a failed numeric cast into a valid selection of the first song.
enum PlaybackCommandValues {
  static func index(_ value: Any?, defaultValue: Int = 0) throws -> Int {
    guard let value else { return defaultValue }
    guard let number = value as? NSNumber,
      CFGetTypeID(number) != CFBooleanGetTypeID(),
      let integer = Int(exactly: number.doubleValue) else {
      throw invalidIndex()
    }
    return integer
  }

  private static func invalidIndex() -> NSError {
    NSError(domain: "MavrixfyPlayback", code: 2,
      userInfo: [NSLocalizedDescriptionKey: "Queue index must be a finite integer."])
  }
}
