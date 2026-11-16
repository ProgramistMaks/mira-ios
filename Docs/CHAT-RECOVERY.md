# Chat recovery — review findings, implementation pending

Reviewed on 2026-11-16 against the source following `3d62520`.
The execution workspace became unavailable before the source-edit command started.
No chat implementation changes or new test results are claimed here. The existing
character animation work is already saved in GitHub. Do not dispatch a hosted build
to work around this workspace outage; follow the build budget in QUALITY.md.

## Confirmed source findings

- `Core/Conversation.swift`: `ChatClient.Chunk.Choice` does not decode
  `finish_reason`. Any text followed by `[DONE]` returns success, including a
  provider response ending with `finish_reason: "length"`. The UI can therefore
  label a truncated cloud response complete. EOF without `[DONE]` already fails.
- `App/CompanionStore.swift`: the empty interrupted assistant message is persisted
  before generation, but `append(_:to:)` only changes memory. Normal completion,
  errors, cancellation and background cancellation save the current text. An abrupt
  process termination during generation can lose all streamed text since the initial
  save. This is not a claim that normal connection-error handling drops the text.
- `App/CompanionApp.swift`: loading and interrupted labels depend on the global
  `thinking` flag. Starting a new answer can show a spinner on an older empty
  interrupted answer and hide interruption labels on previous answers.
- The conversation has no action to restore the original question from a stopped
  answer. Automatic retries must not be introduced: they can consume provider quota.

## Next implementation batch

1. Extract a shared, portable stream decoder used by the actual transport. Track
   completion reasons; distinguish a normal stop, length limit, provider filtering
   and unsupported completion. Retain the explicit end-marker requirement and bound
   both line and whole-event sizes. Preserve UTF-8 across byte boundaries and handle
   SSE LF, CRLF and CR framing without duplicate events.
2. Add optional message metadata for interruption reason and originating question,
   keeping existing stored JSON readable. Mark only the currently active reply as
   loading. Do not automatically voice an incomplete answer as a finished response.
3. Coalesce streamed-text persistence into approximately one-second checkpoints.
   Finalization, stopping, backgrounding and error handling still save immediately.
   Cancel old checkpoint tasks so they cannot run against a later answer or cleared
   conversation. A checkpoint cannot promise zero loss on sudden termination.
4. Offer an explicit action to return the original question to the composer without
   sending it. Preserve an existing draft unless the user confirms replacing it.
   The user then chooses whether to submit another request.

## Local verification required before committing implementation

- Feed the production decoder actual SSE bytes, including split Russian UTF-8,
  keepalives, multiline events, CR/LF variants, final content with a finish reason,
  usage events, length/filter stops, malformed or oversized input, missing end
  markers, empty answers and late/conflicting chunks.
- Verify existing message JSON migration, interruption metadata round trips and
  originating-question recovery for both new and legacy messages.
- Use controlled async callbacks to verify checkpoint coalescing and stale-task
  cancellation after stop, completion, clearing history and starting another reply.
- Parse changed app Swift sources locally and run the portable suite. Native UI and
  Apple URLSession integration remain pending the next justified batched iOS build.

No model pins, inference runtime, API credentials or hosted workflows changed during
this review. No paid iOS build or provider request was started.
