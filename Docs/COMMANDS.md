# Explicit offline commands

`CommandProposal.parse` recognizes only anchored Russian action phrases. It runs
before the local-model or cloud-key configuration checks and creates a proposal,
not an action. Optional leading `Мира,` and `пожалуйста,` are accepted; text and case
inside the command payload are preserved.

| Example | Preview |
| --- | --- |
| `Мира, сохрани заметку: Купить чай` | Editable note with an explicit save button |
| `Создай напоминание: Позвонить маме` | Editable reminder with a date/time picker and EventKit confirmation |
| `Найди в интернете расписание поездов` | Query with Tavily and browser search choices |

Negated, quoted and embedded examples do not match the command prefix. This is a
small deterministic command vocabulary, not arbitrary natural-language reasoning
or a configurable automation/block system. Reminder times are not extracted from
text; the form explains this and displays the exact time before confirmation.

Dismissing a proposal leaves the composer draft intact and performs no action.
On success, actual result text is appended to the conversation and the matching
draft is cleared. Search results remain visible in the review sheet; a browser
launch is reported only as opening a search, never as a completed search result.
Errors do not generate successful acknowledgements. Notes stay app-local,
reminders require system permission, and search requires internet.

Native tests exercise phrase boundaries and common non-command text. The UI test
submits a Russian note command with no LLM configured, cancels the preview, checks
that no note exists, submits again and explicitly saves, then checks persistence
in the note list. See VERIFICATION.md for current CI results.
