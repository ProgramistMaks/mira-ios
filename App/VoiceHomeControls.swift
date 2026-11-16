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
    private var title: String {
        if store.searching { return "Ищу в интернете" }
        if voice.requestingRecording { return "Разреши доступ к микрофону" }
        if voice.finishingRecording { return "Секунду…" }
        if voice.recording { return "Слушаю тебя" }
        if store.thinking { return "Обдумываю ответ" }
        if voice.preparing { return "Готовлю голос" }
        if voice.speaking { return "Говорю с тобой" }
        return ready ? "Давай поговорим" : "Давай познакомимся"
    }
    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 8) {
                Text(title).font(.title2.weight(.medium)).accessibilityIdentifier("home.status")
                if voice.recording && !store.liveTranscript.isEmpty {
                    Text(store.liveTranscript).font(.callout).lineLimit(2)
                } else if store.automatic.active {
                    Text("После ответа я снова буду слушать.").font(.footnote).foregroundStyle(.secondary)
                } else {
                    Text(ready ? "Включи разговор и говори свободно." : "Выбери модель для ответов. Мой голос можно послушать уже сейчас.")
                        .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
            }.frame(maxWidth: .infinity)
            HStack(spacing: 12) {
                Button(action: openChat) {
                    Image(systemName: "text.bubble").font(.title3).frame(width: 28, height: 32)
                }.miraGlassButton().controlSize(.large)
                    .accessibilityLabel("Открыть чат").accessibilityIdentifier("home.chat")
                Button {
                    if store.automatic.active || voice.busy { store.cancel() }
                    else if ready { Task { await store.startAutomaticConversation() } }
                    else { openSettings() }
                } label: {
                    Label(store.automatic.active ? "Завершить" : (voice.busy ? "Остановить" : (ready ? "Начать разговор" : "Подготовить Миру")),
                          systemImage: store.automatic.active || voice.busy ? "stop.fill" : "mic.fill")
                        .font(.headline).frame(maxWidth: .infinity, minHeight: 54)
                }.miraVoiceButton().tint(Palette.lavender).foregroundStyle(Palette.background)
                    .accessibilityIdentifier("home.conversation")
            }
            if store.automatic.active && (store.thinking || voice.busy) {
                Button("Перебить и говорить", systemImage: "hand.raised") {
                    Task { await store.interruptAutomaticConversation() }
                }.frame(minHeight: 44).accessibilityIdentifier("home.interrupt")
            } else if !store.automatic.active && !voice.busy {
                Button("Послушать Миру", systemImage: "speaker.wave.2") { store.previewVoice() }
                    .frame(minHeight: 44).accessibilityIdentifier("home.previewVoice")
            }
        }
        .padding(20)
        .miraGlass(in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .accessibilityIdentifier("home.controls")
    }
}
