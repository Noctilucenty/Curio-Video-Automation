// Caption rasterizer: renders each caption beat to a transparent PNG with
// native macOS typography (SF via systemFont — the "Apple-level" look the
// brand calls for). Called by src/localRenderer.ts; compiled once to
// data/bin/caption_render. Emphasis phrase = heavier weight + 12% larger,
// cream on transparent, soft dark shadow for legibility on video.
//
// Usage: caption_render <spec.json>
// Spec: { "width": 1080, "outDir": "...", "fontSize": 58,
//         "lines": [{ "id": "c0", "text": "...", "emphasis": "..." }] }

import AppKit

struct LineSpec: Decodable { let id: String; let text: String; let emphasis: String }
struct Spec: Decodable { let width: Double; let outDir: String; let fontSize: Double; let lines: [LineSpec] }

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}

guard CommandLine.arguments.count == 2 else { fail("usage: caption_render <spec.json>") }
let specData = (try? Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) ?? Data()
guard let spec = try? JSONDecoder().decode(Spec.self, from: specData) else { fail("bad spec json") }

let cream = NSColor(srgbRed: 0xF5 / 255.0, green: 0xEF / 255.0, blue: 0xE2 / 255.0, alpha: 1)
let outDir = URL(fileURLWithPath: spec.outDir)
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

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
