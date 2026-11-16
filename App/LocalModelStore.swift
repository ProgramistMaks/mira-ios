import Foundation
import Combine
import CryptoKit

enum LocalModelFile {
    static func directory() throws -> URL {
        var url = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                              appropriateFor: nil, create: true).appendingPathComponent("LocalModels", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        return url
    }
    static func installed(_ model: LocalModelSpec) throws -> URL {
        // Preserve the first 9B download made before the catalogue was added.
        let filename = model.id == "qwen35-9b-q4" ? "qwen3.5-9b-q4_k_m.gguf" : model.filename
        return try directory().appendingPathComponent(filename)
    }
    static func downloads() throws -> URL {
        let url = try directory().appendingPathComponent("Downloads", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    static func legacy() throws -> URL { try directory().appendingPathComponent("qwen2.5-1.5b-q4.gguf") }
}

@MainActor
final class LocalModelStore: ObservableObject {
    @Published private(set) var selected: LocalModelSpec
    @Published private(set) var installedIDs: Set<String> = []
    var installed: Bool { installedIDs.contains(selected.id) }
    @Published private(set) var legacyInstalled = false
    @Published private(set) var downloading = false
    @Published private(set) var verifying = false
    @Published private(set) var verificationProgress = 0.0
    @Published private(set) var pausing = false
    @Published private(set) var progress = 0.0
    @Published private(set) var savedBytes: [String: Int64] = [:]
    @Published private(set) var receivedBytes: Int64 = 0
    @Published private(set) var bytesPerSecond = 0.0
    var pausedBytes: Int64 { savedBytes[selected.id] ?? 0 }
    @Published var error: String?
    private var work: Task<Void, Never>?
    private var attempt: UUID?
    private let preferences: UserDefaults
    init(preferences: UserDefaults = .standard) {
        self.preferences = preferences
        selected = preferences.string(forKey: "selectedLocalModel").flatMap(LocalModelCatalog.find)
            ?? LocalModelCatalog.defaultModel
        refresh()
    }
    func select(_ model: LocalModelSpec) {
        guard !downloading else { return }
        selected = model; error = nil
        preferences.set(model.id, forKey: "selectedLocalModel")
    }
    func refresh() {
        installedIDs = Set(LocalModelCatalog.models.filter {
            (try? LocalModelFile.installed($0).resourceValues(forKeys: [.fileSizeKey]).fileSize) == Int($0.bytes)
        }.map(\.id))
        if let directory = try? LocalModelFile.downloads() {
            savedBytes = Dictionary(uniqueKeysWithValues: LocalModelCatalog.models.map {
                ($0.id, ModelTransfer.savedBytes(for: $0.transferResource, in: directory))
            })
        }
        legacyInstalled = (try? LocalModelFile.legacy()).map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    }
    func download() {
        guard !downloading && !installed else { return }
        let model = selected, id = UUID()
        attempt = id; downloading = true; verifying = false; verificationProgress = 0; pausing = false; error = nil
        receivedBytes = pausedBytes; progress = Double(pausedBytes) / Double(model.bytes); bytesPerSecond = 0
        work = Task { [weak self] in
            guard let self else { return }
            defer {
                self.attempt = nil; self.downloading = false; self.verifying = false
                self.pausing = false
                self.bytesPerSecond = 0; self.work = nil; self.refresh()
            }
            do {
                try Task.checkCancellation()
                let directory = try LocalModelFile.downloads()
                let saved = ModelTransfer.savedBytes(for: model.transferResource, in: directory)
                if saved == 0 { try ModelTransfer.discard(model.transferResource, in: directory) }
                let required = model.bytes - saved + 1_000_000_000
                let capacity = try directory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
                    .volumeAvailableCapacityForImportantUsage
                if saved < model.bytes, let capacity, capacity < required {
                    throw NSError(domain: "LocalModel", code: 1, userInfo: [NSLocalizedDescriptionKey:
                        "Для загрузки нужно не менее \(ByteCountFormatter.string(fromByteCount: required, countStyle: .decimal)) свободного места."])
                }
                let transfer = ModelTransfer(resource: model.transferResource, directory: directory) { [weak self] value in
                    Task { @MainActor in
                        guard let self, self.attempt == id, !self.verifying, !self.pausing else { return }
                        self.progress = value.fraction; self.receivedBytes = value.received
                        self.bytesPerSecond = value.bytesPerSecond
                    }
                }
                let partial = try await transfer.run()
                try Task.checkCancellation()
                self.verifying = true; self.bytesPerSecond = 0
                self.receivedBytes = model.bytes; self.progress = 1
                let verification = Task.detached(priority: .utility) { [weak self] in
                    var hash = SHA256()
                    return try ModelFileVerifier.verify(file: partial, expectedBytes: model.bytes,
                        update: { hash.update(data: $0) },
                        matches: { hash.finalize().map { String(format: "%02x", $0) }.joined() == model.sha256 },
                        progress: { value in
                            Task { @MainActor [weak self] in
                                guard let self, self.attempt == id, self.verifying, !self.pausing else { return }
                                self.verificationProgress = max(self.verificationProgress, value.fraction)
                            }
                        })
                }
                let valid = try await withTaskCancellationHandler { try await verification.value } onCancel: { verification.cancel() }
                try Task.checkCancellation()
                guard valid else {
                    try? ModelTransfer.discard(model.transferResource, in: directory)
                    throw ModelTransferError.integrityFailure
                }
                let destination = try LocalModelFile.installed(model)
                if FileManager.default.fileExists(atPath: destination.path) {
                    _ = try FileManager.default.replaceItemAt(destination, withItemAt: partial)
                } else {
                    try FileManager.default.moveItem(at: partial, to: destination)
                }
                try? ModelTransfer.discard(model.transferResource, in: directory)
            } catch {
                if !Task.isCancelled { self.error = "Не удалось загрузить модель: \(error.localizedDescription)" }
            }
        }
    }
    func pause() {
        guard downloading, !pausing else { return }
        pausing = true; bytesPerSecond = 0
        work?.cancel()
    }
    func discardPartial() {
        guard !downloading else { return }
        do {
            try ModelTransfer.discard(selected.transferResource, in: LocalModelFile.downloads())
            error = nil; refresh()
        } catch { self.error = error.localizedDescription }
    }
    func removeLegacy() {
        do { try FileManager.default.removeItem(at: LocalModelFile.legacy()); refresh() }
        catch { self.error = error.localizedDescription }
    }
    func remove() {
        guard !downloading else { return }
        do { try FileManager.default.removeItem(at: LocalModelFile.installed(selected)); refresh() }
        catch { self.error = error.localizedDescription }
    }
}
