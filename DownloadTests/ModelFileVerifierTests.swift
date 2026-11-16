import XCTest
@testable import MiraDownloadCore

final class ModelFileVerifierTests: XCTestCase {
    private var directory: URL!
    private var file: URL { directory.appendingPathComponent("model.partial") }
    private let content = Data((0..<2_097_169).map { UInt8($0 % 251) })

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("mira-verify-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try content.write(to: file)
    }

    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }

    func testStreamsEveryByteInBoundedChunksAndReportsCompletion() throws {
        var consumed = Data(), largestChunk = 0
        var progress: [ModelVerificationProgress] = []
        let valid = try ModelFileVerifier.verify(file: file, expectedBytes: Int64(content.count),
            update: { consumed.append($0); largestChunk = max(largestChunk, $0.count) },
            matches: { consumed == self.content }, progress: { progress.append($0) })
        XCTAssertTrue(valid)
        XCTAssertLessThanOrEqual(largestChunk, 1_048_576)
        XCTAssertEqual(consumed, content)
        XCTAssertEqual(progress.first?.checked, 0)
        XCTAssertEqual(progress.last?.checked, Int64(content.count))
        XCTAssertEqual(progress.last?.fraction, 1)
        XCTAssertTrue(zip(progress, progress.dropFirst()).allSatisfy { $0.checked <= $1.checked })
    }

    func testWrongDigestCannotPassAndDoesNotDeleteResumeFile() throws {
        let valid = try ModelFileVerifier.verify(file: file, expectedBytes: Int64(content.count),
                                                update: { _ in }, matches: { false })
        XCTAssertFalse(valid)
        XCTAssertEqual(try Data(contentsOf: file), content)
    }

    func testShortOversizedAndEmptyFilesCannotReachDigestApproval() throws {
        for size in [Int64(content.count - 1), Int64(content.count + 1), 0] {
            var finalized = false
            let valid = try ModelFileVerifier.verify(file: file, expectedBytes: size,
                update: { _ in }, matches: { finalized = true; return true })
            XCTAssertFalse(valid)
            XCTAssertFalse(finalized)
        }
        try Data().write(to: file)
        XCTAssertFalse(try ModelFileVerifier.verify(file: file, expectedBytes: 1,
                                                   update: { _ in }, matches: { true }))
    }

    func testCancellationDuringReadPreservesFileForACompleteRetry() async throws {
        let file = self.file, content = self.content
        let paused = Task.detached {
            var chunks = 0, finalized = false
            do {
                _ = try ModelFileVerifier.verify(file: file, expectedBytes: Int64(content.count),
                    update: { _ in
                        chunks += 1
                        withUnsafeCurrentTask { $0?.cancel() }
                    }, matches: { finalized = true; return true })
                XCTFail("A paused verification must not complete")
            } catch { XCTAssertTrue(error is CancellationError) }
            XCTAssertEqual(chunks, 1)
            XCTAssertFalse(finalized)
        }
        await paused.value
        XCTAssertEqual(try Data(contentsOf: file), content)
        var consumed = Data()
        XCTAssertTrue(try ModelFileVerifier.verify(file: file, expectedBytes: Int64(content.count),
            update: { consumed.append($0) }, matches: { consumed == content }))
    }

    func testAlreadyCancelledVerificationDoesNotReadOrReportSuccess() async {
        let file = self.file
        await Task.detached {
            withUnsafeCurrentTask { $0?.cancel() }
            do {
                _ = try ModelFileVerifier.verify(file: file, expectedBytes: 1,
                    update: { _ in XCTFail("Cancelled verification read data") },
                    matches: { XCTFail("Cancelled verification checked digest"); return true },
                    progress: { _ in XCTFail("Cancelled verification reported progress") })
                XCTFail("Cancelled verification completed")
            } catch { XCTAssertTrue(error is CancellationError) }
        }.value
    }

    func testMissingFileReportsReadFailure() throws {
        try FileManager.default.removeItem(at: file)
        XCTAssertThrowsError(try ModelFileVerifier.verify(file: file, expectedBytes: 1,
                                                        update: { _ in }, matches: { true }))
    }
}
