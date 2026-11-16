# Desktop local model target

The user selected **Qwen/Qwen3.8-27B** for the future computer edition of the assistant. Desktop implementation is a later phase; no desktop app or local-runtime certification is claimed here.

Primary source: https://huggingface.co/Qwen/Qwen3.8-27B

A prospective GGUF option exists in `unsloth/Qwen3.8-27B-GGUF`, revision `4af51b3542f775b0a8e4b310bfb3f17e01c306c9`: `Qwen3.8-27B-UD-Q4_K_M.gguf`, 16,564,259,744 bytes, SHA256 `1bce504dfecd84153666928a41d8a66706f0158d3a317bc5196b72819d7dc529`. This is Unsloth's dynamic quantization, not the original full-precision weights. Metadata was checked on 2026-11-16; weights have not been downloaded or run.

Before desktop implementation, establish the actual OS, CPU/GPU and RAM/VRAM, then validate the model's runtime, template, memory use and generation on that machine. A 16.56 GB file needs additional runtime/context memory; file size is not a supported-hardware specification.

The iPhone catalogue contains only the five smaller locally supported runtime candidates. It does not offer this desktop model or Kimi downloads.
