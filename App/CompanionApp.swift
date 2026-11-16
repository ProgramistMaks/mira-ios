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
                    // The avatar resumes the mouth clock only when visible and ready.
                    if phase != .active { store.voice.setSceneActive(false) }
                    if phase == .active { store.liveActivities.setForeground(true) }
                    if phase == .background {
                        store.disarmAutomaticConversation()
                        store.localModel.pause()
                        let continueSpeech = store.voice.speaking
                        if !continueSpeech { store.cancel(reason: .background) }
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
    @State private var screenMaximumFPS = 60
    @AppStorage("animationFrameRate") private var requestedFrameRate = 120
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSettings = false
    @State private var showCommands = false
    @State private var showChat = false
    @State private var searchMode = false
    @State private var pendingRoute: MiraRoute?
    @State private var routeWaitingForDismiss = false
    @State private var questionToRestore: UUID?
    @FocusState private var composerFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var phase: CompanionPhase {
        if voice.recording { return .listening }
        if store.thinking || voice.preparing || voice.finishingRecording { return .thinking }
        if voice.speaking { return .speaking }
        return .idle
    }
    private var status: String {
        if voice.requestingRecording { return "Готовлю запись" }
        if voice.finishingRecording { return "Дописываю твою фразу" }
        if voice.preparing { return "Готовлю голос" }
        switch phase {
        case .idle: return "Рядом с тобой"
        case .listening: return "Слушаю тебя"
        case .thinking: return "Обдумываю ответ"
        case .speaking: return "Разговариваю с тобой"
        }
    }
    var body: some View {
        VStack(spacing: 0) {
            header.padding(.horizontal, 20).padding(.vertical, 12)
            GeometryReader { geometry in
                let wide = geometry.size.width >= 600 && geometry.size.width > geometry.size.height
                let layout = wide ? AnyLayout(HStackLayout(spacing: 20)) : AnyLayout(VStackLayout(spacing: 0))
                layout {
                    stage.frame(maxWidth: .infinity, maxHeight: .infinity).clipped()
                    VoiceHomeControls(store: store, voice: voice, model: store.localModel,
                                      openSettings: openSettings, openChat: switchToText)
                        .frame(width: wide ? min(360, geometry.size.width * 0.4) : nil)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 20).padding(.bottom, 20)
                        .layoutPriority(1)
                }
            }
        }
        .background(Palette.background)
        .tint(Palette.lavender)
        .sheet(isPresented: $showChat, onDismiss: { store.cancel(); didDismissSheet() }) {
            NavigationStack {
                conversation
                    .background(Palette.background)
                    .navigationTitle(searchMode ? "Поиск" : "Разговор").navigationBarTitleDisplayMode(.inline)
                    .sheet(item: Binding(get: { showChat ? store.proposedCommand : nil }, set: { store.proposedCommand = $0 })) { proposal in
                        CommandsView(store: store, proposal: proposal).tint(Palette.lavender).miraSheet()
                    }
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Команды") {
                                store.cancel(); pendingRoute = .commands; routeWaitingForDismiss = true; showChat = false
                            }
                        }
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(searchMode ? "Обычный чат" : "Поиск", systemImage: searchMode ? "text.bubble" : "globe") {
                                searchMode.toggle()
                            }.accessibilityIdentifier("conversation.searchMode")
                        }
                        ToolbarItem(placement: .confirmationAction) { Button("Готово") { showChat = false } }
                    }
            }.tint(Palette.lavender).miraSheet()
        }
        .sheet(isPresented: $showSettings, onDismiss: didDismissSheet) { SettingsView(store: store, voice: voice, screenMaximumFPS: screenMaximumFPS).tint(Palette.lavender).miraSheet() }
        .sheet(item: Binding(get: { showChat ? nil : store.proposedCommand }, set: { store.proposedCommand = $0 }), onDismiss: didDismissSheet) { proposal in
            CommandsView(store: store, proposal: proposal).tint(Palette.lavender).miraSheet()
        }
        .sheet(isPresented: $showCommands, onDismiss: didDismissSheet) { CommandsView(store: store).tint(Palette.lavender).miraSheet() }
        .alert("Не получилось", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("Понятно") { store.error = nil }
        } message: { Text(store.error ?? "") }
        .confirmationDialog("Заменить черновик исходным вопросом?", isPresented: Binding(
            get: { questionToRestore != nil }, set: { if !$0 { questionToRestore = nil } }
        ), titleVisibility: .visible, presenting: questionToRestore) { id in
            Button("Заменить черновик") {
                if store.restoreQuestion(for: id, replacingDraft: true) {
                    composerFocused = true
                }
                questionToRestore = nil
            }
            Button("Отмена", role: .cancel) { questionToRestore = nil }
        } message: { _ in
            Text("Вопрос появится в поле ввода. Отправка начнётся только после нажатия «Отправить».")
        }
        .onAppear { updateFrameRate() }
        .onOpenURL { url in
            guard let route = MiraRoute(url: url) else { return }
            pendingRoute = route
            if showSettings || showCommands || showChat || store.proposedCommand != nil {
                routeWaitingForDismiss = true
                showSettings = false; showCommands = false; showChat = false; store.proposedCommand = nil
            } else { consumeRoute() }
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { updateFrameRate(); consumeRoute() } }
        .onChange(of: requestedFrameRate) { _, _ in updateFrameRate() }
        .onChange(of: screenMaximumFPS) { _, _ in updateFrameRate() }
        .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange).receive(on: RunLoop.main)) { _ in updateFrameRate() }
        .onReceive(NotificationCenter.default.publisher(for: ProcessInfo.thermalStateDidChangeNotification).receive(on: RunLoop.main)) { _ in updateFrameRate() }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { notification in
            guard let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: value) == .began else { return }
            store.cancel(reason: .incomplete)
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { notification in
            guard let value = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  AVAudioSession.RouteChangeReason(rawValue: value) == .oldDeviceUnavailable else { return }
            store.cancel(reason: .incomplete)
        }
    }
    private func switchToText() {
        // Preserve the current draft; leaving voice mode never sends it or reopens a mic.
        store.cancel()
        showChat = true
        composerFocused = true
    }
    private func openSettings() {
        store.cancel(); composerFocused = false; showSettings = true
    }
    private func didDismissSheet() {
        routeWaitingForDismiss = false
        consumeRoute()
    }
    private func consumeRoute() {
        guard scenePhase == .active, !routeWaitingForDismiss, !showSettings, !showCommands, !showChat, store.proposedCommand == nil,
              let route = pendingRoute else { return }
        pendingRoute = nil
        switch route {
        case .chat: switchToText(); composerFocused = true
        case .commands: store.cancel(); composerFocused = false; showCommands = true
        case .settings: openSettings()
        }
    }
    private func updateFrameRate() {
        let device = ProcessInfo.processInfo
        let requested = [30, 60, 120, 240].contains(requestedFrameRate) ? requestedFrameRate : 120
        let constrained = device.isLowPowerModeEnabled || device.thermalState == .serious || device.thermalState == .critical
        frameRate = min(max(1, screenMaximumFPS), constrained ? 30 : requested)
    }
    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkle").font(.title2).foregroundStyle(Palette.lavender)
            Text("мира").font(.system(size: 24, weight: .semibold, design: .rounded))
            Spacer()
            Button(action: openSettings) {
                Image(systemName: "slider.horizontal.3").frame(width: 24, height: 28)
            }.miraGlassButton().controlSize(.large).accessibilityLabel("Настройки")
        }
    }
    private var stage: some View {
        ZStack {
            RadialGradient(colors: [Palette.lavender.opacity(0.19), .clear], center: .center, startRadius: 20, endRadius: 440)
            AvatarView(phase: phase, voice: voice, reduceMotion: reduceMotion,
                       frameRate: frameRate,
                       active: scenePhase == .active && !showSettings && !showCommands && !showChat && store.proposedCommand == nil,
                       screenMaximumFPS: $screenMaximumFPS,
                       ready: $store.characterReady, error: $store.characterError)
            if !store.characterReady && store.characterError == nil {
                ProgressView("Загружаю персонажа…").tint(Palette.lavender).allowsHitTesting(false)
            }
            if let error = store.characterError {
                Text(error).multilineTextAlignment(.center).padding(24).foregroundStyle(.secondary)
            }
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
                                Text("О чём поговорим?").font(.title2.weight(.medium))
                                    .accessibilityIdentifier("conversation.welcome")
                                Text("Расскажи, как прошёл день.")
                                    .font(.callout).foregroundStyle(.secondary)
                            }.padding(.vertical, 12)
                        }
                        ForEach(store.messages) { message in
                            VStack(alignment: .leading, spacing: 7) {
                                Text(message.role == .user ? "ТЫ" : "МИРА")
                                    .font(.system(size: 9, weight: .semibold)).tracking(2).foregroundStyle(Palette.lavender)
                                if message.content.isEmpty && store.activeID == message.id { ProgressView() }
                                else { Text(message.content).textSelection(.enabled).font(.system(size: 16)).lineSpacing(5) }
                                if let sources = message.sources {
                                    ForEach(sources) { source in
                                        if let url = source.safeURL {
                                            Link(source.title, destination: url).font(.callout)
                                        }
                                    }
                                }
                                if message.interrupted && store.activeID != message.id {
                                    Text(message.interruption?.title ?? "Ответ прерван")
                                        .font(.caption).foregroundStyle(.secondary)
                                        .accessibilityIdentifier("conversation.interrupted.\(message.id)")
                                    if store.question(for: message.id) != nil {
                                        Button {
                                            if store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                                if store.restoreQuestion(for: message.id) { composerFocused = true }
                                            } else { questionToRestore = message.id }
                                        } label: {
                                            Label("Вернуть вопрос", systemImage: "arrow.uturn.backward")
                                                .font(.caption).frame(minHeight: 44)
                                        }
                                        .disabled(store.thinking || voice.recordingBusy)
                                        .accessibilityIdentifier("conversation.restore.\(message.id)")
                                    }
                                }
                            }
                            .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                            .background(message.role == .user ? Palette.panel : .clear, in: RoundedRectangle(cornerRadius: 20))
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }.padding(.horizontal, 20)
                }
                .defaultScrollAnchor(store.messages.isEmpty ? .top : .bottom)
                .accessibilityIdentifier("conversation.messages")
                .onChange(of: store.messages.last?.content) { _, _ in
                    if !store.messages.isEmpty { proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }
            composer.padding(16)
        }
    }
    private var composer: some View {
        MiraGlassGroup {
        HStack(alignment: .bottom, spacing: 10) {
            Button {
                if voice.recording { voice.finishRecording() }
                else if voice.recordingBusy { voice.stopRecording() }
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
                .accessibilityLabel(voice.finishingRecording ? "Оставить текущий текст" : (voice.requestingRecording ? "Отменить запись" : (voice.recording ? "Закончить запись" : "Начать запись")))
            TextField(searchMode ? "Что найти в интернете?" : "Напиши Мире…", text: $store.draft, axis: .vertical)
                .lineLimit(1...5).padding(.horizontal, 16).padding(.vertical, 14)
                .miraGlass(in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                .accessibilityIdentifier("conversation.input")
                .disabled(voice.recordingBusy)
                .focused($composerFocused)
            Button {
                if store.thinking || voice.busy { store.cancel() }
                else {
                    composerFocused = false
                    if searchMode { store.searchWeb(store.draft, speakReply: store.settings.speakReplies, clearDraft: true) }
                    else { store.send() }
                }
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
