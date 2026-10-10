package dev.codesphere.gamehubz.broadcast

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils

/**
 * The strip burned into the stream: "HOME vs AWAY" on the left, the tournament and round in the
 * middle, the GameHubz mark on the right. Drawn once into a bitmap at stream resolution; the encoder
 * lays it over the bottom of the picture.
 */
object OverlayRenderer {
    private const val BACKGROUND = 0xD90A0F1E.toInt()
    private const val ACCENT = 0xFF10B981.toInt()
    private const val MUTED = 0xFF94A3B8.toInt()

    /** Bar height as a share of the video height. */
    const val HEIGHT_FRACTION = 0.075f

    fun render(config: BroadcastConfig): Bitmap {
        val width = config.width
        val height = (config.height * HEIGHT_FRACTION).toInt().coerceAtLeast(32)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        canvas.drawColor(BACKGROUND)

        val padding = height * 0.45f
        val baseline = height * 0.66f
        val textSize = height * 0.44f

        val namePaint = textPaint(textSize, Color.WHITE, bold = true)
        val vsPaint = textPaint(textSize * 0.8f, ACCENT, bold = true)
        val infoPaint = textPaint(textSize * 0.82f, MUTED, bold = false)
        val brandPaint = textPaint(textSize * 0.82f, Color.WHITE, bold = true)

        // Right: the GameHubz pill.
        val brand = "GameHubz"
        val brandWidth = brandPaint.measureText(brand)
        val pillPadding = height * 0.25f
        val pill = RectF(
            width - padding - brandWidth - pillPadding * 2,
            height * 0.18f,
            width - padding,
            height * 0.82f,
        )
        canvas.drawRoundRect(pill, pill.height() / 2, pill.height() / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ACCENT })
        canvas.drawText(brand, pill.left + pillPadding, baseline, brandPaint)

        // Left: the pairing, each name capped so a long one can't push the rest off.
        val maxName = width * 0.2f
        val home = TextUtils.ellipsize(config.homeName, namePaint, maxName, TextUtils.TruncateAt.END).toString()
        val away = TextUtils.ellipsize(config.awayName, namePaint, maxName, TextUtils.TruncateAt.END).toString()
        var x = padding
        canvas.drawText(home, x, baseline, namePaint)
        x += namePaint.measureText(home) + padding * 0.6f
        canvas.drawText("vs", x, baseline, vsPaint)
        x += vsPaint.measureText("vs") + padding * 0.6f
        canvas.drawText(away, x, baseline, namePaint)
        x += namePaint.measureText(away) + padding

        // Middle: tournament · round, in whatever room is left.
        val info = listOfNotNull(
            config.tournamentName.takeIf { it.isNotBlank() },
            config.roundLabel?.takeIf { it.isNotBlank() },
        ).joinToString("  ·  ")
        val room = pill.left - padding - x
        if (info.isNotEmpty() && room > textSize * 2) {
            val fitted = TextUtils.ellipsize(info, infoPaint, room, TextUtils.TruncateAt.END).toString()
            canvas.drawText(fitted, x, baseline, infoPaint)
        }

        return bitmap
    }

    private fun textPaint(size: Float, color: Int, bold: Boolean) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size
        this.color = color
        typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
    }
}
