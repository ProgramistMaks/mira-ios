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
    @Environment(\.miraPalette) private var palette
    let shape: S
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            // Native glass adapts to Reduce Transparency, Increase Contrast and Reduce Motion.
            content.glassEffect(.regular, in: shape)
        } else if reduceTransparency {
            content.background(palette.panel, in: shape)
                .overlay(shape.stroke(palette.accent.opacity(contrast == .increased ? 0.5 : 0.2), lineWidth: 0.7))
        } else {
            content.background(.regularMaterial, in: shape)
                .overlay(shape.stroke(palette.accent.opacity(contrast == .increased ? 0.5 : 0.16), lineWidth: 0.7))
        }
    }
}

private struct MiraGlassButton: ViewModifier {
    @Environment(\.miraPalette) private var palette
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
                .tint(reduceTransparency ? palette.ink : palette.accent)
        }
    }
}

extension View {
    @ViewBuilder
    func miraVoiceButton() -> some View {
        if #available(iOS 26.0, *) {
            buttonStyle(.glassProminent).buttonBorderShape(.roundedRectangle(radius: 12))
        } else {
            buttonStyle(.borderedProminent).buttonBorderShape(.roundedRectangle(radius: 12))
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
