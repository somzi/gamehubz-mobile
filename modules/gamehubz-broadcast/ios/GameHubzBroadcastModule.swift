import ExpoModulesCore
import ReplayKit
import UIKit

/// App-side half of the in-app broadcast on iOS.
///
/// The capture runs in the Broadcast Upload extension (targets/broadcast), a separate process the app
/// can only talk to through the shared App Group: the app writes the session config there and opens
/// the system broadcast sheet; the extension writes its status back and pings with a Darwin
/// notification. Stop goes the other way — a flag plus a ping the extension listens for.
public class GameHubzBroadcastModule: Module {
  private var isObserving = false

  public func definition() -> ModuleDefinition {
    Name("GameHubzBroadcast")

    Events("onStatusChange")

    OnCreate {
      self.startObservingStatus()
    }

    OnDestroy {
      self.stopObservingStatus()
    }

    Function("isSupported") { () -> Bool in
      BroadcastShared.defaults != nil
    }

    AsyncFunction("start") { (config: [String: Any], promise: Promise) in
      // preparedAt lets the extension refuse a config left behind by a sheet the player dismissed,
      // if a broadcast is later started from Control Center instead.
      var stamped = config
      stamped["preparedAt"] = Date().timeIntervalSince1970 * 1000
      guard let defaults = BroadcastShared.defaults,
            let data = try? JSONSerialization.data(withJSONObject: stamped) else {
        promise.reject("broadcast_unavailable", "The broadcast app group is not configured")
        return
      }
      defaults.set(data, forKey: BroadcastShared.configKey)
      defaults.set(false, forKey: BroadcastShared.stopKey)

      let microphone = (config["microphone"] as? Bool) ?? false
      self.presentBroadcastPicker(microphone: microphone)
      // The player still has to tap "Start Broadcast" in the system sheet; the extension reports
      // from there on (starting → live) through onStatusChange.
      promise.resolve(nil)
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      BroadcastShared.defaults?.set(true, forKey: BroadcastShared.stopKey)
      BroadcastShared.post(BroadcastShared.stopNotification)
    }

    AsyncFunction("getStatus") { () -> [String: Any] in
      BroadcastShared.readStatus()
    }
  }

  // The system sheet can only be opened by "tapping" RPSystemBroadcastPickerView's own button; the
  // picker has to sit in the window for that, so it is added invisibly and removed shortly after.
  private func presentBroadcastPicker(microphone: Bool) {
    guard let window = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows })
      .first(where: { $0.isKeyWindow }) else { return }

    let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
    picker.preferredExtension = BroadcastShared.extensionBundleId
    picker.showsMicrophoneButton = microphone
    picker.alpha = 0.01
    window.addSubview(picker)

    for case let button as UIButton in picker.subviews {
      button.sendActions(for: .allTouchEvents)
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      picker.removeFromSuperview()
    }
  }

  private func startObservingStatus() {
    guard !isObserving else { return }
    isObserving = true
    let observer = Unmanaged.passUnretained(self).toOpaque()
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      { _, observer, _, _, _ in
        guard let observer else { return }
        let module = Unmanaged<GameHubzBroadcastModule>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
          module.sendEvent("onStatusChange", BroadcastShared.readStatus())
        }
      },
      BroadcastShared.statusNotification as CFString,
      nil,
      .deliverImmediately
    )
  }

  private func stopObservingStatus() {
    guard isObserving else { return }
    isObserving = false
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      CFNotificationName(BroadcastShared.statusNotification as CFString),
      nil
    )
  }
}

/// Keys and names shared with the extension (targets/broadcast/BroadcastShared.swift mirrors these).
enum BroadcastShared {
  static let configKey = "broadcast.config"
  static let statusKey = "broadcast.status"
  static let stopKey = "broadcast.stopRequested"
  static let statusNotification = "dev.codesphere.gamehubz.broadcast.status"
  static let stopNotification = "dev.codesphere.gamehubz.broadcast.stop"

  static var appBundleId: String { Bundle.main.bundleIdentifier ?? "" }
  static var extensionBundleId: String { appBundleId + ".broadcast" }
  static var appGroup: String { "group." + appBundleId }

  /// Nil when the App Group entitlement is missing (a build without the broadcast extension).
  static var defaults: UserDefaults? {
    guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) != nil else { return nil }
    return UserDefaults(suiteName: appGroup)
  }

  static func readStatus() -> [String: Any] {
    guard let data = defaults?.data(forKey: statusKey),
          let status = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return ["state": "idle"]
    }
    // A status older than a live broadcast could be (extension killed without writing "idle")
    // is not trusted.
    if let updatedAt = status["updatedAt"] as? Double,
       let state = status["state"] as? String,
       state == "starting" || state == "live",
       Date().timeIntervalSince1970 * 1000 - updatedAt > 90_000 {
      return ["state": "idle"]
    }
    return status
  }

  static func post(_ name: String) {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(name as CFString),
      nil, nil, true
    )
  }
}
