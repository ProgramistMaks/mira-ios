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
        VStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.system(.callout, design: .rounded, weight: .semibold))
                    .foregroundStyle(Palette.ink).accessibilityIdentifier("home.status")
                Text(voice.recording && !store.liveTranscript.isEmpty ? store.liveTranscript : detail)
                    .font(.footnote).foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.leading).lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.48), in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.8), lineWidth: 0.7))
            MiraGlassGroup {
                HStack(spacing: 8) {
                    Button(action: openChat) {
                        Image(systemName: "text.bubble").font(.system(size: 18, weight: .regular))
                            .frame(width: 44, height: 48)
                    }.buttonStyle(.plain).foregroundStyle(Palette.ink)
                        .accessibilityLabel("Открыть чат").accessibilityIdentifier("home.chat")
                    Button {
                        if store.automatic.active || voice.busy { store.cancel() }
                        else if ready { Task { await store.startAutomaticConversation() } }
                        else { openSettings() }
                    } label: {
                        Label(store.automatic.active || voice.busy ? "Закончить" : (ready ? "Поговорим" : "Начнём?"),
                              systemImage: store.automatic.active || voice.busy ? "stop.fill" : "mic.fill")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity, minHeight: 32)
                    }.miraVoiceButton().tint(Palette.honey).foregroundStyle(Palette.ink)
                        .accessibilityLabel(actionLabel).accessibilityIdentifier("home.conversation").layoutPriority(-1)
                    if canInterrupt {
                        Button { Task { await store.interruptAutomaticConversation() } } label: {
                            Image(systemName: "hand.raised").font(.system(size: 18)).frame(width: 44, height: 48)
                        }.buttonStyle(.plain).accessibilityLabel("Перебить и говорить")
                            .accessibilityIdentifier("home.interrupt")
                    } else {
                        Button {
                            if voice.busy { store.cancel() } else { store.previewVoice() }
                        } label: {
                            Image(systemName: voice.busy ? "speaker.slash" : "speaker.wave.2")
                                .font(.system(size: 18)).frame(width: 44, height: 48)
                        }.buttonStyle(.plain).disabled(store.automatic.active)
                            .accessibilityLabel(voice.busy ? "Остановить голос" : "Послушать Миру")
                            .accessibilityIdentifier("home.previewVoice")
                    }
                }.padding(8)
                    .miraGlass(in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: Palette.accent.opacity(0.06), radius: 12, x: 0, y: 4)
            }
            HStack(spacing: 6) {
                statusChip(ready ? "ИИ выбран" : "ИИ не выбран", symbol: "sparkle")
                statusChip(voice.recording ? "Микрофон вкл." : "Микрофон выкл.", symbol: "mic")
                statusChip("Голос iOS", symbol: "waveform")
            }.frame(maxWidth: .infinity, alignment: .trailing)
        }.foregroundStyle(Palette.ink).accessibilityIdentifier("home.controls")
    }
    private func statusChip(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .font(.system(size: 9, weight: .medium)).foregroundStyle(Palette.muted)
            .padding(.horizontal, 6).padding(.vertical, 4)
            .background(.white.opacity(0.4), in: Capsule())
            .accessibilityElement(children: .combine)
    }

}
