import SwiftUI
import AVFoundation

@main
struct CompanionApp: App {
    @StateObject private var store = CompanionStore()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            CompanionView(store: store, voice: store.voice)
                .preferredColorScheme(.dark)
                .onChange(of: scenePhase) { _, phase in
                    if phase != .active { store.cancel() }
                }
        }
    }
}

enum Palette {
    static let background = Color(red: 0.055, green: 0.055, blue: 0.075)
    static let lavender = Color(red: 0.76, green: 0.70, blue: 0.96)
    static let panel = Color(red: 0.105, green: 0.10, blue: 0.14)
}

struct CompanionView: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    @State private var showSettings = false
    @State private var showCommands = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var phase: CompanionPhase {
        if voice.recording { return .listening }
        if store.thinking { return .thinking }
        if voice.speaking { return .speaking }
        return .idle
    }
    private var status: String {
        switch phase {
        case .idle: return "Рядом с тобой"
        case .listening: return "Слушаю тебя"
        case .thinking: return "Обдумываю ответ"
        case .speaking: return "Разговариваю с тобой"
        }
    }
    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                header.padding(.horizontal, 24).padding(.vertical, 14)
                if geometry.size.width >= 700 {
                    HStack(spacing: 0) {
                        stage.frame(width: geometry.size.width * 0.46)
                        conversation.padding(.trailing, 20)
                    }
                } else {
                    VStack(spacing: 0) {
                        stage.frame(height: max(160, geometry.size.height * 0.40))
                        conversation
                    }
                }
            }
            .background(Palette.background)
        }
        .tint(Palette.lavender)
        .sheet(isPresented: $showSettings) { SettingsView(store: store, voice: voice) }
        .sheet(isPresented: $showCommands) { CommandsView(store: store) }
        .alert("Не получилось", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("Понятно") { store.error = nil }
        } message: { Text(store.error ?? "") }
        .onChange(of: voice.transcript) { _, text in store.draft = text }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { _ in
            store.cancel()
        }
    }
    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkle").font(.title2).foregroundStyle(Palette.lavender)
            VStack(alignment: .leading, spacing: 2) {
                Text("мира").font(.system(size: 26, weight: .semibold, design: .rounded))
                Text("ТВОЙ ЛИЧНЫЙ КОМПАНЬОН").font(.system(size: 9, weight: .medium)).tracking(2).foregroundStyle(.secondary)
            }
            Spacer()
            Button { showCommands = true } label: { Image(systemName: "square.grid.2x2").frame(width: 44, height: 44) }
                .accessibilityLabel("Команды")
            Button { showSettings = true } label: { Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44) }
                .accessibilityLabel("Настройки")
        }
    }
    private var stage: some View {
        ZStack(alignment: .bottom) {
            RadialGradient(colors: [Palette.lavender.opacity(0.17), .clear], center: .center, startRadius: 15, endRadius: 300)
            AvatarView(phase: phase, reduceMotion: reduceMotion, ready: $store.characterReady, error: $store.characterError)
            if let error = store.characterError {
                VStack(spacing: 12) {
                    Image(systemName: "person.crop.rectangle.badge.exclamationmark").font(.largeTitle)
                    Text(error).font(.callout).multilineTextAlignment(.center)
                }.padding(32).frame(maxHeight: .infinity).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                Circle().fill(Palette.lavender).frame(width: 5, height: 5)
                Text(status).font(.caption)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule()).padding(.bottom, 16)
        }
        .accessibilityElement(children: .ignore).accessibilityLabel("Мира. \(status)")
    }
    private var conversation: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 20) {
                        if store.messages.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("О чём поговорим?").font(.system(size: 28, weight: .medium, design: .serif))
                                Text("Расскажи, как прошёл день.\nИли давай придумаем что-нибудь вместе.")
                                    .font(.callout).foregroundStyle(.secondary)
                            }.padding(.vertical, 24)
                        }
                        ForEach(store.messages) { message in
                            VStack(alignment: .leading, spacing: 7) {
                                Text(message.role == .user ? "ТЫ" : "МИРА")
                                    .font(.system(size: 9, weight: .semibold)).tracking(2).foregroundStyle(Palette.lavender)
                                if message.content.isEmpty && store.thinking { ProgressView() }
                                else { Text(message.content).textSelection(.enabled).font(.system(size: 16)).lineSpacing(5) }
                                if message.interrupted && !store.thinking {
                                    Text("Ответ прерван").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                            .background(message.role == .user ? Palette.panel : .clear, in: RoundedRectangle(cornerRadius: 20))
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }.padding(.horizontal, 20)
                }
                .defaultScrollAnchor(.bottom)
                .onChange(of: store.messages.last?.content) { _, _ in proxy.scrollTo("bottom", anchor: .bottom) }
            }
            composer.padding(16)
        }
    }
    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Button {
                if voice.recording { voice.stopRecording() }
                else { Task { do { try await voice.startRecording() } catch { store.error = error.localizedDescription } } }
            } label: {
                Image(systemName: voice.recording ? "stop.circle.fill" : "mic")
                    .font(.title3).frame(width: 44, height: 44)
            }.disabled(store.thinking).accessibilityLabel(voice.recording ? "Закончить запись" : "Начать запись")
            TextField("Напиши Мире…", text: $store.draft, axis: .vertical)
                .lineLimit(1...5).padding(.vertical, 12)
            Button {
                if store.thinking || voice.speaking { store.cancel() } else { store.send() }
            } label: {
                Image(systemName: store.thinking || voice.speaking ? "stop.fill" : "arrow.up")
                    .font(.system(size: 17, weight: .semibold)).frame(width: 44, height: 44)
                    .foregroundStyle(Palette.background).background(Palette.lavender, in: Circle())
            }
            .disabled(voice.recording || (!store.thinking && !voice.speaking && store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            .accessibilityLabel(store.thinking || voice.speaking ? "Остановить" : "Отправить")
        }.padding(8).background(Palette.panel, in: RoundedRectangle(cornerRadius: 30))
    }
}
