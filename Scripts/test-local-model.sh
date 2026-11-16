#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
model_file="${RUNNER_TEMP:-/tmp}/mira-qwen3.5-9b-q4_k_m.gguf"
curl --fail --location --retry 3 --max-time 1200 \
  'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf' \
  --output "$model_file"
printf '%s  %s\n' '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8' "$model_file" | shasum -a 256 --check
swift run --package-path Packages/LocalLLM -c release LocalLLMSmoke "$model_file"

model_file="${RUNNER_TEMP:-/tmp}/mira-gemma4-e2b-q4.gguf"
curl --fail --location --retry 3 --max-time 1200 \
  'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2/gemma-4-E2B-it-Q4_K_M.gguf' \
  --output "$model_file"
printf '%s  %s\n' '740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8' "$model_file" | shasum -a 256 --check
swift run --package-path Packages/LocalLLM -c release LocalLLMSmoke "$model_file" gemma4
