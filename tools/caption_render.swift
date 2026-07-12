// Caption rasterizer: renders each caption beat to a transparent PNG with
// native macOS typography (SF via systemFont — the "Apple-level" look the
// brand calls for). Called by src/localRenderer.ts; compiled once to
// data/bin/caption_render. Emphasis phrase = heavier weight + 12% larger,
// cream on transparent, soft dark shadow for legibility on video.
//
// Usage: caption_render <spec.json>
// Spec: { "width": 1080, "outDir": "...", "fontSize": 58,
//         "lines": [{ "id": "c0", "text": "...", "emphasis": "..." }] }

// A second mode renders a full-frame STATIC TEXT CARD (mode: "card") — the
// 4-6s read-a-card short format validated by three independent outliers
// (docs/curio/WINNING_REFERENCES.md): serif amber title, numbered cream list
// with one amber emphasis per item, soft signature footer. Output: card.png.

import AppKit

struct LineSpec: Decodable { let id: String; let text: String; let emphasis: String }
struct Spec: Decodable {
  let width: Double
  let outDir: String
  let fontSize: Double
  let lines: [LineSpec]
  let mode: String?      // nil | "lines" | "card"
  let height: Double?    // card mode canvas height
  let title: String?     // card headline
  let footer: String?    // soft signature
}

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}

guard CommandLine.arguments.count == 2 else { fail("usage: caption_render <spec.json>") }
let specData = (try? Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) ?? Data()
guard let spec = try? JSONDecoder().decode(Spec.self, from: specData) else { fail("bad spec json") }

let cream = NSColor(srgbRed: 0xF5 / 255.0, green: 0xEF / 255.0, blue: 0xE2 / 255.0, alpha: 1)
let amber = NSColor(srgbRed: 0xE8 / 255.0, green: 0xB4 / 255.0, blue: 0x4F / 255.0, alpha: 1)
let outDir = URL(fileURLWithPath: spec.outDir)
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

func serifFont(size: Double, weight: NSFont.Weight) -> NSFont {
  let base = NSFont.systemFont(ofSize: size, weight: weight)
  if let desc = base.fontDescriptor.withDesign(.serif), let f = NSFont(descriptor: desc, size: size) {
    return f
  }
  return base
}

func writePng(_ rep: NSBitmapImageRep, _ name: String) {
  guard let png = rep.representation(using: .png, properties: [:]) else { fail("png encode failed for \(name)") }
  try? png.write(to: outDir.appendingPathComponent(name))
}

func makeBitmap(_ pxW: Int, _ pxH: Int) -> NSBitmapImageRep {
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pxW, pixelsHigh: pxH,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
  ) else { fail("bitmap alloc failed") }
  rep.size = NSSize(width: Double(pxW), height: Double(pxH)) // 1pt == 1px
  return rep
}

