import SwiftUI

/// Keep glass in the control layer. Conversation text and form rows stay content.
struct MiraGlassGroup<Content: View>: View {
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: 8) { content }
        } else {
            content
        }
    }
}

private struct MiraGlassSurface<S: Shape>: ViewModifier {
    let shape: S
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            // Native glass adapts to Reduce Transparency, Increase Contrast and Reduce Motion.
            content.glassEffect(.regular, in: shape)
        } else if reduceTransparency {
            content.background(Palette.panel, in: shape)
                .overlay(shape.strokeBorderFallback(contrast == .increased ? 0.5 : 0.2))
        } else {
            content.background(.regularMaterial, in: shape)
                .overlay(shape.strokeBorderFallback(contrast == .increased ? 0.5 : 0.16))
        }
    }
}

private extension Shape {
    func strokeBorderFallback(_ opacity: Double) -> some View {
        stroke(.white.opacity(opacity), lineWidth: 1).allowsHitTesting(false)
    }
}

private struct MiraGlassButton: ViewModifier {
    let prominent: Bool
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if prominent {
                content.buttonStyle(.glassProminent).buttonBorderShape(.circle)
            } else {
                content.buttonStyle(.glass).buttonBorderShape(.circle)
            }
        } else if prominent {
            content.buttonStyle(.borderedProminent).buttonBorderShape(.circle)
        } else {
            content.buttonStyle(.bordered).buttonBorderShape(.circle)
                .tint(reduceTransparency ? .white : Palette.lavender)
        }
    }
}

extension View {
    @ViewBuilder
    func miraVoiceButton() -> some View {
        if #available(iOS 26.0, *) {
            buttonStyle(.glassProminent).buttonBorderShape(.capsule)
        } else {
            buttonStyle(.borderedProminent).buttonBorderShape(.capsule)
        }
    }
    func miraGlass<S: Shape>(in shape: S) -> some View {
        modifier(MiraGlassSurface(shape: shape))
    }
    func miraGlassButton(prominent: Bool = false) -> some View {
        modifier(MiraGlassButton(prominent: prominent))
    }
    func miraSheet() -> some View {
        presentationDragIndicator(.visible)
            .presentationCornerRadius(32)
    }
}
