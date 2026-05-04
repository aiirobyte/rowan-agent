# JSON AgentStore Until Query Pressure

Rowan uses JSON-backed AgentStore persistence until replay, fork, compaction, concurrency, or query requirements justify a database. This keeps local runs inspectable and avoids premature storage lock-in.
