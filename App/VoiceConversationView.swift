import SwiftUI

/// A deliberate voice turn: record -> inspect/edit -> send -> interrupt/replay.
/// Entering this mode never opens the microphone or sends a saved draft.
struct VoiceConversationView: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    let switchToText: () -> Void
    @FocusState private var editing: Bool
    private var phase: VoiceConversationPhase {
        .current(authorizing: voice.requestingRecording, recording: voice.recording,
                 finishing: voice.finishingRecording, thinking: store.thinking,
                 preparing: voice.preparing, speaking: voice.speaking)
    }
    private var reply: Message? { store.messages.last { $0.role == .assistant } }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text(phase.title).font(.title2.weight(.semibold))
                        .accessibilityIdentifier("voice.status")
                    Spacer(minLength: 8)
                    Button(action: switchToText) { Label("В текст", systemImage: "keyboard") }
                        .font(.callout).frame(minHeight: 44).accessibilityIdentifier("voice.textMode")
                }
                if voice.recording {
                    MicrophoneLevelView(voice: voice)
                    Text("Микрофон включён. Нажми «Закончить фразу», когда договоришь.")
                        .font(.footnote).foregroundStyle(.secondary)
                } else if voice.requestingRecording || voice.finishingRecording {
                    HStack { ProgressView(); Text(voice.finishingRecording ? "Микрофон уже выключен — жду последние слова." : "Разреши доступ к микрофону и распознаванию речи.") }
                        .font(.footnote).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("ТВОЯ РЕПЛИКА").font(.caption2.weight(.semibold)).tracking(1.5)
                        .foregroundStyle(Palette.lavender)
                    TextField("Нажми «Говорить» или напиши здесь…", text: $store.draft, axis: .vertical)
                        .lineLimit(2...5).focused($editing)
                        .disabled(voice.recordingBusy)
                        .accessibilityIdentifier("voice.draft")
                    if !phase.capturing {
                        Text("Проверь текст и отправь. Запись сама ничего не отправляет.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.panel, in: RoundedRectangle(cornerRadius: 20))
                if let reply {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("МИРА").font(.caption2.weight(.semibold)).tracking(1.5)
                            Spacer()
                            if !reply.interrupted && !reply.content.isEmpty {
                                Button { store.replay(reply) } label: { Label("Повторить", systemImage: "speaker.wave.2") }
                                    .disabled(store.thinking || voice.recordingBusy || voice.busy)
                                    .frame(minHeight: 44).accessibilityIdentifier("voice.replay")
                            }
                        }.foregroundStyle(Palette.lavender)
                        if reply.content.isEmpty && store.thinking { ProgressView("Готовлю ответ…") }
                        else { Text(reply.content).font(.body).lineSpacing(4).textSelection(.enabled) }
                        if reply.interrupted && store.activeID != reply.id {
                            Text(reply.interruption?.title ?? "Ответ прерван").font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.top, 4)
                } else {
                    Text("Ответ Миры появится здесь и прозвучит вслух. Можно перебить ответ и начать новую реплику.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Text(store.settings.inferenceMode == .local
                     ? "Локальный режим: для голоса нужно доступное на iPhone распознавание. Если его нет, используй текст."
                     : "Облачный режим: распознавание может обрабатываться Apple; отправленная реплика — выбранным ИИ-сервисом.")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            controls
                .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 8)
                .background(Palette.background)
        }
        .accessibilityIdentifier("voice.panel")
    }
    private var controls: some View {
        VStack(spacing: 12) {
            Button {
                editing = false
                switch phase {
                case .authorizing, .finishing: voice.stopRecording()
                case .listening: voice.finishRecording()
                case .thinking, .preparing, .speaking: Task { await store.interruptAndRecord() }
                case .ready: Task { await store.startRecording() }
                }
            } label: {
                Label(phase.microphoneTitle, systemImage: phase.capturing ? "stop.circle.fill" : "mic.fill")
                    .font(.headline).frame(maxWidth: .infinity, minHeight: 48)
            }
            .miraVoiceButton().tint(Palette.lavender).foregroundStyle(Palette.background)
            .accessibilityIdentifier("voice.microphone")
            HStack(spacing: 16) {
                if phase.canInterrupt {
                    Button { store.cancel() } label: { Label("Остановить ответ", systemImage: "stop.fill") }
                        .frame(minHeight: 44).accessibilityIdentifier("voice.stop")
                }
                Spacer(minLength: 0)
                Button {
                    editing = false
                    store.send(speakReply: true)
                } label: { Label("Отправить реплику", systemImage: "arrow.up.circle.fill") }
                    .disabled(!phase.canSend(store.draft)).frame(minHeight: 44)
                    .accessibilityIdentifier("voice.send")
            }.font(.callout.weight(.medium))
        }
    }
}

private struct MicrophoneLevelView: View {
    let voice: VoiceService
    @State private var level = 0.0
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "mic.fill").foregroundStyle(Palette.lavender)
            ProgressView(value: level).tint(Palette.lavender)
        }
        .frame(minHeight: 20)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Уровень микрофона")
        .accessibilityValue(level > 0.05 ? "Есть звук" : "Тихо")
        .accessibilityIdentifier("voice.level")
        .onReceive(voice.inputLevels) { level = $0 }
    }
}
