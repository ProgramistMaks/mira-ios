import SwiftUI

struct VoiceHomeControls: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    @ObservedObject var model: LocalModelStore
    let openSettings: () -> Void
    let openChat: () -> Void
    private var ready: Bool {
        (store.settings.inferenceMode ?? .cloud) == .local ? model.installed : store.cloudConfigured
    }
    private var canInterrupt: Bool { store.automatic.active && (store.thinking || voice.busy) }
    private var title: String {
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
        if voice.requestingRecording { return "Разреши доступ к речи и микрофону." }
        if store.automatic.active { return "Разговор продолжается, пока ты его не завершишь." }
        if voice.busy { return "Так звучит мой голос." }
        return ready ? "Обо всём на свете. Или просто о твоём дне." : "Выбери модель — и давай знакомиться."
    }
    private var actionLabel: String {
        store.automatic.active ? "Завершить" : (voice.busy ? "Остановить" : (ready ? "Начать разговор" : "Подготовить Миру"))
    }
    var body: some View {
        VStack(spacing: 18) {
            VStack(spacing: 8) {
                Text(title).font(.system(.title, design: .rounded, weight: .medium))
                    .foregroundStyle(Palette.ink).accessibilityIdentifier("home.status")
                Text(voice.recording && !store.liveTranscript.isEmpty ? store.liveTranscript : detail)
                    .font(.subheadline).foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.center).lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity)
            MiraGlassGroup {
                HStack(spacing: 12) {
                    Button(action: openChat) {
                        Image(systemName: "text.bubble").font(.system(size: 20, weight: .regular))
                            .frame(width: 48, height: 56)
                    }.buttonStyle(.plain).foregroundStyle(Palette.ink)
                        .accessibilityLabel("Открыть чат").accessibilityIdentifier("home.chat")
                    Button {
                        if store.automatic.active || voice.busy { store.cancel() }
                        else if ready { Task { await store.startAutomaticConversation() } }
                        else { openSettings() }
                    } label: {
                        Label(store.automatic.active || voice.busy ? "Закончить" : (ready ? "Поговорим" : "Начнём?"),
                              systemImage: store.automatic.active || voice.busy ? "stop.fill" : "mic.fill")
                            .font(.system(.headline, design: .rounded)).lineLimit(1).minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }.miraVoiceButton().tint(Palette.honey).foregroundStyle(Palette.ink)
                        .accessibilityLabel(actionLabel).accessibilityIdentifier("home.conversation").layoutPriority(-1)
                    if canInterrupt {
                        Button { Task { await store.interruptAutomaticConversation() } } label: {
                            Image(systemName: "hand.raised").font(.system(size: 20)).frame(width: 48, height: 56)
                        }.buttonStyle(.plain).accessibilityLabel("Перебить и говорить")
                            .accessibilityIdentifier("home.interrupt")
                    } else {
                        Button {
                            if voice.busy { store.cancel() } else { store.previewVoice() }
                        } label: {
                            Image(systemName: voice.busy ? "speaker.slash" : "speaker.wave.2")
                                .font(.system(size: 20)).frame(width: 48, height: 56)
                        }.buttonStyle(.plain).disabled(store.automatic.active)
                            .accessibilityLabel(voice.busy ? "Остановить голос" : "Послушать Миру")
                            .accessibilityIdentifier("home.previewVoice")
                    }
                }.padding(10)
                    .miraGlass(in: RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .shadow(color: Palette.accent.opacity(0.09), radius: 20, x: 0, y: 8)
            }
        }.foregroundStyle(Palette.ink).accessibilityIdentifier("home.controls")
    }
}
