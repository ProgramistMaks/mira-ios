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
                ModelTransferStatus(model: model)
            } else if model.pausedBytes > 0 {
                Text(model.pausedBytes == model.selected.bytes ? "Файл скачан. Осталось проверить и установить." :
                     "Загрузка приостановлена. Можно продолжить.").font(.footnote).foregroundStyle(.secondary)
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
    @State private var confirmDiscard = false
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
                        } else if (model.savedBytes[item.id] ?? 0) > 0 && !(model.downloading && model.selected.id == item.id) {
                            Label(model.savedBytes[item.id] == item.bytes ? "Ожидает проверки" : "Загрузка на паузе",
                                  systemImage: model.savedBytes[item.id] == item.bytes ? "checkmark.shield" : "pause.circle")
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
                            ModelTransferStatus(model: model)
                            Button("Приостановить") { model.pause() }.disabled(model.pausing)
                        } else if model.installed {
                            Button("Удалить с устройства", role: .destructive) { confirmDelete = true }.disabled(busy)
                        } else {
                            if model.pausedBytes > 0 {
                                Text("Сохранено \(ByteCountFormatter.string(fromByteCount: model.pausedBytes, countStyle: .decimal)) из \(item.sizeLabel)")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                            Button(model.pausedBytes == item.bytes ? "Проверить и установить" :
                                   (model.pausedBytes > 0 ? "Продолжить по Wi-Fi" : "Скачать по Wi-Fi · \(item.sizeLabel)")) { confirmDownload = true }
                                .disabled(busy).accessibilityIdentifier("models.download")
                            if model.pausedBytes > 0 {
                                Button("Удалить незавершённую загрузку", role: .destructive) { confirmDiscard = true }
                                    .disabled(busy)
                            }
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
        .alert(model.pausedBytes > 0 ? "Продолжить установку?" : "Загрузить модель?", isPresented: $confirmDownload) {
            Button(model.pausedBytes == model.selected.bytes ? "Проверить" : (model.pausedBytes > 0 ? "Продолжить" : "Скачать")) { model.download() }
            Button("Отмена", role: .cancel) { }
        } message: {
            if model.pausedBytes == model.selected.bytes {
                Text("Файл уже на устройстве. Перед установкой проверю его целостность; повторная загрузка не нужна.")
            } else {
                Text("\(model.selected.title) · \(model.selected.sizeLabel). При сворачивании загрузка приостановится; её можно продолжить позже. Для оставшейся части файла нужен ещё 1 ГБ свободного места в запасе.")
            }
        }
        .confirmationDialog("Удалить \(model.selected.title)? Для запуска понадобится скачать её заново.",
                            isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { model.remove() }
        }
        .confirmationDialog("Удалить прежнюю Qwen2.5 1.5B?", isPresented: $confirmLegacyDelete, titleVisibility: .visible) {
            Button("Удалить прежнюю модель", role: .destructive) { model.removeLegacy() }
        }
        .confirmationDialog("Удалить незавершённую загрузку? Следующая начнётся заново.", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Удалить загрузку", role: .destructive) { model.discardPartial() }
        }
    }
}

private struct ModelTransferStatus: View {
    @ObservedObject var model: LocalModelStore
    var body: some View {
        if model.pausing {
            ProgressView("Приостанавливаю…")
        } else if model.verifying {
            ProgressView(value: model.verificationProgress) {
                Text("Проверяю файл · \(Int(model.verificationProgress * 100))%")
                    .monospacedDigit()
            }
        } else {
            ProgressView(value: model.progress)
            Text("\(ByteCountFormatter.string(fromByteCount: model.receivedBytes, countStyle: .decimal)) из \(model.selected.sizeLabel) · \(Int(model.progress * 100))%")
                .font(.footnote).monospacedDigit()
            if model.bytesPerSecond > 0 {
                Text("\(ByteCountFormatter.string(fromByteCount: Int64(model.bytesPerSecond), countStyle: .decimal))/с")
                    .font(.caption).foregroundStyle(.secondary).monospacedDigit()
            }
        }
    }
}
