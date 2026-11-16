# On-device AI and web search

User requested local AI in addition to cloud AI. New installations default to local;
previous saved settings without a mode remain cloud. There is no automatic cloud fallback.

## Local runtime

The in-app catalogue contains only locally downloadable models. All five files are pinned to immutable Hugging Face revisions with exact sizes and SHA256 in `Core/LocalModelCatalog.swift`:

| Model | Quantization | Download | Guidance on a device with sufficient total RAM |
| --- | --- | --- | --- |
| Qwen3.5 9B | Q4_K_M | 5.68 GB | Crashes/slowness possible |
| Qwen3.5 9B | Q3_K_M | 4.67 GB | Lower memory pressure, some precision loss |
| Qwen3.5 4B | Q4_K_M | 2.74 GB | Recommended balance |
| Qwen3.5 2B | Q4_K_M | 1.28 GB | Lightweight, weaker on complex tasks |
| Google Gemma 4 E2B IT | Q4_K_M | 3.11 GB | Google alternative |

Sources are Unsloth quantizations of Qwen/Google models under Apache 2.0. This is text-only inference; no vision/audio projectors are installed. The recommendations are estimates, not device certifications. They downgrade to a high-risk warning when total physical RAM is below the file size plus 1.5 GB. That heuristic is not an app-memory entitlement or a guarantee of survival under iOS memory pressure.

Selection is persisted separately from cloud settings. Each model has its own installed file and integrity check. Selection/removal are disabled while answering; selection is also disabled during download. Sending a message captures the selected file and prompt family so it cannot change midway. Previously downloaded models remain available when switching. Default selection remains the user's original Qwen3.5 9B Q4 choice.

Kimi is deliberately excluded following the user's local-only catalogue instruction. It has no cloud preset or misleading download button. Qwen3.8-27B is the selected target for the future desktop app, not an iPhone catalogue entry; see `DESKTOP-AI.md`.

- Initial selected model: **Qwen3.5-9B Q4_K_M**.
- Repository `unsloth/Qwen3.5-9B-GGUF`, revision `3885219b6810b007914f3a7950a8d1b469d598a5`, file `Qwen3.5-9B-Q4_K_M.gguf`, 5,680,522,464 bytes (5.68 GB / 5.29 GiB).
- SHA256 `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8` is checked before installation.
- llama.cpp **b12430**. The previous b5046 runtime cannot serve this architecture. Official Apple device/macOS framework ZIP SHA256: `8a37cd2d49ba7f8f1415edc37b69a850459208657e6806ebc1e6e58cf9acfa5a`.
- That release omits the iOS simulator slice. `Scripts/prepare-local-runtime.sh` builds it from the same tag (source archive SHA256 `3263425dc60e0ffa02aa794d73d84b4f9984a5dabf7d7b911d6665c875237d21`) with Metal disabled and the corresponding library omitted from the link list, then combines it with official device/macOS slices. CI caches the combined artifact; it is not committed. Run preparation before opening/generating the project. `build-ios.sh` does this automatically.
- Metal on iOS devices, CPU on simulators/macOS smoke tests. Model/context are released after each response; cancellation is checked between decode batches/tokens.
- Official Qwen3.5 non-thinking chat suffix (`<think>\n\n</think>\n\n`) gives direct answers. Sampling: temperature 0.7, top-k 20, top-p 0.8, presence penalty 1.5. This is not a claim of frontier-cloud reasoning parity.
- Gemma 4 uses its own `<|turn>system/user/model` / `<turn|>` template, with tokenizer-supplied BOS and no thinking channel. Sampling: temperature 1.0, top-p 0.95, top-k 64, no presence penalty. It never receives a Qwen template.
- 4096-token context; oldest messages are removed until the prompt fits 3072 tokens. Default response cap 512; length stops are visibly interrupted. Batch 256, microbatch 128, flash attention enabled.
- Download is optional, foreground and Wi-Fi only, with pause/resume, byte/rate progress and streamed integrity checking. The app pauses when backgrounded and retains its partial file across launches. Remaining bytes plus 1 GB available disk are required (6.68 GB for a fresh largest entry). No weights are embedded in the IPA or repository; files are excluded from backups. Disk space is distinct from RAM needed for inference.
- A previously installed Qwen2.5 1.5B file is not accepted as the new model and is not silently deleted. Settings offers a separate confirmed removal action.
- Local mode requires on-device Apple dictation and never silently falls back to Apple's servers. Where Russian on-device recognition is unavailable, the app offers text input. Cloud-mode dictation may use Apple's servers. Web search inherently requires internet.

The earlier Qwen2.5 inference CI evidence does **not** validate this upgrade. Current Qwen3.5 validation is recorded separately in VERIFICATION.md. iPhone compatibility, available RAM, latency, heat and power use require physical-device testing. The screenshot's device name is not sufficient evidence of its memory capacity. No GPT-6-equivalent quality claim is made.

## Resumable transfers

`DownloadCore/ModelTransfer.swift` streams URLSession data into an app-owned `.partial`
file. A small atomic checkpoint identifies the pinned URL, expected size/hash and
server validator. It stores the original catalogue URL, never the temporary signed
CDN redirect URL. A matching partial file resumes with Range/If-Range; changed pinned
metadata starts a fresh file. A valid 206 must start at the saved byte and declare
the expected total. A full 200 response restarts the file instead of appending it.
Existing bytes are only discarded once actual replacement body data arrives, so
intermediate/empty responses cannot erase a saved download. HTTP failures and pause
retain usable bytes. The transfer session is reused across attempts; its serial
delegate router releases each transfer when its task completes.

The model store still hashes the entire completed file with CryptoKit and requires
the exact SHA256 and size before atomic installation. A paused verification can be
restarted without network traffic. A failed hash discards the partial file and
shows a model-specific retry message. A separate confirmed action discards an
unfinished download. None of this provides background downloads: leaving the app
requests a pause, while active speech retains its separate audio behavior.

Twelve Swift integration tests exercise real local HTTP transfers, cancellation,
redirects, changed validators, ignored ranges, invalid ranges/totals, truncated and
oversized bodies, saved-file identity, empty replacement responses and cleanup.
The suite needs Swift 5.10+, Python 3 and localhost access (`swift test` from the
repository root). A separate small HTTPS probe of the actual pinned Qwen3.5 9B URL
also resumed across independent process launches; no complete model was downloaded
or SHA-verified in that probe. Native UI, Wi-Fi restrictions, app suspension and
full install/corruption behavior still require iOS validation.

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
