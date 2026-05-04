# AgentEvent ExecutionTurn And Pino History

Rowan separates live observability, replay seed, and durable conversation state: AgentEvents are emitted during runs, ExecutionTurns persist phase-level driver history, and Pino JSONL run logs are observability output rather than replay truth.
