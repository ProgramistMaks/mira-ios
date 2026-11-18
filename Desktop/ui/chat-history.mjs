// Older conversations predate message IDs and the generated flag. Structured
// actions are excluded. Rewriting a legacy reply always uses text generation.
export function canRevise(msg) {
  return (
    msg?.role === 'assistant' &&
    msg.generated !== false &&
    !msg.control &&
    !msg.draft &&
    !msg.files?.length &&
    !msg.sources?.length
  );
}
