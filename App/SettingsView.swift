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
    @State private var saved = false
    @State private var checkingSearch = false
    @State private var searchCheck: String?
    @State private var searchProbe: Task<Void, Never>?
    @State private var error: String?
    @State private var confirmDelete = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Где работает ИИ") {
                    Picker("Режим", selection: Binding(get: { store.settings.inferenceMode ?? .cloud },
                                                       set: { store.settings.inferenceMode = $0 })) {
                        Text("На iPhone").tag(InferenceMode.local)
                        Text("В облаке").tag(InferenceMode.cloud)
                    }.disabled(store.thinking)
                    Text("Локальная модель отвечает на iPhone после загрузки. Облачная модель требует подключения. Распознавание речи настраивается отдельно ниже.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                LocalModelSection(model: store.localModel, busy: store.thinking)
                MiraActivitySettings(store: store, activities: store.liveActivities)
                Section {
                    SecureField("Ключ Tavily", text: $searchKey)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(searchSaved ? "Ключ поиска сохранён" : "Сохранить ключ поиска") {
                        do {
                            try SecretStore.write(searchKey.trimmingCharacters(in: .whitespacesAndNewlines), account: "tavily")
                            searchSaved = true; searchCheck = nil; store.refreshConnections()
                        } catch { self.error = error.localizedDescription }
                    }
                    Button(checkingSearch ? "Проверяю…" : "Проверить поиск") {
                        checkingSearch = true; searchCheck = nil
                        searchProbe = Task {
                            defer { checkingSearch = false }
                            do {
                                let hits = try await WebSearch().search("официальный сайт Apple", key: SecretStore.read(account: "tavily"))
                                try Task.checkCancellation()
                                searchCheck = hits.isEmpty ? "Сервис ответил, но не вернул источники." : "Поиск работает: получено источников — \(hits.count)."
                            } catch { if !Task.isCancelled { searchCheck = error.localizedDescription } }
                        }
                    }.disabled(checkingSearch || !store.searchConfigured)
                    if let searchCheck { Text(searchCheck).font(.footnote).accessibilityIdentifier("search.checkResult") }
                } header: { Text("Поиск в интернете") } footer: {
                    Text("Скажи «найди в интернете…» — источники появятся в разговоре. Проверка выполняет один тестовый запрос. Tavily использует интернет и свой лимит запросов; ключ хранится только на устройстве.")
                }
                Section("Голос") {
                    Toggle("Разрешить распознавание Apple через интернет", isOn: Binding(
                        get: { store.settings.useAppleRecognition ?? false },
                        set: { store.settings.useAppleRecognition = $0 }
                    ))
                    Text(store.settings.offlineRecognition
                         ? "Речь распознаётся только на устройстве. Если русский язык недоступен, можно разрешить обработку Apple."
                         : "Аудио может передаваться Apple для распознавания. Выбор локальной модели ИИ от этого не меняется.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Toggle("Озвучивать ответы", isOn: $store.settings.speakReplies)
                    Picker("Голос", selection: $store.settings.voiceID) {
                        Text("Автоматически").tag("")
                        ForEach(voice.voices, id: \.identifier) { item in Text(item.name).tag(item.identifier) }
                    }
                    Button(voice.busy ? "Остановить голос" : "Послушать голос") {
                        if voice.busy { voice.stop(); return }
                        store.liveActivities.beginInteraction()
                        do { try voice.say("Привет. Я Мира. Рада тебя слышать.", voiceID: store.settings.voiceID) }
                        catch { self.error = error.localizedDescription }
                    }
                }
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
                Section("Данные") {
                    Text("История и заметки сохраняются на этом устройстве.").font(.footnote)
                    Button("Удалить историю разговора", role: .destructive) { confirmDelete = true }
                }
                Section("Персонаж") {
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
            .scrollContentBackground(.hidden)
            .background(Palette.background)
            .navigationTitle("Настройки")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { voice.stop(); dismiss() } } }
            .onAppear { key = SecretStore.read(); searchKey = SecretStore.read(account: "tavily") }
            .onDisappear { searchProbe?.cancel(); voice.stop(); store.persistPreferences(); store.refreshConnections() }
            .alert("Ошибка", isPresented: Binding(get: { error != nil || store.error != nil }, set: { if !$0 { error = nil; store.error = nil } })) {
                Button("Понятно") { error = nil; store.error = nil }
            } message: { Text(error ?? store.error ?? "") }
            .confirmationDialog("Удалить весь разговор?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Удалить", role: .destructive) { store.clearConversation() }
            }
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