// ---------------------------------------------------------------------------
// CARD MODE: one full-frame static card (title + numbered list + footer).
// ---------------------------------------------------------------------------
if spec.mode == "card" {
  let W = spec.width
  let H = spec.height ?? 1920
  let rep = makeBitmap(Int(W), Int(H))

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

  // Obsidian base with a faint vertical lift toward the top third.
  let bg = NSGradient(colors: [
    NSColor(srgbRed: 0x16 / 255.0, green: 0x12 / 255.0, blue: 0x1B / 255.0, alpha: 1),
    NSColor(srgbRed: 0x07 / 255.0, green: 0x07 / 255.0, blue: 0x0C / 255.0, alpha: 1),
  ])
  bg?.draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -90)

  let body = NSMutableAttributedString()

  let titlePara = NSMutableParagraphStyle()
  titlePara.alignment = .center
  titlePara.paragraphSpacing = 64
  titlePara.lineHeightMultiple = 1.08
  body.append(NSAttributedString(
    string: (spec.title ?? "Curio") + "\n",
    attributes: [.font: serifFont(size: 74, weight: .bold), .foregroundColor: amber, .paragraphStyle: titlePara]
  ))

  let itemPara = NSMutableParagraphStyle()
  itemPara.alignment = .center
  itemPara.paragraphSpacing = 34
  itemPara.lineHeightMultiple = 1.16
  for (i, line) in spec.lines.enumerated() {
    let numbered = NSMutableAttributedString(
      string: "\(i + 1).  ",
      attributes: [.font: NSFont.systemFont(ofSize: spec.fontSize, weight: .bold), .foregroundColor: amber, .paragraphStyle: itemPara]
    )
    let item = NSMutableAttributedString(
      string: line.text + "\n",
      attributes: [.font: NSFont.systemFont(ofSize: spec.fontSize, weight: .semibold), .foregroundColor: cream, .paragraphStyle: itemPara]
    )
    if !line.emphasis.isEmpty, let r = line.text.range(of: line.emphasis, options: .caseInsensitive) {
      item.addAttribute(.foregroundColor, value: amber, range: NSRange(r, in: line.text))
    }
    numbered.append(item)
    body.append(numbered)
  }

  if let footer = spec.footer, !footer.isEmpty {
    let footPara = NSMutableParagraphStyle()
    footPara.alignment = .center
    footPara.paragraphSpacingBefore = 58
    body.append(NSAttributedString(
      string: footer,
      attributes: [.font: serifFont(size: 32, weight: .medium),
                   .foregroundColor: cream.withAlphaComponent(0.62),
                   .paragraphStyle: footPara]
    ))
  }

  // Vertically center the block inside comfortable margins.
  let contentW = W * 0.82
  let measured = body.boundingRect(
    with: NSSize(width: contentW, height: .greatestFiniteMagnitude),
    options: [.usesLineFragmentOrigin, .usesFontLeading]
  )
  let blockH = min(ceil(measured.height), H - 240)
  let originY = (H - blockH) / 2
  body.draw(
    with: NSRect(x: (W - contentW) / 2, y: originY, width: contentW, height: blockH),
    options: [.usesLineFragmentOrigin, .usesFontLeading]
  )

  NSGraphicsContext.restoreGraphicsState()
  writePng(rep, "card.png")
  exit(0)
}

for line in spec.lines {
  let para = NSMutableParagraphStyle()
  para.alignment = .center
  para.lineBreakMode = .byWordWrapping

  let shadow = NSShadow()
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.55)
  shadow.shadowBlurRadius = 14
  shadow.shadowOffset = NSSize(width: 0, height: -2)

  let attr = NSMutableAttributedString(
    string: line.text,
    attributes: [
      .font: NSFont.systemFont(ofSize: spec.fontSize, weight: .semibold),
      .foregroundColor: cream,
      .paragraphStyle: para,
      .shadow: shadow,
    ]
  )
  if !line.emphasis.isEmpty, let r = line.text.range(of: line.emphasis, options: .caseInsensitive) {
    attr.addAttribute(
      .font,
      value: NSFont.systemFont(ofSize: spec.fontSize * 1.12, weight: .heavy),
      range: NSRange(r, in: line.text)
    )
  }

  let maxTextW = spec.width * 0.86
  let bounds = attr.boundingRect(
    with: NSSize(width: maxTextW, height: .greatestFiniteMagnitude),
    options: [.usesLineFragmentOrigin, .usesFontLeading]
  )
  let pxW = Int(spec.width)
  let pxH = Int(ceil(bounds.height) + 64) // headroom for shadow blur

  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pxW, pixelsHigh: pxH,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
  ) else { fail("bitmap alloc failed for \(line.id)") }
  rep.size = NSSize(width: Double(pxW), height: Double(pxH)) // 1 point == 1 pixel, no retina 2x surprise

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  attr.draw(
    with: NSRect(x: (spec.width - maxTextW) / 2, y: 32, width: maxTextW, height: ceil(bounds.height)),
    options: [.usesLineFragmentOrigin, .usesFontLeading]
  )
  NSGraphicsContext.restoreGraphicsState()

  guard let png = rep.representation(using: .png, properties: [:]) else { fail("png encode failed for \(line.id)") }
  try? png.write(to: outDir.appendingPathComponent("\(line.id).png"))
}
