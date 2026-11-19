import SwiftUI

struct VoiceHomeControls: View {
    @Environment(\.miraPalette) private var palette
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    @ObservedObject var model: LocalModelStore
    @ObservedObject var routines: RoutineStore
    let openChat: () -> Void
    private var ready: Bool {
        (store.settings.inferenceMode ?? .cloud) == .local ? model.installed : store.cloudConfigured
    }
    private var canInterrupt: Bool { store.automatic.active && (store.thinking || voice.busy) }
    private var title: String {
        if routines.runningID != nil { return "Выполняю сценарий" }
        if store.searching { return "Сейчас найду" }
        if voice.requestingRecording { return "Включим микрофон?" }
        if voice.finishingRecording { return "Услышала тебя" }
        if voice.recording { return "Я слушаю тебя" }
        if store.thinking { return "Дай подумать…" }
        if voice.preparing { return "Сейчас отвечу" }
        if voice.speaking { return "Вот что я думаю…" }
        return ready ? "Давай поговорим" : "Привет, я Мира"
    }
    private var detail: String {
        if routines.runningID != nil { return routines.progress }
        if voice.requestingRecording { return "Разреши доступ к речи и микрофону." }
        if store.automatic.active { return "Разговор продолжается, пока ты его не завершишь." }
        if voice.busy { return "Так звучит мой голос." }
        return ready ? "Обо всём на свете. Или просто о твоём дне." : "Могу выполнить сценарий. Для беседы выбери ИИ в настройках."
    }
    private var actionLabel: String {
        store.automatic.active ? "Завершить" : (voice.busy || routines.runningID != nil ? "Остановить" : "Начать разговор")
    }
    var body: some View {
        VStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.system(.callout, design: .rounded, weight: .semibold))
                    .foregroundStyle(palette.ink).accessibilityIdentifier("home.status")
                Text(voice.recording && !store.liveTranscript.isEmpty ? store.liveTranscript : detail)
                    .font(.footnote).foregroundStyle(palette.muted)
                    .multilineTextAlignment(.leading).lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(palette.surface.opacity(0.72), in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(palette.outline.opacity(0.8), lineWidth: 0.7))
            MiraGlassGroup {
                HStack(spacing: 8) {
                    Button(action: openChat) {
                        Image(systemName: "text.bubble").font(.system(size: 18, weight: .regular))
                            .frame(width: 44, height: 48)
                    }.buttonStyle(.plain).foregroundStyle(palette.ink)
                        .accessibilityLabel("Открыть чат").accessibilityIdentifier("home.chat")
                    Button {
                        if store.automatic.active || voice.busy || routines.runningID != nil { store.cancel() }
                        else { Task { await store.startAutomaticConversation() } }
                    } label: {
                        Label(store.automatic.active || voice.busy || routines.runningID != nil ? "Закончить" : "Поговорим",
                              systemImage: store.automatic.active || voice.busy || routines.runningID != nil ? "stop.fill" : "mic.fill")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }.miraVoiceButton().tint(palette.honey).foregroundStyle(palette.ink)
                        .accessibilityLabel(actionLabel).accessibilityIdentifier("home.conversation").layoutPriority(-1)
                    if canInterrupt {
                        Button { Task { await store.interruptAutomaticConversation() } } label: {
                            Image(systemName: "hand.raised").font(.system(size: 18)).frame(width: 44, height: 48)
                        }.buttonStyle(.plain).accessibilityLabel("Перебить и говорить")
                            .accessibilityIdentifier("home.interrupt")
                    }
                }.padding(8)
                    .miraGlass(in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: palette.accent.opacity(0.06), radius: 12, x: 0, y: 4)
            }
            if routines.study != nil { StudyControls(routines: routines) }
            if let error = routines.error { MiraNotice(text: error, symbol: "exclamationmark.circle") }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) {
                statusChip(ready ? "ИИ выбран" : "ИИ не выбран", symbol: "sparkle")
                statusChip(voice.recording ? "Микрофон вкл." : "Микрофон выкл.", symbol: "mic")

                }
                Text(voice.recording ? "Слушаю · ответ голосом автоматически" : "Ответ голосом автоматически")
                    .font(.caption2).foregroundStyle(palette.muted)
            }.frame(maxWidth: .infinity, alignment: .trailing)
        }.foregroundStyle(palette.ink).accessibilityIdentifier("home.controls")
    }
    private func statusChip(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .font(.system(size: 9, weight: .medium)).foregroundStyle(palette.muted)
            .padding(.horizontal, 6).padding(.vertical, 4)
            .background(palette.surface.opacity(0.65), in: Capsule())
            .accessibilityElement(children: .combine)
    }

}
