package dev.codesphere.gamehubz.broadcast

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.input.sources.audio.AudioSource
import com.pedro.encoder.input.sources.audio.InternalAudioSource
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.audio.MixAudioSource
import com.pedro.encoder.input.sources.audio.SilenceAudioSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.encoder.utils.gl.TranslateTo
import com.pedro.library.generic.GenericStream

/**
 * Captures the screen and sends it to Twitch / Kick for as long as the player is in the game.
 *
 * A foreground service of type mediaProjection: Android only lets a screen-capture token be used from
 * one, and it keeps the stream alive while GameHubz sits in the background. The notification carries
 * the Stop button, so the player never has to come back to the app mid-match.
 *
 * Reports to the backend itself (started / heartbeat / stopped) — the JS runtime is asleep while the
 * game is in front.
 */
class BroadcastService : Service(), ConnectChecker {

    private val handler = Handler(Looper.getMainLooper())
    private var stream: GenericStream? = null
    private var mediaProjection: MediaProjection? = null
    private var config: BroadcastConfig? = null
    private var reporter: BroadcastReporter? = null
    private var connectedAt: Long? = null
    private var stopping = false

    private val heartbeat = object : Runnable {
        override fun run() {
            val cfg = config ?: return
            reporter?.heartbeat { stop ->
                // The backend ended it (streamer stopped elsewhere, admin, match long over).
                if (stop) handler.post { stopBroadcast(reportStopped = false, error = null) }
            }
            handler.postDelayed(this, cfg.heartbeatIntervalSeconds.coerceAtLeast(10) * 1000L)
        }
    }

    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            // The user revoked capture from the system UI (status-bar chip / quick settings).
            handler.post { stopBroadcast(reportStopped = true, error = null) }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopBroadcast(reportStopped = true, error = null)
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val bundle = intent.getBundleExtra(EXTRA_CONFIG)
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                @Suppress("DEPRECATION")
                val data: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
                } else {
                    intent.getParcelableExtra(EXTRA_RESULT_DATA)
                }
                if (bundle == null || data == null) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                begin(BroadcastConfig.fromBundle(bundle), resultCode, data)
            }
        }
        // Not sticky: a restarted service would have no capture token to resume with.
        return START_NOT_STICKY
    }

    private fun begin(requested: BroadcastConfig, resultCode: Int, data: Intent) {
        // The microphone is a while-in-use permission: without it the service may not even start with
        // the microphone type (Android 14), so a refused permission streams without the voice.
        val micGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        val cfg = if (requested.microphone && !micGranted) requested.copy(microphone = false) else requested

        config = cfg
        stopping = false
        isRunning = true
        BroadcastStatusBus.publish(BroadcastStatus("starting", cfg.matchId, cfg.platform))

        // Must be foreground (with the mediaProjection type) before the token is redeemed. The
        // microphone type is what lets the mic keep recording once the player is in the game.
        val notification = buildNotification(cfg)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            if (cfg.microphone && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
            startForeground(NOTIFICATION_ID, notification, types)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        try {
            val manager = getSystemService(MediaProjectionManager::class.java)
            val projection = manager.getMediaProjection(resultCode, data)
                ?: throw IllegalStateException("No media projection")
            mediaProjection = projection

            val generic = GenericStream(this, this, ScreenSource(applicationContext, projection, projectionCallback), audioSourceFor(cfg, projection))
            stream = generic

            val videoReady = generic.prepareVideo(cfg.width, cfg.height, cfg.bitrate, cfg.fps, 2, 0)
            // 44.1 kHz stereo AAC, what both Twitch and Kick recommend.
            val audioReady = generic.prepareAudio(44100, true, 128 * 1000)
            if (!videoReady || !audioReady) throw IllegalStateException("Encoder rejected the settings")

            // A game can hold a static frame (menus); keep frames flowing so the stream doesn't stall.
            generic.getGlInterface().setForceRender(true, cfg.fps)

            val overlay = ImageObjectFilterRender()
            generic.getGlInterface().addFilter(overlay)
            overlay.setImage(OverlayRenderer.render(cfg))
            overlay.setScale(100f, OverlayRenderer.HEIGHT_FRACTION * 100f)
            overlay.setPosition(TranslateTo.BOTTOM)

            generic.getStreamClient().setReTries(RETRIES)

            reporter = BroadcastReporter(cfg.apiBaseUrl, cfg.sessionToken)
            generic.startStream(cfg.endpoint)
        } catch (e: Exception) {
            Log.e(TAG, "Broadcast failed to start", e)
            stopBroadcast(reportStopped = true, error = "start_failed")
        }
    }

    private fun audioSourceFor(cfg: BroadcastConfig, projection: MediaProjection): AudioSource {
        val canCaptureGame = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        return when {
            cfg.gameAudio && cfg.microphone && canCaptureGame -> MixAudioSource(projection)
            cfg.gameAudio && canCaptureGame -> InternalAudioSource(projection)
            cfg.microphone -> MicrophoneSource()
            // A silent track rather than none: players handle an audio track that never changes
            // better than a stream that has no audio at all.
            else -> SilenceAudioSource()
        }
    }

    private fun stopBroadcast(reportStopped: Boolean, error: String?) {
        if (stopping) return
        stopping = true
        handler.removeCallbacks(heartbeat)

        val cfg = config
        try {
            stream?.let {
                if (it.isStreaming) it.stopStream()
                it.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Stopping the stream failed", e)
        }
        stream = null

        try {
            mediaProjection?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "Stopping the projection failed", e)
        }
        mediaProjection = null

        if (reportStopped) reporter?.stopped()
        reporter?.shutdown()
        reporter = null

        connectedAt = null
        isRunning = false
        // The match id stays on the idle status too, so that match's screen knows its stream just ended
        // (stopped from the notification, the system UI or the backend) and refreshes.
        BroadcastStatusBus.publish(
            if (error != null) BroadcastStatus("error", cfg?.matchId, cfg?.platform, error = error)
            else BroadcastStatus("idle", cfg?.matchId, cfg?.platform)
        )
        config = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    override fun onDestroy() {
        stopBroadcast(reportStopped = true, error = null)
        super.onDestroy()
    }

    // ─── ConnectChecker (called off the main thread) ───

    override fun onConnectionStarted(url: String) {}

    override fun onConnectionSuccess() {
        handler.post {
            val cfg = config ?: return@post
            if (connectedAt == null) {
                connectedAt = System.currentTimeMillis()
                reporter?.started()
                handler.removeCallbacks(heartbeat)
                handler.postDelayed(heartbeat, cfg.heartbeatIntervalSeconds.coerceAtLeast(10) * 1000L)
            }
            BroadcastStatusBus.publish(BroadcastStatus("live", cfg.matchId, cfg.platform, connectedAt))
        }
    }

    override fun onConnectionFailed(reason: String) {
        handler.post {
            val generic = stream ?: return@post
            // Mobile networks drop; give the link a few chances before giving up.
            if (generic.getStreamClient().reTry(RETRY_DELAY_MS, reason)) {
                val cfg = config ?: return@post
                BroadcastStatusBus.publish(BroadcastStatus("starting", cfg.matchId, cfg.platform, connectedAt))
            } else {
                stopBroadcast(reportStopped = true, error = if (connectedAt == null) "connection_failed" else "disconnected")
            }
        }
    }

    override fun onNewBitrate(bitrate: Long) {}

    override fun onDisconnect() {}

    override fun onAuthError() {
        handler.post { stopBroadcast(reportStopped = true, error = "auth_failed") }
    }

    override fun onAuthSuccess() {}

    private fun buildNotification(cfg: BroadcastConfig): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, cfg.notificationTitle, NotificationManager.IMPORTANCE_LOW)
            )
        }

        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, BroadcastService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 2, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(cfg.notificationTitle)
            .setContentText(cfg.notificationText)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openIntent)
            .addAction(0, cfg.stopLabel, stopIntent)
            .build()
    }

    companion object {
        private const val TAG = "GameHubzBroadcast"
        private const val CHANNEL_ID = "gamehubz_broadcast"
        private const val NOTIFICATION_ID = 7341
        private const val RETRIES = 5
        private const val RETRY_DELAY_MS = 3000L

        const val ACTION_START = "dev.codesphere.gamehubz.broadcast.START"
        const val ACTION_STOP = "dev.codesphere.gamehubz.broadcast.STOP"
        private const val EXTRA_CONFIG = "config"
        private const val EXTRA_RESULT_CODE = "resultCode"
        private const val EXTRA_RESULT_DATA = "resultData"

        @Volatile
        var isRunning = false
            private set

        fun start(context: Context, config: BroadcastConfig, resultCode: Int, data: Intent) {
            val intent = Intent(context, BroadcastService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_CONFIG, config.toBundle())
                .putExtra(EXTRA_RESULT_CODE, resultCode)
                .putExtra(EXTRA_RESULT_DATA, data)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            if (!isRunning) return
            context.startService(Intent(context, BroadcastService::class.java).setAction(ACTION_STOP))
        }
    }
}
