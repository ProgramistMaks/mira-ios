import ActivityKit
import SwiftUI
import WidgetKit

struct MiraConversationActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MiraActivityAttributes.self) { context in
            MiraActivityCard(context: context)
                .padding(16)
                .activityBackgroundTint(Color(red: 0.12, green: 0.13, blue: 0.11))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(MiraRoute.chat.url)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Мира", systemImage: "sparkles").font(.headline)
                        .foregroundStyle(MiraActivityCard.honey)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(systemName: context.isStale ? "arrow.clockwise" : context.state.phase.symbol)
                        .accessibilityLabel(context.isStale ? "Открой Миру" : context.state.phase.title)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    MiraActivityCard(context: context, showTitle: false).padding(.top, 4)
                }
            } compactLeading: {
                Image(systemName: "sparkles").foregroundStyle(MiraActivityCard.honey)
                    .accessibilityLabel("Мира")
            } compactTrailing: {
                Image(systemName: context.isStale ? "arrow.clockwise" : context.state.phase.symbol)
                    .accessibilityLabel(context.isStale ? "Открой Миру" : context.state.phase.title)
            } minimal: {
                Image(systemName: context.isStale ? "sparkles" : context.state.phase.symbol)
                    .foregroundStyle(MiraActivityCard.honey)
                    .accessibilityLabel(context.isStale ? "Открой Миру" : "Мира. \(context.state.phase.title)")
            }
            .widgetURL(MiraRoute.chat.url)
            .keylineTint(MiraActivityCard.honey)
        }
    }
}

private struct MiraActivityCard: View {
    static let honey = Color(red: 0.906, green: 0.863, blue: 0.714)
    let context: ActivityViewContext<MiraActivityAttributes>
    var showTitle = true
    private var running: Bool { context.state.phase.isRunning && !context.isStale }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                if showTitle {
                    Image(systemName: "sparkles").font(.title2).foregroundStyle(Self.honey)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 3) {
                    if showTitle { Text("Мира").font(.headline) }
                    Text(context.isStale ? "Открой Миру, чтобы продолжить" : context.state.phase.title)
                        .font(.subheadline).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                if running {
                    Text(context.attributes.startedAt, style: .timer)
                        .font(.caption.monospacedDigit()).foregroundStyle(Self.honey)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 65)
                        .accessibilityLabel("Время разговора")
                }
            }
            HStack(spacing: 12) {
                Link(destination: MiraRoute.chat.url) {
                    Label("Открыть", systemImage: "arrow.up.right")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                if context.state.phase.isRunning {
                    Button(intent: StopMiraActivityIntent(sessionID: context.attributes.sessionID)) {
                        Label("Остановить", systemImage: "stop.fill")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                }
            }
            .font(.subheadline.weight(.medium))
            .buttonStyle(.bordered).tint(Self.honey)
        }.foregroundStyle(.white)
    }
}

#Preview("Разговор", as: .content, using: MiraActivityAttributes(sessionID: "preview", startedAt: .now)) {
    MiraConversationActivity()
} contentStates: {
    MiraActivityAttributes.ContentState(phase: .listening)
    MiraActivityAttributes.ContentState(phase: .thinking)
    MiraActivityAttributes.ContentState(phase: .speaking)
    MiraActivityAttributes.ContentState(phase: .paused)
}
