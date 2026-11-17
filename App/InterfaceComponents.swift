import SwiftUI

/// Shared content surfaces. Native glass stays on navigation and action controls.
struct MiraScreenIntro: View {
    @Environment(\.miraPalette) private var palette
    let title: String
    let detail: String
    let symbol: String
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol).font(.system(size: 20, weight: .medium))
                .foregroundStyle(palette.accent).frame(width: 44, height: 44)
                .background(palette.honey.opacity(0.45), in: RoundedRectangle(cornerRadius: 13))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.headline).foregroundStyle(palette.ink)
                Text(detail).font(.subheadline).foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.padding(.vertical, 6)
    }
}

struct MiraSettingsRow: View {
    @Environment(\.miraPalette) private var palette
    let title: String
    let detail: String
    let symbol: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 17))
                .foregroundStyle(palette.accent).frame(width: 36, height: 36)
                .background(palette.honey.opacity(0.35), in: RoundedRectangle(cornerRadius: 10))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.body.weight(.medium)).foregroundStyle(palette.ink)
                Text(detail).font(.caption).foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.padding(.vertical, 3)
    }
}

struct MiraBadge: View {
    @Environment(\.miraPalette) private var palette
    let title: String
    var symbol: String? = nil
    var body: some View {
        HStack(spacing: 4) {
            if let symbol { Image(systemName: symbol).accessibilityHidden(true) }
            Text(title)
        }.font(.caption.weight(.medium)).foregroundStyle(palette.accent)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(palette.honey.opacity(0.38), in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct MiraNotice: View {
    @Environment(\.miraPalette) private var palette
    let text: String
    var symbol = "info.circle"
    var body: some View {
        Label {
            Text(text).font(.footnote).fixedSize(horizontal: false, vertical: true)
        } icon: { Image(systemName: symbol) }
            .foregroundStyle(palette.accent).padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(palette.honey.opacity(0.22), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct MiraSourceLink: View {
    @Environment(\.miraPalette) private var palette
    let title: String
    let url: URL
    var body: some View {
        Link(destination: url) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "globe").font(.body).foregroundStyle(palette.accent)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.subheadline.weight(.medium)).foregroundStyle(palette.ink).lineLimit(3)
                    Text(url.host ?? "Источник").font(.caption).foregroundStyle(palette.muted)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(palette.accent)
            }.padding(12).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .background(palette.panel.opacity(0.55), in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain)
    }
}

private struct MiraFormStyle: ViewModifier {
    @Environment(\.miraPalette) private var palette
    func body(content: Content) -> some View {
        content.scrollContentBackground(.hidden)
            .background(palette.background)
            .listSectionSpacing(16)
            .environment(\.defaultMinListRowHeight, 48)
            .tint(palette.accent).foregroundStyle(palette.ink)
    }
}

extension View {
    func miraForm() -> some View { modifier(MiraFormStyle()) }
}
