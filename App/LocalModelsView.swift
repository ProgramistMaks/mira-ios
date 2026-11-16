import SwiftUI

struct LocalModelSection: View {
    @ObservedObject var model: LocalModelStore
    let busy: Bool
    var body: some View {
        Section("Локальная модель") {
            Text(model.selected.title)
            Text(model.installed ? "Модель загружена · \(model.selected.sizeLabel)" : "Нужна загрузка · \(model.selected.sizeLabel)")
                .font(.footnote).foregroundStyle(.secondary)
            if model.downloading {
                ProgressView(value: model.progress)
                Text(model.verifying ? "Проверяю файл…" : "Загрузка: \(Int(model.progress * 100))%")
            }
            NavigationLink("Модели и загрузки") { LocalModelsView(model: model, busy: busy) }
                .accessibilityIdentifier("models.open")
        }
    }
}

struct LocalModelsView: View {
    @ObservedObject var model: LocalModelStore
    let busy: Bool
    @State private var confirmDownload = false
    @State private var confirmDelete = false
    @State private var confirmLegacyDelete = false
    private var memory: UInt64 { ProcessInfo.processInfo.physicalMemory }
    var body: some View {
        List {
            Section {
                Text("Оперативная память устройства: \(ByteCountFormatter.string(fromByteCount: Int64(memory), countStyle: .memory))")
                Text("Метки ниже — предварительная оценка. iOS выделяет приложению только часть памяти. Даже рекомендуемая модель требует проверки на твоём устройстве; размер файла не равен расходу памяти.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(LocalModelCatalog.models) { item in
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item.title).font(.headline)
                        Text(item.sizeLabel).foregroundStyle(.secondary)
                        Text(item.guidanceText(physicalMemory: memory)).font(.subheadline)
                        if model.installedIDs.contains(item.id) {
                            Label("Загружена", systemImage: "internaldrive")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        if model.selected.id == item.id {
                            Label("Выбрана", systemImage: "checkmark.circle.fill").foregroundStyle(.purple)
                                .accessibilityIdentifier("models.selected.\(item.id)")
                        } else {
                            Button("Выбрать") { model.select(item) }
                                .disabled(busy || model.downloading)
                                .accessibilityIdentifier("models.select.\(item.id)")
                        }
                    }.padding(.vertical, 4)
                    if model.selected.id == item.id {
                        if model.downloading {
                            ProgressView(value: model.progress)
                            Text(model.verifying ? "Проверяю файл…" : "Загрузка: \(Int(model.progress * 100))%")
                            Button("Отменить загрузку") { model.cancel() }
                        } else if model.installed {
                            Button("Удалить с устройства", role: .destructive) { confirmDelete = true }.disabled(busy)
                        } else {
                            Button("Скачать по Wi-Fi · \(item.sizeLabel)") { confirmDownload = true }
                                .disabled(busy).accessibilityIdentifier("models.download")
                        }
                        if let error = model.error { Text(error).font(.footnote).foregroundStyle(.red) }
                    }
                    Link("Источник и лицензия Apache 2.0", destination: item.sourceURL).font(.footnote)
                }
            }
            if model.legacyInstalled {
                Section("Прежняя загрузка") {
                    Button("Удалить Qwen2.5 1.5B · 1,12 ГБ", role: .destructive) { confirmLegacyDelete = true }
                        .disabled(busy || model.downloading)
                }
            }
        }
        .navigationTitle("Модели")
        .confirmationDialog("Скачать \(model.selected.title) · \(model.selected.sizeLabel)? Оставь приложение открытым до конца загрузки. Свободного места нужно на 1 ГБ больше размера файла.",
                            isPresented: $confirmDownload, titleVisibility: .visible) {
            Button("Скачать") { model.download() }
        }
        .confirmationDialog("Удалить \(model.selected.title)? Для запуска понадобится скачать её заново.",
                            isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { model.remove() }
        }
        .confirmationDialog("Удалить прежнюю Qwen2.5 1.5B?", isPresented: $confirmLegacyDelete, titleVisibility: .visible) {
            Button("Удалить прежнюю модель", role: .destructive) { model.removeLegacy() }
        }
    }
}
