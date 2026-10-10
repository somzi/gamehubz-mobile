package dev.codesphere.gamehubz.broadcast

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit

/**
 * Tells the GameHubz backend what the phone is doing, authenticated with the session token alone (the
 * service has no login). Runs off the main thread; every call is best effort — the backend's own sweep
 * covers a phone that can't reach it.
 */
class BroadcastReporter(private val apiBaseUrl: String, private val sessionToken: String) {
    // Heartbeats and the final "stopped", in order.
    private val executor = Executors.newSingleThreadExecutor()

    // "started" retries live apart, so a slow or failing start report never holds up the heartbeats
    // (the first of which also puts the stream on air if every start report is lost).
    private val startedExecutor = Executors.newSingleThreadScheduledExecutor()

    /** A few tries with a growing pause, scheduled rather than slept so nothing else waits on them. */
    fun started() {
        startedAttempt(1)
    }

    private fun startedAttempt(attempt: Int) {
        try {
            startedExecutor.schedule({
                if (post("started") == null && attempt < STARTED_ATTEMPTS) startedAttempt(attempt + 1)
            }, if (attempt == 1) 0L else 2_000L * (attempt - 1), TimeUnit.MILLISECONDS)
        } catch (e: RejectedExecutionException) {
            // Shut down: the broadcast already ended.
        }
    }

    /** onResult(true) when the backend says the stream must stop. */
    fun heartbeat(onResult: (Boolean) -> Unit) {
        executor.execute {
            val body = post("heartbeat") ?: return@execute
            val stop = try {
                JSONObject(body).optBoolean("stop", false)
            } catch (e: Exception) {
                false
            }
            onResult(stop)
        }
    }

    fun stopped() {
        executor.execute { post("stopped") }
    }

    fun shutdown() {
        // Pending start retries are moot once the broadcast is over; the queued "stopped" still goes.
        startedExecutor.shutdownNow()
        executor.shutdown()
    }

    private fun post(path: String): String? {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(apiBaseUrl.trimEnd('/') + "/" + path).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("X-Broadcast-Token", sessionToken)
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }
            connection.outputStream.use { it.write("{}".toByteArray()) }
            val code = connection.responseCode
            if (code in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                Log.w(TAG, "Broadcast $path returned $code")
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Broadcast $path failed", e)
            null
        } finally {
            connection?.disconnect()
        }
    }

    companion object {
        private const val TAG = "GameHubzBroadcast"
        private const val STARTED_ATTEMPTS = 3
    }
}
