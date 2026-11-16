import XCTest

final class VoiceConversationTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testVoiceModePreservesDraftAndRequiresExplicitCommandReview() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        let input = app.descendants(matching: .any)["conversation.input"]
        XCTAssertTrue(input.waitForExistence(timeout: 30))
        let text = "Мира, сохрани заметку: Voice review " + UUID().uuidString.prefix(8)
        input.tap(); input.typeText(text)
        app.buttons["conversation.voiceMode"].tap()
        let draft = app.descendants(matching: .any)["voice.draft"]
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        XCTAssertEqual(draft.value as? String, text)
        XCTAssertEqual(app.buttons["voice.microphone"].label, "Говорить")
        XCTAssertFalse(app.descendants(matching: .any)["voice.level"].exists,
                       "Entering voice mode must not open the microphone")
        XCTAssertTrue(app.buttons["voice.send"].isEnabled)
        app.buttons["voice.send"].tap()
        XCTAssertTrue(app.navigationBars["Новая заметка"].waitForExistence(timeout: 5))
        app.buttons["Отмена"].tap()
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        XCTAssertEqual(draft.value as? String, text, "Cancelling an action must retain the dictated/typed question")
        app.buttons["voice.textMode"].tap()
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        XCTAssertEqual(input.value as? String, text)
        app.buttons["conversation.voiceMode"].tap()
        app.buttons["Настройки"].tap()
        XCTAssertTrue(app.navigationBars["Настройки"].waitForExistence(timeout: 5))
        app.buttons["Готово"].tap()
        XCTAssertEqual(draft.value as? String, text)
        XCTAssertEqual(app.buttons["voice.microphone"].label, "Говорить")
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Voice mode — reviewed draft and explicit controls"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
