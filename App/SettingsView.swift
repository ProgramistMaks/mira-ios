import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var voice: VoiceService
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var searchKey = ""
    @State private var searchSaved = false
    @State private var saved = false
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
                    Text("В локальном режиме текст обрабатывается на iPhone. Облачный ИИ и поиск используют интернет. Распознавание голоса Apple может требовать интернет независимо от режима ИИ.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                LocalModelSection(model: store.localModel, busy: store.thinking)
                Section {
                    SecureField("Ключ Tavily", text: $searchKey)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(searchSaved ? "Ключ поиска сохранён" : "Сохранить ключ поиска") {
                        do {
                            try SecretStore.write(searchKey.trimmingCharacters(in: .whitespacesAndNewlines), account: "tavily")
                            searchSaved = true
                        } catch { self.error = error.localizedDescription }
                    }
                } header: { Text("Поиск в интернете") } footer: {
                    Text("Tavily используется только по кнопке поиска. Запрос отправляется в Tavily; расход лимита зависит от тарифа. Ключ хранится в Keychain отдельно от ключа ИИ.")
                }
                Section("Голос") {
                    Toggle("Озвучивать ответы", isOn: $store.settings.speakReplies)
                    Picker("Голос", selection: $store.settings.voiceID) {
                        Text("Автоматически").tag("")
                        ForEach(voice.voices, id: \.identifier) { item in Text(item.name).tag(item.identifier) }
                    }
                    Button("Послушать голос") {
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
                    Text("Vita · VRoid Project / pixiv")
                    Link("Условия использования · CC0", destination: URL(string: "https://creativecommons.org/publicdomain/zero/1.0/")!)
                }
            }
            .navigationTitle("Настройки")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { voice.stop(); dismiss() } } }
            .onAppear { key = SecretStore.read(); searchKey = SecretStore.read(account: "tavily") }
            .onDisappear { voice.stop(); store.persistPreferences() }
            .alert("Ошибка", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("Понятно") { error = nil }
            } message: { Text(error ?? "") }
            .confirmationDialog("Удалить весь разговор?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Удалить", role: .destructive) { store.clearConversation() }
            }
        }
    }
}

struct LocalModelSection: View {
    @ObservedObject var model: LocalModelStore
    let busy: Bool
    @State private var confirmDownload = false
    @State private var confirmDelete = false
    var body: some View {
        Section("Локальная модель") {
            Text(LocalModelFile.name)
            if model.installed {
                Label("Готова к работе без интернета", systemImage: "checkmark.circle")
                Button("Удалить модель с iPhone", role: .destructive) { confirmDelete = true }.disabled(busy)
            } else if model.downloading {
                ProgressView(value: model.progress)
                Text(model.verifying ? "Проверяю загруженный файл…" : "Загружаю: \(Int(model.progress * 100))%")
                Button("Отменить загрузку") { model.cancel() }
            } else {
                Button("Загрузить по Wi-Fi · 1,12 ГБ") { confirmDownload = true }
                Text("Загружается один раз. Ответы небольшой локальной модели могут уступать облачным; скорость и нагрев зависят от устройства.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let error = model.error { Text(error).font(.footnote).foregroundStyle(.red) }
            Link("Модель и лицензия Apache 2.0", destination: URL(string: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF")!)
        }
        .confirmationDialog("Загрузить 1,12 ГБ по Wi-Fi? Оставь приложение открытым до окончания загрузки.",
                            isPresented: $confirmDownload, titleVisibility: .visible) {
            Button("Загрузить") { model.download() }
        }
        .confirmationDialog("Удалить локальную модель? Для следующего запуска понадобится загрузить её заново.",
                            isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { model.remove() }
        }
    }
}
