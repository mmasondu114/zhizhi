import AppKit
import Foundation
guard CommandLine.arguments.count == 2,
 let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
 let context = NSGraphicsContext(bitmapImageRep: bitmap) else { exit(1) }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor(calibratedRed: 0.46, green: 0.38, blue: 0.68, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 55, y: 55, width: 914, height: 914), xRadius: 215, yRadius: 215).fill()
let text = NSAttributedString(string: "枝", attributes: [.font: NSFont.systemFont(ofSize: 620, weight: .medium), .foregroundColor: NSColor.white])
let size = text.size()
text.draw(at: NSPoint(x: (1024-size.width)/2, y: (1024-size.height)/2 + 25))
NSGraphicsContext.restoreGraphicsState()
guard let data = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
try data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
