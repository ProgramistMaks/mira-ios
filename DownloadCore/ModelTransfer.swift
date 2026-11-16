import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct ModelTransferResource: Codable, Equatable, Sendable {
    let id: String
    let url: URL
    let bytes: Int64
    let fingerprint: String
}

struct ModelTransferProgress: Sendable {
    let received: Int64
    let total: Int64
    let bytesPerSecond: Double
    var fraction: Double { min(1, max(0, Double(received) / Double(total))) }
}

enum ModelTransferError: LocalizedError {
    case invalidResource, invalidResponse, incomplete, changedResource, tooLarge, integrityFailure
    var errorDescription: String? {
        switch self {
        case .invalidResource: return "Некорректные данные модели."
        case .invalidResponse: return "Сервер вернул неподдерживаемый ответ. Загрузку можно повторить."
        case .incomplete: return "Связь прервалась до завершения загрузки. Можно продолжить позже."
        case .changedResource: return "Файл на сервере изменился. Удали незавершённую загрузку и скачай модель заново."
        case .tooLarge: return "Размер полученного файла не совпадает с каталогом."
        case .integrityFailure: return "Проверка целостности не прошла. Повреждённый файл удалён; скачай модель заново."
        }
    }
}

private struct ModelTransferCheckpoint: Codable {
    let resource: ModelTransferResource
    let validatorHeader: String?
    let validator: String?
}

/// Streams to an app-owned partial file. The caller MUST verify its full hash
/// before installing it; a completed transfer is not a verified model.
final class ModelTransfer: NSObject, @unchecked Sendable {
    private let resource: ModelTransferResource
    private let directory: URL
    private let progress: @Sendable (ModelTransferProgress) -> Void
    private let queue: OperationQueue
    // All mutable state, including cancellation, is confined to queue.
    private var task: URLSessionDataTask?
    private var continuation: CheckedContinuation<URL, Error>?
    private var file: FileHandle?
    private var checkpoint: ModelTransferCheckpoint?
    private var pendingCheckpoint: ModelTransferCheckpoint?
    private var resetOnData = false
    private var received: Int64 = 0
    private var initialOffset: Int64 = 0
    private var responseBytes: Int64 = 0
    private var responseLimit: Int64?
    private var startedAt = Date()
    private var lastProgress = Date.distantPast
    private var cancelled = false
    private var finished = false
    private var started = false

    init(resource: ModelTransferResource, directory: URL,
         progress: @escaping @Sendable (ModelTransferProgress) -> Void = { _ in }) {
        self.resource = resource; self.directory = directory; self.progress = progress
        queue = ModelTransferTransport.shared.queue
        super.init()
    }

    private static func paths(_ resource: ModelTransferResource, in directory: URL) throws -> (URL, URL) {
        guard resource.bytes > 0, !resource.id.isEmpty,
              resource.id.utf8.allSatisfy({ (97...122).contains($0) || (48...57).contains($0) || $0 == 45 }),
              ["https", "http"].contains(resource.url.scheme ?? "") else { throw ModelTransferError.invalidResource }
        return (directory.appendingPathComponent(resource.id + ".partial"),
                directory.appendingPathComponent(resource.id + ".resume.json"))
    }

    static func savedBytes(for resource: ModelTransferResource, in directory: URL) -> Int64 {
        guard let (partial, metadata) = try? paths(resource, in: directory),
              let data = try? Data(contentsOf: metadata),
              let saved = try? JSONDecoder().decode(ModelTransferCheckpoint.self, from: data),
              saved.resource == resource,
              let size = try? partial.resourceValues(forKeys: [.fileSizeKey]).fileSize,
              size > 0, Int64(size) <= resource.bytes else { return 0 }
        return Int64(size)
    }

    static func discard(_ resource: ModelTransferResource, in directory: URL) throws {
        let (partial, metadata) = try paths(resource, in: directory)
        for url in [partial, metadata] where FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }

