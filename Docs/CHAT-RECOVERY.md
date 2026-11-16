# Chat recovery — implemented in source, native validation pending

## Completion and partial text

`App/ChatClient.swift` uses the same `ConversationCore/ChatStreamDecoder.swift`
byte parser exercised by the portable tests. The stream must contain an explicit
`[DONE]` event. EOF alone, even following `finish_reason: "stop"`, is not success.
The decoder handles split UTF-8, an initial BOM, LF/CRLF/CR framing, multiline data,
role/usage events and keepalives. Limits cover individual lines, whole SSE data
events, output characters (64,000) and output UTF-8 bytes (1 MiB).

Completion reasons remain distinct:

- `stop`, or a legacy provider's `[DONE]` without a reason: complete only when
  non-whitespace text was received.
- `length`: partial answer, shown with the length-limit label.
- `content_filter`: provider-stopped answer, including an empty answer.
- Unsupported/unknown reasons: incomplete, never executed as a tool/action.
- Malformed data, provider error envelopes, invalid UTF-8, output overflow and
  missing end markers fail the stream without discarding already displayed text.

`CompanionStore` persists the returned interruption reason. The local runtime's
existing length-stop result maps to the same length label. Incomplete answers do
not automatically start speech playback. Loading indicators belong only to the
active reply; older interrupted replies keep their labels during a new response.

## Saving during generation

`ResponseCheckpoint` coalesces token updates into one pending save, approximately
one second after the first unsaved update. The save reads the latest conversation
snapshot. Normal completion, errors, explicit stopping and background cancellation
still save immediately. Cancellation invalidates the pending callback so it cannot
save after clearing history or act on a later response.

Writes continue to use the existing atomic, file-protected `LocalStore`. An abrupt
process termination can still lose text since the last successful checkpoint;
storage failures are surfaced through the existing error UI. This is not a promise
of lossless persistence across a crash or failed disk write.

## Restoring a question

New assistant replies retain an optional originating-question ID. Previously saved
messages decode without the new optional fields; a legacy interrupted reply can
recover its immediately preceding user question. Missing or dangling links do not
guess another question.

“Вернуть вопрос” copies the question to the composer. It never sends a request.
A nonempty draft requires confirmation before replacement. Restore is unavailable
during generation or recording setup/capture. The user explicitly presses Send to
make another request; no automatic retries or provider quota consumption are added.

## Verification and build budget

The portable suite passes **56 tests**, including nine stream-decoder cases, four
message/recovery cases and three controlled-async checkpoint cases. New tests are
also wired into the native unit-test target. Changed app files passed Swift syntax
parsing, which is not Apple SDK type checking.

Native URLSession streaming, SwiftUI labels/confirmation/focus, file-protection
behavior, background/relaunch recovery and speech integration still need the next
justified batched iOS check. No hosted workflow, real provider request, model download
or inference smoke run was started for this update. Model pins and runtime are unchanged.
