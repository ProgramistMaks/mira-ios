import XCTest
#if canImport(MiraActivityCore)
@testable import MiraActivityCore
#else
@testable import Companion
#endif

@MainActor
private final class PermissionReply {
    let started: XCTestExpectation
    private var reply: CheckedContinuation<Bool, Never>?
    init(_ started: XCTestExpectation) { self.started = started }
    func ask() async -> Bool {
        await withCheckedContinuation { reply = $0; started.fulfill() }
    }
    func resolve(_ value: Bool) { reply?.resume(returning: value); reply = nil }
}

final class MiraDictationTests: XCTestCase {
    @MainActor
    func testCancellationWhileSpeechPermissionIsPendingDoesNotAskForMicrophone() async {
        let gate = MiraRecordingAuthorization()
        let reply = PermissionReply(expectation(description: "speech permission pending"))
        var microphoneRequests = 0
        let request = Task {
            await gate.request(speech: { await reply.ask() }, microphone: { microphoneRequests += 1; return true })
        }
        await fulfillment(of: [reply.started], timeout: 2)
        gate.cancel(); reply.resolve(true)
        let result = await request.value
        XCTAssertEqual(result, .cancelled)
        XCTAssertEqual(microphoneRequests, 0)
    }

    @MainActor
    func testOlderPermissionReplyCannotCancelTheNewRecordingRequest() async {
        let gate = MiraRecordingAuthorization()
        let old = PermissionReply(expectation(description: "old permission pending"))
        let new = PermissionReply(expectation(description: "new permission pending"))
        var microphoneRequests = 0
        let first = Task {
            await gate.request(speech: { await old.ask() }, microphone: { microphoneRequests += 1; return true })
        }
        await fulfillment(of: [old.started], timeout: 2)
        let second = Task {
            await gate.request(speech: { await new.ask() }, microphone: { microphoneRequests += 1; return true })
        }
        await fulfillment(of: [new.started], timeout: 2)
        old.resolve(true)
        let oldResult = await first.value
        XCTAssertEqual(oldResult, .cancelled); XCTAssertEqual(microphoneRequests, 0)
        new.resolve(true)
        let newResult = await second.value
        XCTAssertEqual(newResult, .authorized); XCTAssertEqual(microphoneRequests, 1)
    }

    @MainActor
    func testGrantingMicrophoneAfterCancellationCannotAuthorizeRecording() async {
        let gate = MiraRecordingAuthorization()
        let reply = PermissionReply(expectation(description: "microphone permission pending"))
        let request = Task { await gate.request(speech: { true }, microphone: { await reply.ask() }) }
        await fulfillment(of: [reply.started], timeout: 2)
        gate.cancel(); reply.resolve(true)
        let result = await request.value
        XCTAssertEqual(result, .cancelled)
    }

    @MainActor
    func testSpeechDenialDoesNotPromptForAnUnusableMicrophone() async {
        let gate = MiraRecordingAuthorization()
        var microphoneRequests = 0
        let result = await gate.request(speech: { false }, microphone: { microphoneRequests += 1; return true })
        XCTAssertEqual(result, .denied); XCTAssertEqual(microphoneRequests, 0)
    }

    @MainActor
    func testTaskCancellationAlsoStopsThePermissionSequence() async {
        let gate = MiraRecordingAuthorization()
        let reply = PermissionReply(expectation(description: "speech permission pending"))
        var microphoneRequests = 0
        let request = Task {
            await gate.request(speech: { await reply.ask() }, microphone: { microphoneRequests += 1; return true })
        }
        await fulfillment(of: [reply.started], timeout: 2)
        request.cancel(); reply.resolve(true)
        let result = await request.value
        XCTAssertEqual(result, .cancelled); XCTAssertEqual(microphoneRequests, 0)
    }

    @MainActor
    func testBothPermissionsAreRequiredAndADeniedRequestCanBeRetried() async {
        let gate = MiraRecordingAuthorization()
        let denied = await gate.request(speech: { true }, microphone: { false })
        XCTAssertEqual(denied, .denied)
        let allowed = await gate.request(speech: { true }, microphone: { true })
        XCTAssertEqual(allowed, .authorized)
    }

    func testPartialRecognitionRevisionsPreserveTheTypedDraftWithoutDuplicatingSpeech() {
        let draft = MiraDictationDraft(original: "Мои планы:")
        XCTAssertEqual(draft.applying(""), "Мои планы:")
        XCTAssertEqual(draft.applying("купить"), "Мои планы: купить")
        XCTAssertEqual(draft.applying("купить хлеб"), "Мои планы: купить хлеб")
        XCTAssertEqual(draft.applying("купить чай"), "Мои планы: купить чай")
        XCTAssertEqual(draft.applying("купить чай"), "Мои планы: купить чай")
    }

    func testDictationRetainsExistingWhitespaceAndHandlesNoSpeech() {
        let original = "Планы:\n  "
        let draft = MiraDictationDraft(original: original)
        XCTAssertEqual(draft.applying("  \n"), original)
        XCTAssertEqual(draft.applying("  отдохнуть\n"), original + "отдохнуть")
        XCTAssertEqual(MiraDictationDraft(original: "").applying("Привет"), "Привет")
    }

    func testASecondDictationUsesThePreviouslyReviewedDraft() {
        let first = MiraDictationDraft(original: "Завтра")
        let committed = first.applying("поеду домой")
        let second = MiraDictationDraft(original: committed + ".")
        XCTAssertEqual(second.applying("Вечером позвоню"), "Завтра поеду домой. Вечером позвоню")
    }
}
