# JSONL SessionManager Until Query Pressure

Rowan uses append-only JSONL SessionManager persistence until replay, fork, compaction, concurrency, or query requirements justify a database. This keeps local runs inspectable and avoids premature storage lock-in while avoiding whole-state Session rewrites.
