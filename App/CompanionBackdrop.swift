import SwiftUI

/// The cream reference's warm paper surface; glass belongs to the controls.
struct CompanionBackdrop: View {
    @Environment(\.miraPalette) private var palette
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                palette.background
                RadialGradient(colors: [palette.honey.opacity(0.55), .clear],
                               center: .topLeading, startRadius: 0, endRadius: geometry.size.height * 0.8)
                RadialGradient(colors: [palette.glow.opacity(0.8), .clear],
                               center: .trailing, startRadius: 0, endRadius: geometry.size.width * 0.85)
                Canvas { context, size in
                    let marks: [(CGFloat, CGFloat, CGFloat)] = [(0.84, 0.21, 17), (0.13, 0.49, 10), (0.89, 0.63, 8)]
                    for (x, y, radius) in marks {
                        let center = CGPoint(x: size.width * x, y: size.height * y)
                        var star = Path()
                        star.move(to: CGPoint(x: center.x, y: center.y - radius))
                        star.addQuadCurve(to: CGPoint(x: center.x + radius, y: center.y), control: center)
                        star.addQuadCurve(to: CGPoint(x: center.x, y: center.y + radius), control: center)
                        star.addQuadCurve(to: CGPoint(x: center.x - radius, y: center.y), control: center)
                        star.addQuadCurve(to: CGPoint(x: center.x, y: center.y - radius), control: center)
                        context.stroke(star, with: .color(palette.accent.opacity(0.2)), lineWidth: 1)
                    }
                }
            }
        }.ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
    }
}
