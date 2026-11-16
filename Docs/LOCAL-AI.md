# On-device AI and web search

User requested local AI in addition to cloud AI. New installations default to local;
previous saved settings without a mode remain cloud. There is no automatic cloud fallback.

## Local runtime

- Selected by the user: **Qwen3.5-9B Q4_K_M**, Apache 2.0, quantized by Unsloth from Qwen's model. This is a text-only integration; no vision projector is installed.
- Repository `unsloth/Qwen3.5-9B-GGUF`, revision `3885219b6810b007914f3a7950a8d1b469d598a5`, file `Qwen3.5-9B-Q4_K_M.gguf`, 5,680,522,464 bytes (5.68 GB / 5.29 GiB).
- SHA256 `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8` is checked before installation.
- llama.cpp **b12430**. The previous b5046 runtime cannot serve this architecture. Official Apple device/macOS framework ZIP SHA256: `8a37cd2d49ba7f8f1415edc37b69a850459208657e6806ebc1e6e58cf9acfa5a`.
- That release omits the iOS simulator slice. `Scripts/prepare-local-runtime.sh` builds it from the same tag (source archive SHA256 `3263425dc60e0ffa02aa794d73d84b4f9984a5dabf7d7b911d6665c875237d21`) with Metal disabled, then combines it with official device/macOS slices. CI caches the combined artifact; it is not committed. Run preparation before opening/generating the project. `build-ios.sh` does this automatically.
- Metal on iOS devices, CPU on simulators/macOS smoke tests. Model/context are released after each response; cancellation is checked between decode batches/tokens.
- Official Qwen3.5 non-thinking chat suffix (`<think>\n\n</think>\n\n`) gives direct answers. Sampling: temperature 0.7, top-k 20, top-p 0.8, presence penalty 1.5. This is not a claim of frontier-cloud reasoning parity.
- 4096-token context; oldest messages are removed until the prompt fits 3072 tokens. Default response cap 512; length stops are visibly interrupted. Batch 256, microbatch 128, flash attention enabled.
- Download is optional, foreground, Wi-Fi only, cancellable, with progress and streamed integrity checking. At least 6.7 GB available disk is required before starting. No weights are embedded in the IPA or repository; files are excluded from backups. Disk space is distinct from RAM needed for inference.
- A previously installed Qwen2.5 1.5B file is not accepted as the new model and is not silently deleted. Settings offers a separate confirmed removal action.
- Local mode requires on-device Apple dictation and never silently falls back to Apple's servers. Where Russian on-device recognition is unavailable, the app offers text input. Cloud-mode dictation may use Apple's servers. Web search inherently requires internet.

The earlier Qwen2.5 inference CI evidence does **not** validate this upgrade. Current Qwen3.5 validation is recorded separately in VERIFICATION.md. iPhone compatibility, available RAM, latency, heat and power use require physical-device testing. The screenshot's device name is not sufficient evidence of its memory capacity. No GPT-6-equivalent quality claim is made.

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
