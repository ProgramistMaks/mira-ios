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
                .onChange(of: scenePhase, initial: true) { _, phase in
                    store.voice.setSceneActive(phase == .active)
                    if phase == .active { store.liveActivities.setForeground(true) }
                    if phase == .background {
                        store.localModel.pause()
                        let continueSpeech = store.voice.speaking
                        if !continueSpeech { store.cancel() }
                        store.liveActivities.setForeground(false, continuingSpeech: continueSpeech)
                    }
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
    @State private var frameRate = 60
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSettings = false
    @State private var showCommands = false
    @State private var pendingRoute: MiraRoute?
    @State private var routeWaitingForDismiss = false
    @FocusState private var composerFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var phase: CompanionPhase {
        if voice.recording { return .listening }
        if store.thinking || voice.preparing { return .thinking }
        if voice.speaking { return .speaking }
        return .idle
    }
    private var status: String {
        if voice.requestingRecording { return "Готовлю запись" }
        if voice.preparing { return "Готовлю голос" }
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
                let wide = geometry.size.width >= 600
                let layout = wide ? AnyLayout(HStackLayout(spacing: 0)) : AnyLayout(VStackLayout(spacing: 0))
                layout {
                    stage.frame(width: wide ? geometry.size.width * 0.46 : nil,
                                height: wide ? nil : max(160, geometry.size.height * 0.40))
                    conversation.padding(.trailing, wide ? 20 : 0)
                }
            }
            .background(Palette.background)
        }
        .tint(Palette.lavender)
        .sheet(isPresented: $showSettings, onDismiss: didDismissSheet) { SettingsView(store: store, voice: voice).tint(Palette.lavender).miraSheet() }
        .sheet(item: $store.proposedCommand, onDismiss: didDismissSheet) { proposal in
            CommandsView(store: store, proposal: proposal).tint(Palette.lavender).miraSheet()
        }
        .sheet(isPresented: $showCommands, onDismiss: didDismissSheet) { CommandsView(store: store).tint(Palette.lavender).miraSheet() }
        .alert("Не получилось", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("Понятно") { store.error = nil }
        } message: { Text(store.error ?? "") }
        .onAppear { updateFrameRate() }
        .onOpenURL { url in
            guard let route = MiraRoute(url: url) else { return }
            pendingRoute = route
            if showSettings || showCommands || store.proposedCommand != nil {
                routeWaitingForDismiss = true
                showSettings = false; showCommands = false; store.proposedCommand = nil
            } else { consumeRoute() }
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { consumeRoute() } }
        .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange).receive(on: RunLoop.main)) { _ in updateFrameRate() }
        .onReceive(NotificationCenter.default.publisher(for: ProcessInfo.thermalStateDidChangeNotification).receive(on: RunLoop.main)) { _ in updateFrameRate() }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { notification in
            guard let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: value) == .began else { return }
            store.cancel()
        }
    }
    private func didDismissSheet() {
        routeWaitingForDismiss = false
        consumeRoute()
    }
    private func consumeRoute() {
        guard scenePhase == .active, !routeWaitingForDismiss, !showSettings, !showCommands, store.proposedCommand == nil,
              let route = pendingRoute else { return }
        pendingRoute = nil
        switch route {
        case .chat: composerFocused = true
        case .commands: composerFocused = false; showCommands = true
        case .settings: composerFocused = false; showSettings = true
        }
    }
    private func updateFrameRate() {
        let device = ProcessInfo.processInfo
        frameRate = device.isLowPowerModeEnabled || device.thermalState == .serious || device.thermalState == .critical ? 30 : 60
    }
    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkle").font(.title2).foregroundStyle(Palette.lavender)
            VStack(alignment: .leading, spacing: 2) {
                Text("мира").font(.system(size: 26, weight: .semibold, design: .rounded))
                Text("ТВОЙ ЛИЧНЫЙ КОМПАНЬОН").font(.system(size: 9, weight: .medium)).tracking(2).foregroundStyle(.secondary)
            }
            Spacer()
            MiraGlassGroup {
                HStack(spacing: 10) {
                    Button { showCommands = true } label: { Image(systemName: "square.grid.2x2").frame(width: 24, height: 28) }
                        .miraGlassButton().accessibilityLabel("Команды")
                    Button { showSettings = true } label: { Image(systemName: "slider.horizontal.3").frame(width: 24, height: 28) }
                        .miraGlassButton().accessibilityLabel("Настройки")
                }.controlSize(.large)
            }
        }
    }
    private var stage: some View {
        ZStack(alignment: .bottom) {
            RadialGradient(colors: [Palette.lavender.opacity(0.17), .clear], center: .center, startRadius: 15, endRadius: 300)
            VStack(spacing: 0) {
                AvatarView(phase: phase, voice: voice, reduceMotion: reduceMotion,
                           frameRate: frameRate,
                           active: scenePhase == .active && !showSettings && !showCommands && store.proposedCommand == nil,
                           ready: $store.characterReady, error: $store.characterError)
                Color.clear.frame(height: 54)
            }
            if !store.characterReady && store.characterError == nil {
                ProgressView("Загружаю персонажа…")
                    .font(.callout).tint(Palette.lavender)
                    .frame(maxHeight: .infinity).allowsHitTesting(false)
            }
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
            .miraGlass(in: Capsule()).padding(.bottom, 16)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(store.characterError ?? (store.characterReady ? "Мира. \(status)" : "Мира. Загружаю персонажа"))
        .accessibilityIdentifier(store.characterReady ? "avatar.ready" : "avatar.loading")
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
        MiraGlassGroup {
        HStack(alignment: .bottom, spacing: 10) {
            Button {
                if voice.recordingBusy { voice.stopRecording() }
                else {
                    composerFocused = false
                    Task { await store.startRecording() }
                }
            } label: {
                Image(systemName: voice.recordingBusy ? "stop.circle.fill" : "mic")
                    .font(.title3).frame(width: 24, height: 28)
                    .foregroundStyle(voice.recordingBusy ? Palette.background : Palette.lavender)
            }.miraGlassButton(prominent: voice.recordingBusy)
                .disabled(store.thinking)
                .accessibilityLabel(voice.requestingRecording ? "Отменить запись" : (voice.recording ? "Закончить запись" : "Начать запись"))
            TextField("Напиши Мире…", text: $store.draft, axis: .vertical)
                .lineLimit(1...5).padding(.horizontal, 16).padding(.vertical, 14)
                .miraGlass(in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                .accessibilityIdentifier("conversation.input")
                .disabled(voice.recordingBusy)
                .focused($composerFocused)
            Button {
                if store.thinking || voice.busy { store.cancel() } else { composerFocused = false; store.send() }
            } label: {
                Image(systemName: store.thinking || voice.busy ? "stop.fill" : "arrow.up")
                    .font(.system(size: 17, weight: .semibold)).frame(width: 24, height: 28)
                    .foregroundStyle(Palette.background)
            }
            .miraGlassButton(prominent: true)
            .disabled(voice.recordingBusy || (!store.thinking && !voice.busy && store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            .accessibilityLabel(store.thinking || voice.busy ? "Остановить" : "Отправить")
        }.controlSize(.large)
        }
    }
}
