import SwiftUI

struct MiraPalette {
    let background, panel, ink, accent, honey, muted, surface, outline, glow: Color
    init(_ background: UInt32, _ panel: UInt32, _ ink: UInt32, _ accent: UInt32,
         _ honey: UInt32, _ muted: UInt32, _ surface: UInt32, _ outline: UInt32, _ glow: UInt32) {
        func c(_ value: UInt32) -> Color {
            Color(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255,
                  blue: Double(value & 255) / 255)
        }
        self.background = c(background); self.panel = c(panel); self.ink = c(ink)
        self.accent = c(accent); self.honey = c(honey); self.muted = c(muted)
        self.surface = c(surface); self.outline = c(outline); self.glow = c(glow)
    }
}

enum MiraTheme: String, CaseIterable, Codable, Identifiable {
    case cream, night, rose, sage
    var id: String { rawValue }
    var title: String {
        switch self { case .cream: return "Кремовая"; case .night: return "Ночная"; case .rose: return "Сакура"; case .sage: return "Шалфей" }
    }
    var scheme: ColorScheme { self == .night ? .dark : .light }
    var palette: MiraPalette {
        switch self {
        case .cream: return MiraPalette(0xf3f0e6, 0xe9e5d9, 0x32372f, 0x776536, 0xe7dcb6, 0x62675b, 0xfffdf8, 0xffffff, 0xffffff)
        case .night: return MiraPalette(0x181b26, 0x252939, 0xeeeaf7, 0xc3b6ed, 0x49415f, 0xb5b1c4, 0x282c3c, 0x55566b, 0x33374c)
        case .rose: return MiraPalette(0xf7eded, 0xeedfe2, 0x44353d, 0x92576b, 0xe9cbd4, 0x75616a, 0xfff9f9, 0xffffff, 0xfff8ef)
        case .sage: return MiraPalette(0xeef2e9, 0xdfe7d8, 0x2f3e35, 0x4c715e, 0xcbdcc6, 0x5e7065, 0xf9fcf5, 0xffffff, 0xf5f7df)
        }
    }
}

private struct MiraPaletteKey: EnvironmentKey { static let defaultValue = MiraTheme.cream.palette }
extension EnvironmentValues {
    var miraPalette: MiraPalette {
        get { self[MiraPaletteKey.self] }
        set { self[MiraPaletteKey.self] = newValue }
    }
}

struct ThemeSelectionView: View {
    @AppStorage("interfaceTheme") private var selection = MiraTheme.cream.rawValue
    var body: some View {
        ForEach(MiraTheme.allCases) { theme in
            Button { selection = theme.rawValue } label: {
                HStack(spacing: 14) {
                    HStack(spacing: 3) {
                        Circle().fill(theme.palette.background)
                        Circle().fill(theme.palette.honey)
                        Circle().fill(theme.palette.accent)
                    }.frame(width: 66, height: 18).padding(10)
                        .background(theme.palette.panel, in: RoundedRectangle(cornerRadius: 12))
                    Text(theme.title)
                    Spacer(minLength: 0)
                    if selection == theme.rawValue { Image(systemName: "checkmark.circle.fill") }
                }.frame(minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityAddTraits(selection == theme.rawValue ? [.isSelected] : [])
                .accessibilityIdentifier("theme.\(theme.rawValue)")
        }
    }
}
