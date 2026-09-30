# Rowan Agent 0.13.3 — Phase Payload on Run Snapshots

`RunSnapshot.phasePayload` returns the effective entry Phase Payload a Run started with (declared defaults filled). It is read from the durable Run record, so it stays available after Runtime restart and for terminal Runs. Runs started without a `phasePayload` omit the field.

Hosts no longer need to keep their own copy of the Payload to show or replay a launch.

## Packages

- `@rowan-agent/agent` 0.13.3
- Other package versions unchanged
