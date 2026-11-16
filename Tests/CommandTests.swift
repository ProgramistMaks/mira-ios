import XCTest
@testable import Companion

final class CommandTests: XCTestCase {
    func testExplicitCommandsPreserveUserContent() throws {
        let note = try XCTUnwrap(CommandProposal.parse("МИРА, пожалуйста, сохрани заметку: Купить чай\nи молоко"))
        XCTAssertEqual(note.kind, .note)
        XCTAssertEqual(note.text, "Купить чай\nи молоко")
        XCTAssertEqual(CommandProposal.parse("напомни мне позвонить маме завтра")?.kind, .reminder)
        XCTAssertEqual(CommandProposal.parse("Найди в интернете расписание поездов")?.text, "расписание поездов")
    }
    func testConversationNegationsAndQuotedCommandsAreNotActions() {
        for text in ["Не сохраняй заметку: секрет", "Мира, не добавь заметку: тест", "Что значит сохрани заметку?",
                     "Он сказал: найди в интернете погоду", "«Сохрани заметку: привет»", "Сохрани заметку", "Сохрани заметку: ",
                     "Напомни мне", "Напомнишь мне об этом?", "Найди в интернетекнигу", "Давай поговорим"] {
            XCTAssertNil(CommandProposal.parse(text), text)
        }
    }
}
