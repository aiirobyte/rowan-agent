# StreamFn Model Abstraction

Rowan uses `StreamFn` as the provider-independent model Interface for now. Provider adapters own wire conversion, while the Agent loop consumes Rowan protocol events and should not depend on provider packages.
