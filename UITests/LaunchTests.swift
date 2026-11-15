import XCTest

final class LaunchTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testCharacterAndPersistentNote() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["avatar.ready"].waitForExistence(timeout: 60),
                      "Bundled VRM must actually load inside WKWebView")
        capture("Portrait — native app and loaded character")

        app.buttons["Настройки"].tap()
        XCTAssertTrue(app.navigationBars["Настройки"].waitForExistence(timeout: 5))
        capture("Native settings")
        app.buttons["Готово"].tap()

        app.buttons["Команды"].tap()
        let input = app.descendants(matching: .any)["command.input"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        let note = "Local note " + UUID().uuidString.prefix(8)
        input.typeText(note)
        app.buttons["command.saveNote"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["Понятно"].tap()
        app.buttons["Готово"].tap()
        app.terminate()

        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["avatar.ready"].waitForExistence(timeout: 60))
        app.buttons["Команды"].tap()
        XCTAssertTrue(app.staticTexts[note].waitForExistence(timeout: 5), "Saved note must survive a cold launch")
        app.buttons["Готово"].tap()

        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.buttons["Настройки"].waitForExistence(timeout: 5))
        capture("Landscape — adaptive two-column layout")
        XCUIDevice.shared.orientation = .portrait
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways
        add(attachment)
    }
}
