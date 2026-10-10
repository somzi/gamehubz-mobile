import CoreMedia
import HaishinKit
import ReplayKit
import VideoToolbox

/// The GameHubz broadcast: ReplayKit hands the screen (and game / microphone sound) to this extension,
/// which burns in the match overlay and sends it over RTMP(S) to the player's Twitch / Kick channel.
///
/// Runs in its own process with a hard memory ceiling (~50 MB), so the mixer works in passthrough mode
/// and the encoder queue is kept short. Reports to the backend itself — started, a heartbeat, stopped —
/// and stops when the app (Stop button) or the backend (heartbeat says stop) asks it to.
final class SampleHandler: RPBroadcastSampleHandler, @unchecked Sendable {
  private var mixer: MediaMixer?
  private var session: Session?
  private var config: BroadcastConfig?
  private var reporter: BroadcastReporter?
  private var overlay: OverlayRenderer?
  private var rotatorBox: AnyObject?
  private var heartbeatTimer: DispatchSourceTimer?
  private var startedAt: Double?
  private var isFinishing = false
  private var reconnectAttempts = 0
  private let stateQueue = DispatchQueue(label: "dev.codesphere.gamehubz.broadcast.state")

  private static let maxReconnectAttempts = 3

  @available(iOS 16.0, *)
  private var rotator: VideoRotator? { rotatorBox as? VideoRotator }

  // MARK: - ReplayKit lifecycle

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    guard let config = BroadcastConfig.takeFromSharedStore() else {
      // Started from Control Center rather than from a match in the app: nothing to stream to.
      finish(message: "Start the stream from a match in the GameHubz app.", error: "no_session", reportStopped: false)
      return
    }

