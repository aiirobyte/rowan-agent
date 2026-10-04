# Rowan Agent 0.16.2 — bracketed tool spill footer clearly separated from output

This release makes tool spill footers unambiguously recognizable as metadata and clearly separated from tool output across `read`, `bash`, and durable runtime spills.

## Bracketed tool spill footer metadata

Previously, the built-in `read` and `bash` tools and the durable runtime large-result spill appended spill footers directly to tool output with a single newline:

```text
Full result: /path/to/archive.log
Offset: 0
```

When file content or command output ended with a trailing newline (`\n`), this created `\n\nFull result: ...`. In Markdown and plain text documents, models frequently interpreted `Full result: ...` as document text rather than tool metadata. In downstream edits, models attempted to match file endings including the footer text (such as `oldText: "last line\n\nFull result"`), causing edits to fail with "oldText not found in file".

This release updates the spill footer across `read`, `bash`, and `durable-runtime` to use a consistent bracketed metadata format preceded by a blank-line separator:

```text
[Full result: /path/to/archive.log, offset 0]
```

- **Unambiguous metadata**: The bracketed shape distinguishes runtime tool metadata from document or command output.
- **Clear separation**: Preceding the footer with a blank-line separator (`\n\n`) ensures file and command output ending in newlines are cleanly demarcated from metadata.
- **Double-spill prevention**: Durable runtime's large-result spill detection recognizes both the new bracketed format and legacy spill footers, leaving already-spilled results untouched.
- **Continuation hints preserved**: Continuation hints like `[truncated]` and `Showing lines X-Y of N. Use offset=...` remain active.

## Packages

- `@rowan-agent/agent` 0.16.2
- Other package versions unchanged
