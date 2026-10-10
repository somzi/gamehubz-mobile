import Foundation

/// What the app hands the extension through the App Group, and the status that goes back.
/// Mirrors BroadcastShared in modules/gamehubz-broadcast/ios/GameHubzBroadcastModule.swift.
enum BroadcastShared {
  static let configKey = "broadcast.config"
  static let statusKey = "broadcast.status"
  static let stopKey = "broadcast.stopRequested"
  static let statusNotification = "dev.codesphere.gamehubz.broadcast.status"
  static let stopNotification = "dev.codesphere.gamehubz.broadcast.stop"

  /// The extension's id is the app's + ".broadcast"; the App Group is "group." + the app's id.
  static var appGroup: String {
    let own = Bundle.main.bundleIdentifier ?? ""
    let app = own.hasSuffix(".broadcast") ? String(own.dropLast(".broadcast".count)) : own
    return "group." + app
  }

  static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

  static func writeStatus(state: String, config: BroadcastConfig?, startedAt: Double? = nil, error: String? = nil) {
    var status: [String: Any] = [
      "state": state,
      "updatedAt": Date().timeIntervalSince1970 * 1000,
    ]
    if let config {
      status["matchId"] = config.matchId
      status["platform"] = config.platform
    }
    if let startedAt { status["startedAt"] = startedAt }
    if let error { status["error"] = error }

    if let data = try? JSONSerialization.data(withJSONObject: status) {
      defaults?.set(data, forKey: statusKey)
    }
    post(statusNotification)
  }

  static func post(_ name: String) {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(name as CFString),
      nil, nil, true
    )
  }
}

/// The session config the app wrote before opening the broadcast sheet.
struct BroadcastConfig {
  let matchId: String
  let platform: Int
  let ingestUrl: String
  let streamKey: String
  let sessionToken: String
  let apiBaseUrl: String
  let heartbeatIntervalSeconds: Int
  let gameAudio: Bool
  let microphone: Bool
  let tournamentName: String
  let homeName: String
  let awayName: String
  let roundLabel: String?
  let endedText: String
  let width: Int
  let height: Int
  let bitrate: Int

  /// rtmp(s)://host/app/<key> — HaishinKit takes the last path component as the stream name.
  var endpoint: String {
    var base = ingestUrl
    while base.hasSuffix("/") { base.removeLast() }
    return base + "/" + streamKey
  }

  /// Reads the config and removes it from the shared store: the stream key should not sit on disk
  /// any longer than it takes to connect.
  static func takeFromSharedStore() -> BroadcastConfig? {
    guard let defaults = BroadcastShared.defaults,
          let data = defaults.data(forKey: BroadcastShared.configKey),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    defaults.removeObject(forKey: BroadcastShared.configKey)

    // Written when the player tapped Start in the app; anything older is a dismissed sheet's leftover.
    let preparedAt = (json["preparedAt"] as? NSNumber)?.doubleValue ?? 0
    guard Date().timeIntervalSince1970 * 1000 - preparedAt < 10 * 60 * 1000 else { return nil }

    let overlay = json["overlay"] as? [String: Any] ?? [:]
    let notification = json["notification"] as? [String: Any] ?? [:]
    let video = json["video"] as? [String: Any] ?? [:]

    guard let ingestUrl = json["ingestUrl"] as? String,
          let streamKey = json["streamKey"] as? String,
          let sessionToken = json["sessionToken"] as? String,
          let apiBaseUrl = json["apiBaseUrl"] as? String else { return nil }

    return BroadcastConfig(
      matchId: json["matchId"] as? String ?? "",
      platform: (json["platform"] as? NSNumber)?.intValue ?? 0,
      ingestUrl: ingestUrl,
      streamKey: streamKey,
      sessionToken: sessionToken,
      apiBaseUrl: apiBaseUrl,
      heartbeatIntervalSeconds: (json["heartbeatIntervalSeconds"] as? NSNumber)?.intValue ?? 30,
      gameAudio: json["gameAudio"] as? Bool ?? true,
      microphone: json["microphone"] as? Bool ?? false,
      tournamentName: overlay["tournamentName"] as? String ?? "",
      homeName: overlay["homeName"] as? String ?? "",
      awayName: overlay["awayName"] as? String ?? "",
      roundLabel: overlay["roundLabel"] as? String,
      endedText: notification["endedText"] as? String ?? "The stream has ended.",
      width: (video["width"] as? NSNumber)?.intValue ?? 1280,
      height: (video["height"] as? NSNumber)?.intValue ?? 720,
      bitrate: (video["bitrate"] as? NSNumber)?.intValue ?? 2_500_000
    )
  }
}