    self.config = config
    self.reporter = BroadcastReporter(apiBaseUrl: config.apiBaseUrl, sessionToken: config.sessionToken)
    self.overlay = OverlayRenderer(config: config)
    if #available(iOS 16.0, *) {
      // Landscape games arrive as portrait buffers tagged with their orientation; turn them upright.
      rotatorBox = VideoRotator()
    }

    BroadcastShared.defaults?.set(false, forKey: BroadcastShared.stopKey)
    BroadcastShared.writeStatus(state: "starting", config: config)
    observeStopRequests()

    // Mixing two tracks only when both sounds are on; a single sound always goes on track 0.
    let mixer = MediaMixer(
      multiCamSessionEnabled: false,
      multiTrackAudioMixingEnabled: config.gameAudio && config.microphone
    )
    self.mixer = mixer

    Task {
      do {
        await SessionBuilderFactory.shared.register(RTMPSessionFactory())
        guard let url = URL(string: config.endpoint) else { throw BroadcastError.badEndpoint }
        self.session = try await SessionBuilderFactory.shared.make(url).build()
        guard let session = self.session else { throw BroadcastError.noSession }

        var mixerSettings = await mixer.videoMixerSettings
        mixerSettings.mode = .passthrough
        await mixer.setVideoMixerSettings(mixerSettings)

        // ReplayKit is memory-sensitive: keep the encoder queue short.
        await session.stream.setVideoInputBufferCounts(5)

        // A fixed landscape output; anything else (the app in portrait before the game opens) is
        // letterboxed into it rather than changing the stream's resolution mid-broadcast.
        var videoSettings = await session.stream.videoSettings
        videoSettings.videoSize = CGSize(width: config.width, height: config.height)
        videoSettings.bitRate = config.bitrate
        videoSettings.scalingMode = .letterbox
        videoSettings.profileLevel = kVTProfileLevel_H264_Baseline_AutoLevel as String
        await session.stream.setVideoSettings(videoSettings)

        await mixer.addOutput(session.stream)
        try await session.connect(.ingest)
        self.onConnected()
      } catch {
        self.finish(message: config.endedText, error: "connection_failed", reportStopped: true)
      }
    }
  }

  override func broadcastFinished() {
    // Stopped from the system UI (red status-bar pill / Control Center).
    stateQueue.sync {
      cleanUp(state: "idle", error: nil, reportStopped: true)
    }
  }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    guard let mixer, let config, !isFinishing else { return }

    switch sampleBufferType {
    case .video:
      var buffer = sampleBuffer
      if #available(iOS 16.0, *), let rotator {
        if case .success(let rotated) = rotator.rotate(buffer: sampleBuffer) {
          buffer = rotated
        }
      }
      if let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) {
        overlay?.draw(on: pixelBuffer)
      }
      let frame = buffer
      Task { await mixer.append(frame) }

    case .audioApp:
      guard config.gameAudio, sampleBuffer.dataReadiness == .ready else { return }
      let track: UInt8 = config.microphone ? 1 : 0
      Task { await mixer.append(sampleBuffer, track: track) }

    case .audioMic:
      guard config.microphone, sampleBuffer.dataReadiness == .ready else { return }
      Task { await mixer.append(sampleBuffer, track: 0) }

    @unknown default:
      break
    }
  }

  // MARK: - Session

  private func onConnected() {
    stateQueue.async {
      self.reconnectAttempts = 0
      guard self.startedAt == nil else { return }
      self.startedAt = Date().timeIntervalSince1970 * 1000
      self.reporter?.started()
      BroadcastShared.writeStatus(state: "live", config: self.config, startedAt: self.startedAt)
      self.startHeartbeat()
    }
  }

  private func startHeartbeat() {
    let interval = max(10, config?.heartbeatIntervalSeconds ?? 30)
    let timer = DispatchSource.makeTimerSource(queue: stateQueue)
    timer.schedule(deadline: .now() + .seconds(interval), repeating: .seconds(interval))
    timer.setEventHandler { [weak self] in self?.tick() }
    timer.resume()
    heartbeatTimer = timer
  }

  private func tick() {
    guard let config, !isFinishing else { return }

    // Keeps the app's "live" status fresh (it distrusts a stale one) and asks the backend whether
    // to go on.
    BroadcastShared.writeStatus(state: "live", config: config, startedAt: startedAt)
    reporter?.heartbeat { [weak self] stop in
      if stop { self?.finish(message: config.endedText, error: nil, reportStopped: false) }
    }

    Task {
      guard let session = self.session else { return }
      if await session.isConnected { return }
      // Mobile networks drop; give the link a few chances before giving up.
      self.stateQueue.async {
        self.reconnectAttempts += 1
        let attempt = self.reconnectAttempts
        if attempt > Self.maxReconnectAttempts {
          self.finish(message: config.endedText, error: "disconnected", reportStopped: true)
          return
        }
        Task {
          do {
            try await session.connect(.ingest)
            self.onConnected()
          } catch {
            // The next tick tries again or gives up.
          }
        }
      }
    }
  }

  // MARK: - Stop

  private func observeStopRequests() {
    let observer = Unmanaged.passUnretained(self).toOpaque()
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      { _, observer, _, _, _ in
        guard let observer else { return }
        let handler = Unmanaged<SampleHandler>.fromOpaque(observer).takeUnretainedValue()
        handler.stopRequestedByApp()
      },
      BroadcastShared.stopNotification as CFString,
      nil,
      .deliverImmediately
    )
  }

  private func stopRequestedByApp() {
    guard BroadcastShared.defaults?.bool(forKey: BroadcastShared.stopKey) == true else { return }
    finish(message: config?.endedText ?? "The stream has ended.", error: nil, reportStopped: true)
  }

  /// Ends the broadcast from our side. ReplayKit shows `message` to the player as the reason.
  private func finish(message: String, error: String?, reportStopped: Bool) {
    stateQueue.async {
      guard !self.isFinishing else { return }
      self.cleanUp(state: error == nil ? "idle" : "error", error: error, reportStopped: reportStopped)
      self.finishBroadcastWithError(NSError(
        domain: "dev.codesphere.gamehubz.broadcast",
        code: error == nil ? 0 : 1,
        userInfo: [NSLocalizedDescriptionKey: message]
      ))
    }
  }

  private func cleanUp(state: String, error: String?, reportStopped: Bool) {
    guard !isFinishing else { return }
    isFinishing = true

    heartbeatTimer?.cancel()
    heartbeatTimer = nil

    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      CFNotificationName(BroadcastShared.stopNotification as CFString),
      nil
    )

    if reportStopped { reporter?.stopped() }
    BroadcastShared.writeStatus(state: state, config: config, error: error)

    let session = self.session
    Task { try? await session?.close() }
  }

  private enum BroadcastError: Error {
    case badEndpoint
    case noSession
  }
}