    func run() async throws -> URL {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                queue.addOperation { self.start(continuation) }
            }
        } onCancel: {
            self.queue.addOperation {
                self.cancelled = true
                self.task?.cancel()
            }
        }
    }

    private func start(_ continuation: CheckedContinuation<URL, Error>) {
        guard !started else { continuation.resume(throwing: ModelTransferError.invalidResource); return }
        started = true; self.continuation = continuation
        do {
            if cancelled { throw CancellationError() }
            let (partial, metadata) = try Self.paths(resource, in: directory)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            received = Self.savedBytes(for: resource, in: directory)
            if received > 0 {
                checkpoint = try JSONDecoder().decode(ModelTransferCheckpoint.self, from: Data(contentsOf: metadata))
            } else {
                try Self.discard(resource, in: directory)
                guard FileManager.default.createFile(atPath: partial.path, contents: nil) else {
                    throw CocoaError(.fileWriteUnknown)
                }
            }
            if received == resource.bytes { emitProgress(force: true); finish(.success(partial)); return }
            file = try FileHandle(forWritingTo: partial)
            try file?.seek(toOffset: UInt64(received))
            initialOffset = received; startedAt = Date()
            var request = URLRequest(url: resource.url)
            request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
            if received > 0 {
                request.setValue("bytes=\(received)-", forHTTPHeaderField: "Range")
                if let validator = checkpoint?.validator { request.setValue(validator, forHTTPHeaderField: "If-Range") }
            }
            task = ModelTransferTransport.shared.makeTask(request: request, receiver: self)
            emitProgress(force: true); task?.resume()
        } catch { finish(.failure(error)) }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard !finished, !cancelled else { completionHandler(.cancel); return }
        do {
            guard let response = response as? HTTPURLResponse,
                  [200, 206].contains(response.statusCode),
                  response.value(forHTTPHeaderField: "Content-Encoding").map({ $0.lowercased() == "identity" }) ?? true
            else { throw ModelTransferError.invalidResponse }
            let contentLength = response.value(forHTTPHeaderField: "Content-Length").flatMap(Int64.init)
            if response.statusCode == 206 {
                resetOnData = false
                guard let range = response.value(forHTTPHeaderField: "Content-Range"),
                      let bounds = Self.parseRange(range), bounds.start == received,
                      bounds.total == resource.bytes, bounds.end >= bounds.start, bounds.end < bounds.total
                else { throw ModelTransferError.invalidResponse }
                responseLimit = bounds.end - bounds.start + 1
                if let contentLength, contentLength != responseLimit { throw ModelTransferError.invalidResponse }
                if let header = checkpoint?.validatorHeader, let old = checkpoint?.validator,
                   let new = response.value(forHTTPHeaderField: header), new != old {
                    throw ModelTransferError.changedResource
                }
            } else {
                if let contentLength, contentLength != resource.bytes { throw ModelTransferError.tooLarge }
                // Do not destroy resumable data on headers alone. A redirect/proxy
                // may report an intermediate response with no model body.
                resetOnData = true; responseLimit = resource.bytes
            }
            let etag = response.value(forHTTPHeaderField: "ETag").flatMap { $0.hasPrefix("W/") ? nil : $0 }
            let modified = response.value(forHTTPHeaderField: "Last-Modified")
            let receivedCheckpoint = ModelTransferCheckpoint(resource: resource,
                validatorHeader: etag != nil ? "ETag" : (modified != nil ? "Last-Modified" : nil),
                validator: etag ?? modified)
            let saved = response.statusCode == 206 && receivedCheckpoint.validator == nil
                ? (checkpoint ?? receivedCheckpoint) : receivedCheckpoint
            pendingCheckpoint = saved; responseBytes = 0; startedAt = Date()
            emitProgress(force: true); completionHandler(.allow)
        } catch {
            completionHandler(.cancel); finish(.failure(error))
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard !finished, !cancelled else { return }
        do {
            let count = Int64(data.count)
            let offset = resetOnData ? 0 : received
            guard offset <= resource.bytes - count,
                  let responseLimit, responseBytes <= responseLimit - count else { throw ModelTransferError.tooLarge }
            if resetOnData {
                // Actual full body after Range was ignored: restart rather than append.
                try file?.truncate(atOffset: 0); try file?.seek(toOffset: 0)
                received = 0; initialOffset = 0; resetOnData = false
            }
            if let pendingCheckpoint {
                let (_, metadata) = try Self.paths(resource, in: directory)
                try JSONEncoder().encode(pendingCheckpoint).write(to: metadata, options: .atomic)
                checkpoint = pendingCheckpoint; self.pendingCheckpoint = nil
            }
            try file?.write(contentsOf: data)
            received += count; responseBytes += count
            emitProgress(force: false)
        } catch { finish(.failure(error)) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard !finished else { return }
        if cancelled { finish(.failure(CancellationError())) }
        else if let error { finish(.failure(error)) }
        else if received != resource.bytes || responseBytes != responseLimit { finish(.failure(ModelTransferError.incomplete)) }
        else {
            do { finish(.success(try Self.paths(resource, in: directory).0)) }
            catch { finish(.failure(error)) }
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        // Public model URLs may redirect to signed HTTPS CDN URLs, never downgrade HTTPS.
        completionHandler(resource.url.scheme == "https" && request.url?.scheme != "https" ? nil : request)
    }

    private func finish(_ result: Result<URL, Error>) {
        guard !finished else { return }
        finished = true
        var result = result
        do { try file?.synchronize(); try file?.close() } catch { result = .failure(error) }
        file = nil
        emitProgress(force: true)
        if case .failure = result { task?.cancel() }
        task = nil
        continuation?.resume(with: result); continuation = nil
    }

    private func emitProgress(force: Bool) {
        let now = Date()
        guard force || now.timeIntervalSince(lastProgress) >= 0.15 else { return }
        lastProgress = now
        let elapsed = now.timeIntervalSince(startedAt)
        progress(ModelTransferProgress(received: received, total: resource.bytes,
            bytesPerSecond: elapsed > 0.25 ? Double(max(0, received - initialOffset)) / elapsed : 0))
    }

    private static func parseRange(_ value: String) -> (start: Int64, end: Int64, total: Int64)? {
        guard value.hasPrefix("bytes ") else { return nil }
        let parts = value.dropFirst(6).split(separator: "/")
        guard parts.count == 2 else { return nil }
        let bounds = parts[0].split(separator: "-")
        guard bounds.count == 2, let start = Int64(bounds[0]), let end = Int64(bounds[1]),
              let total = Int64(parts[1]), start >= 0 else { return nil }
        return (start, end, total)
    }
}

/// Reuse one Wi-Fi-only session across attempts. The task router retains a transfer
/// until its completion callback, so pausing never races URLSession destruction.
private final class ModelTransferTransport: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    static let shared = ModelTransferTransport()
    let queue: OperationQueue
    private var receivers: [Int: ModelTransfer] = [:]
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.allowsCellularAccess = false
        #if canImport(Darwin)
        config.allowsExpensiveNetworkAccess = false
        #endif
        config.timeoutIntervalForRequest = 60; config.timeoutIntervalForResource = 7200
        return URLSession(configuration: config, delegate: self, delegateQueue: queue)
    }()
    private override init() {
        queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .utility
        super.init()
    }
    func makeTask(request: URLRequest, receiver: ModelTransfer) -> URLSessionDataTask {
        let task = session.dataTask(with: request)
        receivers[task.taskIdentifier] = receiver
        return task
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let receiver = receivers[dataTask.taskIdentifier] else { completionHandler(.cancel); return }
        receiver.urlSession(session, dataTask: dataTask, didReceive: response, completionHandler: completionHandler)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        receivers[dataTask.taskIdentifier]?.urlSession(session, dataTask: dataTask, didReceive: data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let receiver = receivers.removeValue(forKey: task.taskIdentifier)
        receiver?.urlSession(session, task: task, didCompleteWithError: error)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let receiver = receivers[task.taskIdentifier] else { completionHandler(nil); return }
        receiver.urlSession(session, task: task, willPerformHTTPRedirection: response,
                            newRequest: request, completionHandler: completionHandler)
    }
}
