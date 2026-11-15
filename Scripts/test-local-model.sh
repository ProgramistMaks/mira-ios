#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
model_file="${RUNNER_TEMP:-/tmp}/mira-qwen2.5-1.5b-q4.gguf"
curl --fail --location --retry 3 --max-time 600 \
  'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf' \
  --output "$model_file"
printf '%s  %s\n' '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e' "$model_file" | shasum -a 256 --check
swift run --package-path Packages/LocalLLM -c release LocalLLMSmoke "$model_file"
