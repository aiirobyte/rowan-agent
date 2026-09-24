# Rowan Agent 0.9.25 — timing-independent Claim and observation tests

This release carries one test change: the Claim and observation tests no longer
depend on wall-clock timing, so a loaded machine cannot turn them red.

Status: staged and package-built locally; npm publication requires explicit
authorization for the external registry mutation.

## Runtime contract

Unchanged. No public seam, event, or schema moved, and hosts have no reason to
move to this version.

## Compatibility

Drop-in for 0.9.24. The only difference between the two packages is the test
suite that runs in CI.
