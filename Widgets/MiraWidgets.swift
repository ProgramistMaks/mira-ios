import SwiftUI
import WidgetKit

@main
struct MiraWidgets: WidgetBundle {
    var body: some Widget {
        MiraQuickAccessWidget()
        MiraConversationActivity()
    }
}

private struct MiraEntry: TimelineEntry { let date: Date }
private struct MiraProvider: TimelineProvider {
    func placeholder(in context: Context) -> MiraEntry { MiraEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (MiraEntry) -> Void) {
        completion(MiraEntry(date: .now))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MiraEntry>) -> Void) {
        // Quick actions do not pretend to be a live status or copy private chat data.
        completion(Timeline(entries: [MiraEntry(date: .now)], policy: .never))
    }
}

struct MiraQuickAccessWidget: Widget {
    let kind = "MiraQuickAccess"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MiraProvider()) { _ in
            MiraQuickAccessView().containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Рядом с Мирой")
        .description("Открыть разговор, команды и настройки Миры.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

private struct MiraQuickAccessView: View {
    @Environment(\.widgetFamily) private var family
    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Label("Разговор с Мирой", systemImage: "sparkles")
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "sparkles").font(.title2).widgetAccentable()
                }.accessibilityLabel("Открыть разговор с Мирой")
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 3) {
                    Label("Мира", systemImage: "sparkles").font(.headline).widgetAccentable()
                    Text("Открыть разговор").font(.caption)
                }
            case .systemMedium:
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Image(systemName: "sparkles").font(.title).widgetAccentable().accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("мира").font(.system(.title2, design: .rounded, weight: .semibold))
                            Text("Твой личный компаньон").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Link(destination: MiraRoute.settings.url) {
                            Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44)
                        }.accessibilityLabel("Настройки")
                    }
                    HStack(spacing: 8) {
                        action("Поговорить", symbol: "bubble.left.and.bubble.right", route: .chat)
                        action("Команды", symbol: "square.grid.2x2", route: .commands)
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 10) {
                    identity
                    Spacer(minLength: 0)
                    HStack {
                        Text("Поговорим?").font(.subheadline)
                        Spacer(minLength: 4)
                        Image(systemName: "arrow.up.right").accessibilityHidden(true)
                    }
                }
            }
        }
        .widgetURL(MiraRoute.chat.url)
    }
    private var identity: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "sparkles").font(.title).widgetAccentable().accessibilityHidden(true)
            Text("мира").font(.system(.title2, design: .rounded, weight: .semibold))
        }
    }
    private func action(_ title: String, symbol: String, route: MiraRoute) -> some View {
        Link(destination: route.url) {
            Label(title, systemImage: symbol)
                .font(.caption.weight(.medium))
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .center)
                .padding(.horizontal, 10)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
        }.accessibilityLabel(title)
    }
}

#Preview(as: .systemSmall) { MiraQuickAccessWidget() } timeline: { MiraEntry(date: .now) }
#Preview(as: .systemMedium) { MiraQuickAccessWidget() } timeline: { MiraEntry(date: .now) }
#Preview(as: .accessoryRectangular) { MiraQuickAccessWidget() } timeline: { MiraEntry(date: .now) }
