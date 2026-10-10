package dev.codesphere.gamehubz.broadcast

import android.os.Bundle

/** What the JS side hands over for one broadcast. Travels to the service as a Bundle. */
data class BroadcastConfig(
    val matchId: String,
    val platform: Int,
    val ingestUrl: String,
    val streamKey: String,
    val sessionToken: String,
    val apiBaseUrl: String,
    val heartbeatIntervalSeconds: Int,
    val gameAudio: Boolean,
    val microphone: Boolean,
    val tournamentName: String,
    val homeName: String,
    val awayName: String,
    val roundLabel: String?,
    val notificationTitle: String,
    val notificationText: String,
    val stopLabel: String,
    val width: Int,
    val height: Int,
    val fps: Int,
    val bitrate: Int,
) {
    /** rtmp(s)://host/app + "/" + key — the form the RTMP client expects. */
    val endpoint: String
        get() = ingestUrl.trimEnd('/') + "/" + streamKey

    fun toBundle(): Bundle = Bundle().apply {
        putString("matchId", matchId)
        putInt("platform", platform)
        putString("ingestUrl", ingestUrl)
        putString("streamKey", streamKey)
        putString("sessionToken", sessionToken)
        putString("apiBaseUrl", apiBaseUrl)
        putInt("heartbeatIntervalSeconds", heartbeatIntervalSeconds)
        putBoolean("gameAudio", gameAudio)
        putBoolean("microphone", microphone)
        putString("tournamentName", tournamentName)
        putString("homeName", homeName)
        putString("awayName", awayName)
        putString("roundLabel", roundLabel)
        putString("notificationTitle", notificationTitle)
        putString("notificationText", notificationText)
        putString("stopLabel", stopLabel)
        putInt("width", width)
        putInt("height", height)
        putInt("fps", fps)
        putInt("bitrate", bitrate)
    }

    companion object {
        fun fromBundle(b: Bundle): BroadcastConfig = BroadcastConfig(
            matchId = b.getString("matchId", ""),
            platform = b.getInt("platform"),
            ingestUrl = b.getString("ingestUrl", ""),
            streamKey = b.getString("streamKey", ""),
            sessionToken = b.getString("sessionToken", ""),
            apiBaseUrl = b.getString("apiBaseUrl", ""),
            heartbeatIntervalSeconds = b.getInt("heartbeatIntervalSeconds", 30),
            gameAudio = b.getBoolean("gameAudio", true),
            microphone = b.getBoolean("microphone", false),
            tournamentName = b.getString("tournamentName", ""),
            homeName = b.getString("homeName", ""),
            awayName = b.getString("awayName", ""),
            roundLabel = b.getString("roundLabel"),
            notificationTitle = b.getString("notificationTitle", "GameHubz"),
            notificationText = b.getString("notificationText", ""),
            stopLabel = b.getString("stopLabel", "Stop"),
            width = b.getInt("width", 1280),
            height = b.getInt("height", 720),
            fps = b.getInt("fps", 30),
            bitrate = b.getInt("bitrate", 2_500_000),
        )

        @Suppress("UNCHECKED_CAST")
        fun fromMap(map: Map<String, Any?>): BroadcastConfig {
            val overlay = map["overlay"] as? Map<String, Any?> ?: emptyMap()
            val notification = map["notification"] as? Map<String, Any?> ?: emptyMap()
            val video = map["video"] as? Map<String, Any?> ?: emptyMap()

            fun str(m: Map<String, Any?>, key: String, fallback: String = "") = (m[key] as? String) ?: fallback
            fun int(m: Map<String, Any?>, key: String, fallback: Int) = (m[key] as? Number)?.toInt() ?: fallback
            fun bool(m: Map<String, Any?>, key: String, fallback: Boolean) = (m[key] as? Boolean) ?: fallback

            return BroadcastConfig(
                matchId = str(map, "matchId"),
                platform = int(map, "platform", 0),
                ingestUrl = str(map, "ingestUrl"),
                streamKey = str(map, "streamKey"),
                sessionToken = str(map, "sessionToken"),
                apiBaseUrl = str(map, "apiBaseUrl"),
                heartbeatIntervalSeconds = int(map, "heartbeatIntervalSeconds", 30),
                gameAudio = bool(map, "gameAudio", true),
                microphone = bool(map, "microphone", false),
                tournamentName = str(overlay, "tournamentName"),
                homeName = str(overlay, "homeName"),
                awayName = str(overlay, "awayName"),
                roundLabel = overlay["roundLabel"] as? String,
                notificationTitle = str(notification, "title", "GameHubz"),
                notificationText = str(notification, "text"),
                stopLabel = str(notification, "stopLabel", "Stop"),
                width = int(video, "width", 1280),
                height = int(video, "height", 720),
                fps = int(video, "fps", 30),
                bitrate = int(video, "bitrate", 2_500_000),
            )
        }
    }
}
