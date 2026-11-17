import SwiftUI
import AVFoundation

@main
struct CompanionApp: App {
    @StateObject private var store = CompanionStore()
    @AppStorage("interfaceTheme") private var themeID = MiraTheme.cream.rawValue
    private var theme: MiraTheme { MiraTheme(rawValue: themeID) ?? .cream }
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            CompanionView(store: store, voice: store.voice)
                .environment(\.miraPalette, theme.palette)
                .preferredColorScheme(theme.scheme)
                .onChange(of: scenePhase, initial: true) { _, phase in
                    // The avatar resumes the mouth clock only when visible and ready.
                    if phase != .active { store.voice.setSceneActive(false) }
                    if phase == .active { store.liveActivities.setForeground(true) }
                    if phase == .background {
                        store.disarmAutomaticConversation()
                        store.routines.cancel()
                        store.localModel.pause()
                        let continueSpeech = store.voice.speaking
                        if !continueSpeech { store.cancel(reason: .background) }
                        store.liveActivities.setForeground(false, continuingSpeech: continueSpeech)
                    }
                }
        }
    }
}

struct CompanionView: View {
    @Environment(\.miraPalette) private var palette
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    @State private var controlsHeight: CGFloat = 200
    @State private var frameRate = 60
    @State private var screenMaximumFPS = 60
    @AppStorage("expressionsEnabled") private var expressionsEnabled = true
    @AppStorage("expressionEmotion") private var expressionEmotion = "auto"
    @AppStorage("expressionIntensity") private var expressionIntensity = 0.7
    @AppStorage("expressionVariant") private var expressionVariant = -1
    @AppStorage("characterID") private var characterID = "vita"
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
        GeometryReader { geometry in
            let plan = CompanionLayoutPlan(size: geometry.size, preferredControlsHeight: controlsHeight,
                                           divisions: DuoGeometry.divisions(in: geometry), occlusions: DuoGeometry.occlusions(in: geometry))
            ZStack(alignment: .topLeading) {
                // One stable WKWebView across folding, rotation and theme changes.
                stage.clipped().placed(in: plan.scene)
                header.padding(.horizontal, plan.header.width < 360 ? 12 : 20).placed(in: plan.header)
                ScrollView {
                    VoiceHomeControls(store: store, voice: voice, model: store.localModel, routines: store.routines,
                                      openChat: switchToText)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { controlsHeight = $0 }
                        .frame(maxWidth: 440)
                        .frame(maxWidth: .infinity, minHeight: plan.controls.height, alignment: .center)
                }.scrollBounceBehavior(.basedOnSize).placed(in: plan.controls)
            }
        }
        .background(CompanionBackdrop())
        .foregroundStyle(palette.ink)
        .tint(palette.accent)
        .sheet(isPresented: $showChat, onDismiss: { store.cancel(); didDismissSheet() }) {
            NavigationStack {
                conversation
                    .background(palette.background)
                    .navigationTitle(searchMode ? "Поиск" : "Разговор").navigationBarTitleDisplayMode(.inline)
                    .sheet(item: Binding(get: { showChat ? store.proposedCommand : nil }, set: { store.proposedCommand = $0 })) { proposal in
                        CommandsView(store: store, proposal: proposal).tint(palette.accent).miraSheet()
                    }
                    .sheet(item: Binding(get: { showChat ? store.proposedRoutine : nil }, set: { store.proposedRoutine = $0 })) { routine in
                        RoutineReview(companion: store, routines: store.routines, routine: routine).miraSheet()
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
            }
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
            .alert("Не получилось", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
                Button("Понятно") { store.error = nil }
            } message: { Text(store.error ?? "") }
            .tint(palette.accent).miraSheet()
        }
        .sheet(isPresented: $showSettings, onDismiss: didDismissSheet) { SettingsView(store: store, voice: voice, screenMaximumFPS: screenMaximumFPS).tint(palette.accent).miraSheet() }
        .sheet(item: Binding(get: { showChat ? nil : store.proposedCommand }, set: { store.proposedCommand = $0 }), onDismiss: didDismissSheet) { proposal in
            CommandsView(store: store, proposal: proposal).tint(palette.accent).miraSheet()
        }
        .sheet(item: Binding(get: { showChat ? nil : store.proposedRoutine }, set: { store.proposedRoutine = $0 }), onDismiss: didDismissSheet) { routine in
            RoutineReview(companion: store, routines: store.routines, routine: routine).miraSheet()
        }
        .sheet(isPresented: $showCommands, onDismiss: didDismissSheet) { CommandsView(store: store).tint(palette.accent).miraSheet() }
        .alert("Не получилось", isPresented: Binding(get: { store.error != nil && !showChat && !showSettings }, set: { if !$0 { store.error = nil } })) {
            Button("Понятно") { store.error = nil }
        } message: { Text(store.error ?? "") }
        .onAppear { updateFrameRate() }
        .onOpenURL { url in
            guard let route = MiraRoute(url: url) else { return }
            pendingRoute = route
            if showSettings || showCommands || showChat || store.proposedCommand != nil || store.proposedRoutine != nil {
                routeWaitingForDismiss = true
                showSettings = false; showCommands = false; showChat = false; store.proposedCommand = nil; store.proposedRoutine = nil
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
        guard scenePhase == .active, !routeWaitingForDismiss, !showSettings, !showCommands, !showChat, store.proposedCommand == nil, store.proposedRoutine == nil,
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
        ViewThatFits(in: .horizontal) {
            fullHeader.frame(minWidth: 240)
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                Button { store.cancel(); composerFocused = false; showCommands = true } label: {
                    Image(systemName: "square.stack.3d.up").frame(width: 44, height: 44)
                }.accessibilityLabel("Команды").accessibilityIdentifier("home.commands")
                Button(action: openSettings) { Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44) }
                    .accessibilityLabel("Настройки")
            }.buttonStyle(.plain)
        }
    }
    private var fullHeader: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                Text("мира").font(.system(size: 22, weight: .bold, design: .rounded)).tracking(-0.8)
                Image(systemName: "sparkle").font(.system(size: 14, weight: .light)).foregroundStyle(palette.accent)
            }
            Spacer(minLength: 0)
            HStack(spacing: 2) {
                ViewThatFits(in: .horizontal) {
                    Label("Главная", systemImage: "house")
                    Image(systemName: "house").accessibilityLabel("Главная")
                }
                    .font(.system(size: 12, weight: .medium)).padding(.horizontal, 10).frame(height: 36)
                    .background(palette.surface, in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityAddTraits(.isSelected)
                Button {
                    store.cancel(); composerFocused = false; showCommands = true
                } label: {
                    Image(systemName: "square.stack.3d.up").frame(width: 44, height: 44)
                }.accessibilityLabel("Команды").accessibilityIdentifier("home.commands")
                Button(action: openSettings) {
                    Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44)
                }.accessibilityLabel("Настройки")
            }.font(.system(size: 16)).buttonStyle(.plain).padding(.horizontal, 4)
                .miraGlass(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
    private var stage: some View {
        ZStack {
            VStack {
                Spacer()
                Ellipse().fill(palette.accent.opacity(0.12))
                    .frame(width: 160, height: 16).blur(radius: 12).padding(.bottom, 12)
            }.allowsHitTesting(false).accessibilityHidden(true)
            AvatarView(phase: phase, characterID: characterID, expressionEmotion: expressionEmotion,
                       expressionIntensity: expressionIntensity, expressionVariant: expressionVariant, expressionsEnabled: expressionsEnabled, voice: voice, reduceMotion: reduceMotion,
                       frameRate: frameRate,
                       active: scenePhase == .active && !showSettings && !showCommands && !showChat && store.proposedCommand == nil && store.proposedRoutine == nil,
                       screenMaximumFPS: $screenMaximumFPS,
                       ready: $store.characterReady, error: $store.characterError)
            if !store.characterReady && store.characterError == nil {
                ProgressView("Загружаю персонажа…").tint(palette.accent).allowsHitTesting(false)
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
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if store.messages.isEmpty {
                            VStack(alignment: .leading, spacing: 16) {
                                MiraScreenIntro(title: searchMode ? "Что найдём?" : "О чём поговорим?",
                                                detail: searchMode ? "Задай вопрос — найденные источники останутся здесь." : "Расскажи, как прошёл день, или начни с небольшой идеи.",
                                                symbol: searchMode ? "globe" : "text.bubble")
                                    .accessibilityIdentifier("conversation.welcome")
                                if store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                    ForEach(searchMode ? ["Что нового в космосе?", "Идеи для прогулки"] : ["Давай придумаем идею", "Помоги составить план на день"], id: \.self) { prompt in
                                        Button {
                                            store.draft = prompt; composerFocused = true
                                        } label: {
                                            HStack { Text(prompt); Spacer(); Image(systemName: "arrow.up.left") }
                                                .font(.subheadline).padding(14).frame(maxWidth: .infinity, minHeight: 44)
                                                .background(palette.surface, in: RoundedRectangle(cornerRadius: 14))
                                        }.buttonStyle(.plain).disabled(voice.recordingBusy || store.thinking)
                                    }
                                }
                            }.padding(.vertical, 16)
                        }
                        ForEach(store.messages) { message in
                            ConversationMessageView(message: message, active: store.activeID == message.id,
                                searching: store.searching, canRestore: store.question(for: message.id) != nil,
                                busy: store.thinking || voice.recordingBusy,
                                restore: {
                                    if store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        if store.restoreQuestion(for: message.id) { composerFocused = true }
                                    } else { questionToRestore = message.id }
                                })
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
            VStack(alignment: .leading, spacing: 8) {
                if searchMode {
                    Label("Поиск в интернете · источники сохранятся в чате", systemImage: "globe")
                        .font(.caption).foregroundStyle(palette.muted)
                }
                composer
            }.padding(16)
                .background(palette.background)
                .overlay(alignment: .top) { Rectangle().fill(palette.accent.opacity(0.12)).frame(height: 0.7) }
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
                    .foregroundStyle(voice.recordingBusy ? palette.background : palette.accent)
            }.miraGlassButton(prominent: voice.recordingBusy)
                .disabled(store.thinking)
                .accessibilityLabel(voice.finishingRecording ? "Оставить текущий текст" : (voice.requestingRecording ? "Отменить запись" : (voice.recording ? "Закончить запись" : "Начать запись")))
            TextField(searchMode ? "Что найти в интернете?" : "Напиши Мире…", text: $store.draft, axis: .vertical)
                .lineLimit(1...5).padding(.horizontal, 16).padding(.vertical, 14)
                .miraGlass(in: RoundedRectangle(cornerRadius: 18, style: .continuous))
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
                    .foregroundStyle(palette.background)
            }
            .miraGlassButton(prominent: true)
            .disabled(voice.recordingBusy || (!store.thinking && !voice.busy && store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            .accessibilityLabel(store.thinking || voice.busy ? "Остановить" : "Отправить")
        }.controlSize(.large)
        }
    }
}
