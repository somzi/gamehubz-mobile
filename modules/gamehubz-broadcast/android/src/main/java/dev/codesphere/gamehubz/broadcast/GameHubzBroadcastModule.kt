package dev.codesphere.gamehubz.broadcast

import android.app.Activity
import android.media.projection.MediaProjectionManager
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS face of the broadcaster: asks for the screen-capture consent, hands the token to
 * [BroadcastService] and relays its state as onStatusChange events.
 */
class GameHubzBroadcastModule : Module() {
    private var pendingPromise: Promise? = null
    private var pendingConfig: BroadcastConfig? = null

    override fun definition() = ModuleDefinition {
        Name("GameHubzBroadcast")

        Events("onStatusChange")

        OnCreate {
            BroadcastStatusBus.listener = { status -> sendEvent("onStatusChange", status.toMap()) }
        }

        OnDestroy {
            BroadcastStatusBus.listener = null
        }

        // Game sound needs AudioPlaybackCapture (Android 10). Below that the feature is hidden
        // rather than offered half-working.
        Function("isSupported") {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        }

        AsyncFunction("start") { config: Map<String, Any?>, promise: Promise ->
            val activity = appContext.currentActivity
            if (activity == null) {
                promise.reject(CodedException("no_activity", "No foreground activity", null))
                return@AsyncFunction
            }
            if (BroadcastService.isRunning) {
                promise.reject(CodedException("already_running", "A broadcast is already running", null))
                return@AsyncFunction
            }

            pendingConfig = BroadcastConfig.fromMap(config)
            pendingPromise = promise

            val manager = activity.getSystemService(MediaProjectionManager::class.java)
            @Suppress("DEPRECATION")
            activity.startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_CODE)
        }

        OnActivityResult { _, payload ->
            if (payload.requestCode != REQUEST_CODE) return@OnActivityResult

            val promise = pendingPromise
            val config = pendingConfig
            pendingPromise = null
            pendingConfig = null
            if (promise == null || config == null) return@OnActivityResult

            val data = payload.data
            if (payload.resultCode != Activity.RESULT_OK || data == null) {
                BroadcastStatusBus.publish(BroadcastStatus("error", config.matchId, config.platform, error = "permission_denied"))
                promise.reject(CodedException("permission_denied", "Screen capture was not allowed", null))
                return@OnActivityResult
            }

            val context = appContext.reactContext
            if (context == null) {
                promise.reject(CodedException("no_context", "No React context", null))
                return@OnActivityResult
            }

            BroadcastService.start(context, config, payload.resultCode, data)
            promise.resolve(null)
        }

        AsyncFunction("stop") {
            appContext.reactContext?.let { BroadcastService.stop(it) }
        }

        AsyncFunction("getStatus") {
            BroadcastStatusBus.current.toMap()
        }
    }

    companion object {
        private const val REQUEST_CODE = 47391
    }
}
