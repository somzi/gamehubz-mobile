import CoreImage
import UIKit

/// The strip burned into the stream — "HOME vs AWAY", tournament · round, the GameHubz mark — same
/// layout as the Android overlay. Drawn once per frame size, then composited onto the bottom of each
/// frame in place; only the strip's rows are rewritten, which keeps the per-frame cost small.
final class OverlayRenderer {
  private static let heightFraction: CGFloat = 0.075
  private static let background = UIColor(red: 10 / 255, green: 15 / 255, blue: 30 / 255, alpha: 0.85)
  private static let accent = UIColor(red: 16 / 255, green: 185 / 255, blue: 129 / 255, alpha: 1)
  private static let muted = UIColor(red: 148 / 255, green: 163 / 255, blue: 184 / 255, alpha: 1)

  private let config: BroadcastConfig
  private let context = CIContext(options: [.cacheIntermediates: false])
  private let colorSpace = CGColorSpaceCreateDeviceRGB()
  private var cachedSize: CGSize = .zero
  private var cachedImage: CIImage?
  private var cachedStrip: CGRect = .zero

  init(config: BroadcastConfig) {
    self.config = config
  }

  func draw(on pixelBuffer: CVPixelBuffer) {
    let size = CGSize(width: CVPixelBufferGetWidth(pixelBuffer), height: CVPixelBufferGetHeight(pixelBuffer))
    if size != cachedSize {
      rebuild(for: size)
    }
    guard let overlay = cachedImage else { return }

    let frame = CIImage(cvPixelBuffer: pixelBuffer)
    context.render(overlay.composited(over: frame), to: pixelBuffer, bounds: cachedStrip, colorSpace: colorSpace)
  }

  private func rebuild(for size: CGSize) {
    cachedSize = size
    let stripHeight = max(32, (size.height * Self.heightFraction).rounded())
    // Core Image's origin is bottom-left, so y = 0 is the bottom of the picture.
    cachedStrip = CGRect(x: 0, y: 0, width: size.width, height: stripHeight)

    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: size.width, height: stripHeight), format: format)
    let image = renderer.image { _ in drawStrip(width: size.width, height: stripHeight) }

    cachedImage = image.cgImage.map { CIImage(cgImage: $0) }
  }

  private func drawStrip(width: CGFloat, height: CGFloat) {
    Self.background.setFill()
    UIRectFill(CGRect(x: 0, y: 0, width: width, height: height))

    let padding = height * 0.45
    let fontSize = height * 0.44

    func attributes(_ size: CGFloat, _ color: UIColor, bold: Bool) -> [NSAttributedString.Key: Any] {
      [
        .font: bold ? UIFont.boldSystemFont(ofSize: size) : UIFont.systemFont(ofSize: size),
        .foregroundColor: color,
      ]
    }

    func drawLine(_ text: String, x: CGFloat, maxWidth: CGFloat, _ attrs: [NSAttributedString.Key: Any]) -> CGFloat {
      let string = NSAttributedString(string: text, attributes: attrs)
      let measured = string.size()
      let width = min(measured.width, maxWidth)
      let rect = CGRect(x: x, y: (height - measured.height) / 2, width: width, height: measured.height)
      let style = NSMutableParagraphStyle()
      style.lineBreakMode = .byTruncatingTail
      var truncated = attrs
      truncated[.paragraphStyle] = style
      NSAttributedString(string: text, attributes: truncated).draw(with: rect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
      return width
    }

    // Right: the GameHubz pill.
    let brandAttrs = attributes(fontSize * 0.82, .white, bold: true)
    let brand = NSAttributedString(string: "GameHubz", attributes: brandAttrs)
    let brandSize = brand.size()
    let pillPadding = height * 0.25
    let pill = CGRect(
      x: width - padding - brandSize.width - pillPadding * 2,
      y: height * 0.18,
      width: brandSize.width + pillPadding * 2,
      height: height * 0.64
    )
    Self.accent.setFill()
    UIBezierPath(roundedRect: pill, cornerRadius: pill.height / 2).fill()
    brand.draw(at: CGPoint(x: pill.minX + pillPadding, y: (height - brandSize.height) / 2))

    // Left: the pairing.
    let nameAttrs = attributes(fontSize, .white, bold: true)
    let vsAttrs = attributes(fontSize * 0.8, Self.accent, bold: true)
    let maxName = width * 0.2
    var x = padding
    x += drawLine(config.homeName, x: x, maxWidth: maxName, nameAttrs) + padding * 0.6
    x += drawLine("vs", x: x, maxWidth: maxName, vsAttrs) + padding * 0.6
    x += drawLine(config.awayName, x: x, maxWidth: maxName, nameAttrs) + padding

    // Middle: tournament · round, in whatever room is left.
    let info = [config.tournamentName, config.roundLabel ?? ""]
      .filter { !$0.isEmpty }
      .joined(separator: "  ·  ")
    let room = pill.minX - padding - x
    if !info.isEmpty && room > fontSize * 2 {
      _ = drawLine(info, x: x, maxWidth: room, attributes(fontSize * 0.82, Self.muted, bold: false))
    }
  }
}
