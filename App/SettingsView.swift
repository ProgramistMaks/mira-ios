import SwiftUI
import ActivityKit

struct SettingsView: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    var screenMaximumFPS: Int = 60
    @AppStorage("animationFrameRate") private var requestedFrameRate = 120
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var searchKey = ""
    @State private var searchSaved = false
    @State private var savedSearchKey = ""
    @State private var searchSucceeded = false
    @State private var saved = false
    @State private var checkingSearch = false
    @State private var searchCheck: String?
    @State private var searchProbe: Task<Void, Never>?
    @State private var error: String?
    @State private var confirmDelete = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    MiraScreenIntro(title: "Мира — по-твоему", detail: "Выбери ИИ, настрой голос и оставь только то, чем пользуешься.", symbol: "slider.horizontal.3")
                }.listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                modeSection
                LocalModelSection(model: store.localModel, busy: store.thinking)
                Section("Разговор") {
                    NavigationLink {
                        settingsPage("Голос и речь") { voiceSection }
                    } label: { MiraSettingsRow(title: "Голос и речь", detail: store.settings.offlineRecognition ? "Распознавание на устройстве" : "Разрешено распознавание Apple через интернет", symbol: "waveform") }
                    NavigationLink {
                        settingsPage("Поиск в интернете") { searchSection }
                    } label: { MiraSettingsRow(title: "Поиск в интернете", detail: store.searchConfigured ? "Ключ сохранён · можно проверить" : "Подключи поиск с источниками", symbol: "globe") }
                    NavigationLink {
                        settingsPage("Облачный ИИ") { cloudSection }
                    } label: { MiraSettingsRow(title: "Облачный ИИ", detail: store.cloudConfigured ? "Параметры сохранены" : "Необязательно для локальной модели", symbol: "cloud") }
                }
                Section("Приложение") {
                    NavigationLink {
                        settingsPage("Оформление") { Section("Тема") { ThemeSelectionView() } }
                    } label: { MiraSettingsRow(title: "Оформление", detail: "Кремовая, ночная, сакура и шалфей", symbol: "paintpalette") }
                    NavigationLink {
                        settingsPage("Виджеты и остров") { MiraActivitySettings(store: store, activities: store.liveActivities) }
                    } label: { MiraSettingsRow(title: "Виджеты и остров", detail: "Разговор на экране блокировки", symbol: "rectangle.topthird.inset.filled") }
                    NavigationLink {
                        settingsPage("Персонаж и анимация") { appearanceSection }
                    } label: { MiraSettingsRow(title: "Персонаж и анимация", detail: "Плавность и возможности экрана", symbol: "sparkles") }
                    NavigationLink {
                        settingsPage("История и данные") { dataSection }
                    } label: { MiraSettingsRow(title: "История и данные", detail: "Хранятся на этом устройстве", symbol: "internaldrive") }
                }
            }.miraForm().navigationTitle("Настройки").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { voice.stop(); dismiss() } } }
        }
        .onAppear {
            key = SecretStore.read(); searchKey = SecretStore.read(account: "tavily"); savedSearchKey = searchKey
        }
        .onChange(of: key) { _, _ in saved = false }
        .onChange(of: store.settings.baseURL) { _, _ in saved = false }
        .onChange(of: store.settings.model) { _, _ in saved = false }
        .onChange(of: searchKey) { _, _ in searchSaved = false; searchCheck = nil }
        .onDisappear { searchProbe?.cancel(); voice.stop(); store.persistPreferences(); store.refreshConnections() }
        .alert("Ошибка", isPresented: Binding(get: { error != nil || store.error != nil }, set: { if !$0 { error = nil; store.error = nil } })) {
            Button("Понятно") { error = nil; store.error = nil }
        } message: { Text(error ?? store.error ?? "") }
        .confirmationDialog("Удалить весь разговор?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { store.clearConversation() }
        }
    }
    private func settingsPage<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        Form { content() }.miraForm().navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .onDisappear { searchProbe?.cancel(); voice.stop(); store.persistPreferences(); store.refreshConnections() }
    }
    private var modeSection: some View {
        Section("Где работает ИИ") {
            Picker("Режим", selection: Binding(get: { store.settings.inferenceMode ?? .cloud },
                                               set: { store.settings.inferenceMode = $0 })) {
                Text("На iPhone").tag(InferenceMode.local)
                Text("В облаке").tag(InferenceMode.cloud)
            }.pickerStyle(.segmented).disabled(store.thinking)
            Text("На iPhone — после загрузки модели. В облаке — через выбранный сервис.")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }
    private var searchSection: some View {
        Section {
            SecureField("Ключ Tavily", text: $searchKey)
                .textInputAutocapitalization(.never).autocorrectionDisabled().disabled(checkingSearch)
            Button(searchSaved ? "Ключ поиска сохранён" : "Сохранить ключ поиска") {
                do {
                    try SecretStore.write(searchKey.trimmingCharacters(in: .whitespacesAndNewlines), account: "tavily")
                    savedSearchKey = searchKey.trimmingCharacters(in: .whitespacesAndNewlines)
                    searchSaved = true; searchCheck = nil; store.refreshConnections()
                } catch { self.error = error.localizedDescription }
            }
            .disabled(checkingSearch)
            Button(checkingSearch ? "Проверяю…" : "Проверить поиск") {
                checkingSearch = true; searchCheck = nil; searchSucceeded = false
                searchProbe = Task {
                    defer { checkingSearch = false }
                    do {
                        let hits = try await WebSearch().search("официальный сайт Apple", key: SecretStore.read(account: "tavily"))
                        try Task.checkCancellation()
                        searchSucceeded = true
                        searchCheck = hits.isEmpty ? "Сервис ответил, но не вернул источники." : "Поиск работает: получено источников — \(hits.count)."
                    } catch { if !Task.isCancelled { searchCheck = error.localizedDescription } }
                }
            }.disabled(checkingSearch || !store.searchConfigured || searchKey.trimmingCharacters(in: .whitespacesAndNewlines) != savedSearchKey)
            if let searchCheck { MiraNotice(text: searchCheck, symbol: searchSucceeded ? "checkmark.circle" : "exclamationmark.circle").accessibilityIdentifier("search.checkResult") }
        } header: { Text("Поиск в интернете") } footer: {
            Text("Скажи «найди в интернете…» — источники появятся в разговоре. Проверка выполняет один тестовый запрос. Tavily использует интернет и свой лимит запросов; ключ хранится только на устройстве.")
        }
    }
    private var voiceSection: some View {
        Section("Голос") {
            Toggle("Разрешить распознавание Apple через интернет", isOn: Binding(
                get: { store.settings.useAppleRecognition ?? false },
                set: { store.settings.useAppleRecognition = $0 }
            ))
            Text(store.settings.offlineRecognition
                 ? "Речь распознаётся только на устройстве. Если русский язык недоступен, можно разрешить обработку Apple."
                 : "Аудио может передаваться Apple для распознавания. Выбор локальной модели ИИ от этого не меняется.")
                .font(.footnote).foregroundStyle(.secondary)
            Toggle("Озвучивать текстовый чат", isOn: $store.settings.speakReplies)
            Text("В автоматическом разговоре Мира всегда отвечает голосом.").font(.footnote).foregroundStyle(.secondary)
            NavigationLink {
                VoiceLibraryView(store: store, voice: voice)
            } label: { MiraSettingsRow(title: "Библиотека голосов", detail: "Голоса iPhone и Fish Audio", symbol: "waveform") }
            Button(voice.busy ? "Остановить голос" : "Послушать голос") {
                if voice.busy { voice.stop(); return }
                store.liveActivities.beginInteraction()
                do { try voice.say("Привет. Я Мира. Рада тебя слышать.", voiceID: store.settings.voiceID) }
                catch { self.error = error.localizedDescription }
            }
        }
    }
    private var cloudSection: some View {
        Section {
            TextField("Адрес API, включая /v1", text: $store.settings.baseURL)
                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            TextField("Идентификатор модели", text: $store.settings.model)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            SecureField("API-ключ", text: $key).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button(saved ? "Сохранено" : "Сохранить подключение") {
                do { try store.saveSettings(key: key); saved = true }
                catch { self.error = error.localizedDescription }
            }
        } header: { Text("Подключение к ИИ") } footer: {
            Text("Нужен сервис с потоковым Chat Completions API. Текст разговора отправляется выбранному сервису. Ключ хранится в защищённом хранилище iPhone. Стоимость запросов зависит от сервиса.")
        }
    }
    private var dataSection: some View {
        Section("Данные") {
            Text("История и заметки сохраняются на этом устройстве.").font(.footnote)
            Button("Удалить историю разговора", role: .destructive) { confirmDelete = true }
        }
    }
    private var appearanceSection: some View {
        Section("Персонаж") {
            NavigationLink("Персонажи и костюмы VRM") { CharacterLibraryView() }
            Picker("Плавность анимации", selection: $requestedFrameRate) {
                ForEach([30, 60, 120, 240], id: \.self) { rate in
                    Text(rate <= screenMaximumFPS ? "До \(rate) кадров/с" : "До \(rate) кадров/с · недоступно")
                        .tag(rate).disabled(rate > screenMaximumFPS)
                }
            }
            Text("Экран: до \(screenMaximumFPS) Гц. Предел анимации: до \(min(requestedFrameRate, screenMaximumFPS)) кадров/с. Фактическая плавность зависит от системы и нагрузки. Энергосбережение, сильный нагрев и уменьшение движения снижают предел до 30 кадров/с.")
                .font(.footnote).foregroundStyle(.secondary)
            Text("Vita · VRoid Project / pixiv")
            Link("Условия использования · CC0", destination: URL(string: "https://creativecommons.org/publicdomain/zero/1.0/")!)
        }
    }
}

private struct MiraActivitySettings: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var activities: MiraLiveActivityController
    var body: some View {
        Section {
            Toggle("Показывать разговор", isOn: Binding(
                get: { store.settings.liveActivitiesEnabled ?? true },
                set: { store.settings.liveActivitiesEnabled = $0; store.persistPreferences() }
            ))
            Text("Добавь виджет «Рядом с Мирой» через меню виджетов iPhone. Он открывает разговор, команды и настройки.")
                .font(.footnote).foregroundStyle(.secondary)
            if !ActivityAuthorizationInfo().areActivitiesEnabled {
                Text("Live Activities отключены в настройках iPhone.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let issue = activities.issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
        } header: { Text("Виджеты и Dynamic Island") } footer: {
            Text("Остров и экран блокировки показывают состояние разговора и кнопку остановки. Текст сообщений не отображается. Готовая озвучка продолжает играть при сворачивании и блокировке; запись и генерация останавливаются. На iPhone без острова доступна карточка Live Activity.")
        }
    }
}
