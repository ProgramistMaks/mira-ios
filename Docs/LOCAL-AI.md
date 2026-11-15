# On-device AI and web search

User requested local AI in addition to cloud AI. New installations default to local;
previous saved settings without a mode remain cloud. There is no automatic cloud fallback.

## Local runtime

- llama.cpp b5046, official pinned XCFramework with SHA256 checksum; MIT license bundled in `Packages/LocalLLM`.
- Qwen2.5-1.5B-Instruct Q4_K_M from Qwen's official Hugging Face repository, Apache 2.0.
- Pinned revision `91cad51170dc346986eccefdc2dd33a9da36ead9`; file is 1,117,320,736 bytes.
- SHA256 `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` is checked before installation.
- Download is optional, foreground, Wi-Fi only, cancellable, with progress and integrity checking. Model is excluded from backups and removable in settings. No weights are embedded in the IPA or Git repository.
- Inference uses Metal on iOS devices and CPU on simulators/macOS smoke tests. Model/context are released after each response. Cancellation is checked between decode batches/tokens.
- 4096-token context; oldest messages are removed until the prompt fits 3072 tokens. Default response cap is 512 tokens; a length stop is visibly marked interrupted.
- Local mode requires on-device Apple dictation and never silently falls back to Apple's servers. Where Russian on-device recognition is unavailable, the app offers text input. Cloud-mode dictation may use Apple's servers. Web search inherently requires internet.

CI run `43766167802` compiled both iOS and the local-runtime smoke executable, downloaded/verified the exact model and answered a short Russian arithmetic prompt with `4`. Six native unit tests and the UI test also passed. Passing the smoke check does not certify Russian dialogue quality, iPhone latency, thermal behavior or energy use.

## Tavily

The user identified Tavily as an available search provider. Search uses HTTPS POST
to `api.tavily.com/search`, basic depth, at most five results, no raw page fetch,
and displays real source titles, excerpts and HTTPS links. The key is entered on
device and stored in a separate Keychain item. It is never given to the avatar,
stored in source, or forwarded to an LLM. Search is initiated only by its button.
No live requests have been made with the credential pasted into the conversation;
the user was advised to rotate it. This document deliberately contains no key.

Cloud chat still requires a separate compatible LLM provider/key. Tavily is not
used as a replacement for a conversational model.
