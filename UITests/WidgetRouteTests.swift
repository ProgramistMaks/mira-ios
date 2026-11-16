import XCTest

final class WidgetRouteTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testWidgetRoutesAcrossColdLaunchAndPresentedSheets() {
        let app = XCUIApplication()
        app.terminate()
        app.open(URL(string: "mira://commands")!)
        XCTAssertTrue(app.descendants(matching: .any)["command.input"].waitForExistence(timeout: 30))

        // XCUIApplication.open relaunches the app. Subsequent links must be
        // delivered by the OS to the running process, as a widget link would be.
        XCUIDevice.shared.system.open(URL(string: "mira://settings")!)
        XCTAssertTrue(app.navigationBars["Настройки"].waitForExistence(timeout: 15))

        XCUIDevice.shared.system.open(URL(string: "mira://chat")!)
        let input = app.descendants(matching: .any)["conversation.input"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        input.typeText("Widget route draft")
        XCTAssertEqual(input.value as? String, "Widget route draft")

        XCUIDevice.shared.system.open(URL(string: "mira://commands")!)
        XCTAssertTrue(app.descendants(matching: .any)["command.input"].waitForExistence(timeout: 15))
        XCUIDevice.shared.system.open(URL(string: "mira://chat")!)
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        XCTAssertEqual(input.value as? String, "Widget route draft", "Navigation must not send or replace a draft")
        XCTAssertTrue(app.buttons["Начать запись"].exists, "Opening a widget must not start recording")
    }
}
