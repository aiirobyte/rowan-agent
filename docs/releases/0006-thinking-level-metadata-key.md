# Rowan Agent 0.10.1 — the ThinkingLevel metadata key matches the host

A Run's selected ThinkingLevel is read from `metadata.mori.thinkingLevel`. The
reader still consulted the host's legacy `everyield` key, so a host that sends
its level under its current name never had it reach the model.

Status: staged and package-built locally; npm publication requires explicit
authorization for the external registry mutation.

## Runtime contract

- `thinkingLevelFromUserInput` and `thinkingLevelFromMessages` read
  `metadata.mori.thinkingLevel`. The seven accepted values, the request field
  they feed, and every other public seam are unchanged.

## Compatibility

Drop-in for 0.10.0 for a host that already writes `metadata.mori`. A host that
still writes the legacy key must rename it, which is the whole of this change.
