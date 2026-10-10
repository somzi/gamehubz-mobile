package dev.codesphere.gamehubz.broadcast

/** The broadcaster's state as the JS side sees it (mirrors BroadcastStatus in index.ts). */
data class BroadcastStatus(
    val state: String,
    val matchId: String? = null,
    val platform: Int? = null,
    val startedAt: Long? = null,
    val error: String? = null,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "state" to state,
        "matchId" to matchId,
        "platform" to platform,
        "startedAt" to startedAt?.toDouble(),
        "error" to error,
    )

    companion object {
        val IDLE = BroadcastStatus("idle")
    }
}

/**
 * The service and the module live apart (the service keeps running while the activity and even the
 * React context come and go), so the current state sits here and the module subscribes while it exists.
 */
object BroadcastStatusBus {
    @Volatile
    var current: BroadcastStatus = BroadcastStatus.IDLE
        private set

    @Volatile
    var listener: ((BroadcastStatus) -> Unit)? = null

    fun publish(status: BroadcastStatus) {
        current = status
        listener?.invoke(status)
    }
}
