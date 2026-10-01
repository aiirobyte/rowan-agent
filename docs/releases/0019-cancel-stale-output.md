# Rowan Agent 0.14.3 — prevent committing earlier Run replies on cancellation

When an Agent Run was cancelled before the model emitted any visible output, the runtime's cancellation branch projected the latest assistant message across the entire conversation history instead of scoping the search to messages produced during the current execution. As a result, the previous Run's assistant reply was re-projected with `interrupted: true`, assigned the new Run's id, and committed as the cancelled Run's output. Because messages are keyed by message id, the previous Run lost its assistant message and its sequence slot became vacant, thinking blocks were stripped, and the host showed an interrupted assistant reply offering Continue instead of Retry.

`latestAssistant` now slices the message list internally using the execution history length, ensuring that all completion, input-required, and cancellation paths only inspect messages emitted during the current attempt. In addition, `DurableStore.cancelRun` guards against committing an interrupted output message whose identity belongs to another Run.

## Packages

- `@rowan-agent/agent` 0.14.3
- Other package versions unchanged
