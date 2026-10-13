/**
 * Static model catalog imported from @earendil-works/pi-ai@1.2.0.
 * Manifest schemaVersion: 6, generatedAt: 2026-10-12T22:50:30.032Z.
 * Run `bun run import-pi-catalog` to regenerate.
 */
import type { Model } from "./protocol";

export const MODELS: Record<string, Record<string, Model>> = {
  "ant-ling": {
    "Ling-2.6-1T": {
      "id": "Ling-2.6-1T",
      "name": "Ling 2.6 1T",
      "protocol": "openai-completions",
      "provider": "ant-ling",
      "baseUrl": "https://api.ant-ling.com/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.25,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Ling-2.6-flash": {
      "id": "Ling-2.6-flash",
      "name": "Ling 2.6 Flash",
      "protocol": "openai-completions",
      "provider": "ant-ling",
      "baseUrl": "https://api.ant-ling.com/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.01,
        "output": 0.02,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Ring-2.6-1T": {
      "id": "Ring-2.6-1T",
      "name": "Ring 2.6 1T",
      "protocol": "openai-completions",
      "provider": "ant-ling",
      "baseUrl": "https://api.ant-ling.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.25,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    }
  },
  "anthropic": {
    "claude-fable-5": {
      "id": "claude-fable-5",
      "name": "Claude Fable 5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-fable-5-1": {
      "id": "claude-fable-5-1",
      "name": "Claude Fable 5.1",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 0.25,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-haiku-4-5": {
      "id": "claude-haiku-4-5",
      "name": "Claude Haiku 4.5 (latest)",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-haiku-4-5-20251001": {
      "id": "claude-haiku-4-5-20251001",
      "name": "Claude Haiku 4.5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-haiku-5-5": {
      "id": "claude-haiku-5-5",
      "name": "Claude Haiku 5.5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.5,
            "output": 2.5,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-5": {
      "id": "claude-opus-4-5",
      "name": "Claude Opus 4.5 (latest)",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-opus-4-5-20251101": {
      "id": "claude-opus-4-5-20251101",
      "name": "Claude Opus 4.5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-opus-4-6": {
      "id": "claude-opus-4-6",
      "name": "Claude Opus 4.6",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-7": {
      "id": "claude-opus-4-7",
      "name": "Claude Opus 4.7",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-8": {
      "id": "claude-opus-4-8",
      "name": "Claude Opus 4.8",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-5": {
      "id": "claude-opus-5",
      "name": "Claude Opus 5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-5-5": {
      "id": "claude-opus-5-5",
      "name": "Claude Opus 5.5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-4-5": {
      "id": "claude-sonnet-4-5",
      "name": "Claude Sonnet 4.5 (latest)",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-sonnet-4-5-20250929": {
      "id": "claude-sonnet-4-5-20250929",
      "name": "Claude Sonnet 4.5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-sonnet-4-6": {
      "id": "claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-5": {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-5-5": {
      "id": "claude-sonnet-5-5",
      "name": "Claude Sonnet 5.5",
      "protocol": "anthropic-messages",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    }
  },
  "azure": {
    "deepseek-v4-pro": {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "openai-completions",
      "provider": "azure",
      "baseUrl": "",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.925,
        "output": 3.828,
        "cacheRead": 0.165,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    }
  },
  "baseten": {
    "deepseek-ai/DeepSeek-V4-Flash-0731": {
      "id": "deepseek-ai/DeepSeek-V4-Flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.13,
        "output": 0.26,
        "cacheRead": 0.028,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 384000
    },
    "deepseek-ai/DeepSeek-V4-Pro": {
      "id": "deepseek-ai/DeepSeek-V4-Pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.74,
        "output": 3.48,
        "cacheRead": 0.145,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "deepseek-ai/DeepSeek-V4-Pro-0813": {
      "id": "deepseek-ai/DeepSeek-V4-Pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.32,
        "output": 3.96,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "deepseek-ai/DeepSeek-V4.1-Flash": {
      "id": "deepseek-ai/DeepSeek-V4.1-Flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 32768
    },
    "deepseek-ai/DeepSeek-V4.1-Flash-Fast": {
      "id": "deepseek-ai/DeepSeek-V4.1-Flash-Fast",
      "name": "DeepSeek V4.1 Flash Fast",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 32768
    },
    "moonshotai/Kimi-K2.5": {
      "id": "moonshotai/Kimi-K2.5",
      "name": "Kimi K2.5",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 3,
        "cacheRead": 0.12,
        "cacheWrite": 0
      },
      "contextWindow": 262000,
      "maxTokens": 262000
    },
    "moonshotai/Kimi-K2.6": {
      "id": "moonshotai/Kimi-K2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262000,
      "maxTokens": 262000
    },
    "moonshotai/Kimi-K2.7-Code": {
      "id": "moonshotai/Kimi-K2.7-Code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262000,
      "maxTokens": 262000
    },
    "moonshotai/Kimi-K3": {
      "id": "moonshotai/Kimi-K3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B": {
      "id": "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B",
      "name": "Nemotron Ultra",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.12,
        "cacheWrite": 0
      },
      "contextWindow": 202800,
      "maxTokens": 202800
    },
    "nvidia/Nemotron-120B-A12B": {
      "id": "nvidia/Nemotron-120B-A12B",
      "name": "Nemotron Super",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 0.75,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 202800,
      "maxTokens": 202800
    },
    "openai/gpt-oss-120b": {
      "id": "openai/gpt-oss-120b",
      "name": "OpenAI GPT 120B",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128072,
      "maxTokens": 128072
    },
    "thinkingmachines/inkling": {
      "id": "thinkingmachines/inkling",
      "name": "Inkling",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 4.05,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 32768
    },
    "thinkingmachines/inkling-small": {
      "id": "thinkingmachines/inkling-small",
      "name": "Inkling Small",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.2,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 32768
    },
    "zai-org/GLM-4.7": {
      "id": "zai-org/GLM-4.7",
      "name": "GLM 4.7",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0.12,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 200000
    },
    "zai-org/GLM-5": {
      "id": "zai-org/GLM-5",
      "name": "GLM 5",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.95,
        "output": 3.15,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 202800,
      "maxTokens": 202800
    },
    "zai-org/GLM-5.1": {
      "id": "zai-org/GLM-5.1",
      "name": "GLM 5.1",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.3,
        "output": 4.3,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 202800,
      "maxTokens": 202800
    },
    "zai-org/GLM-5.2": {
      "id": "zai-org/GLM-5.2",
      "name": "GLM 5.2",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "zai-org/GLM-5.2-Fast": {
      "id": "zai-org/GLM-5.2-Fast",
      "name": "GLM 5.2 Fast",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.1,
        "output": 6.6,
        "cacheRead": 0.21,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "zai-org/GLM-5.3": {
      "id": "zai-org/GLM-5.3",
      "name": "GLM 5.3",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.14,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "zai-org/GLM-5.3-Fast": {
      "id": "zai-org/GLM-5.3-Fast",
      "name": "GLM 5.3 Fast",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.1,
        "output": 6.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "zai-org/GLM-5.3-Flash": {
      "id": "zai-org/GLM-5.3-Flash",
      "name": "GLM 5.3 Flash",
      "protocol": "openai-completions",
      "provider": "baseten",
      "baseUrl": "https://inference.baseten.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    }
  },
  "cerebras": {
    "gpt-oss-120b": {
      "id": "gpt-oss-120b",
      "name": "GPT OSS 120B",
      "protocol": "openai-completions",
      "provider": "cerebras",
      "baseUrl": "https://api.cerebras.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.35,
        "output": 0.75,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 40960
    },
    "qwen-3.8-27b": {
      "id": "qwen-3.8-27b",
      "name": "Qwen3.8 27B",
      "protocol": "openai-completions",
      "provider": "cerebras",
      "baseUrl": "https://api.cerebras.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.99,
        "output": 1.49,
        "cacheRead": 0.99,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 40960
    }
  },
  "cloudflare-ai-gateway": {
    "claude-fable-5": {
      "id": "claude-fable-5",
      "name": "Claude Fable 5",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-fable-5-1": {
      "id": "claude-fable-5-1",
      "name": "Claude Fable 5.1",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 0.25,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-haiku-4-5": {
      "id": "claude-haiku-4-5",
      "name": "Claude Haiku 4.5 (latest)",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-haiku-5-5": {
      "id": "claude-haiku-5-5",
      "name": "Claude Haiku 5.5",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.5,
            "output": 2.5,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-5": {
      "id": "claude-opus-4-5",
      "name": "Claude Opus 4.5 (latest)",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-opus-4-6": {
      "id": "claude-opus-4-6",
      "name": "Claude Opus 4.6",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-7": {
      "id": "claude-opus-4-7",
      "name": "Claude Opus 4.7",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-8": {
      "id": "claude-opus-4-8",
      "name": "Claude Opus 4.8",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-5": {
      "id": "claude-opus-5",
      "name": "Claude Opus 5",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-5-5": {
      "id": "claude-opus-5-5",
      "name": "Claude Opus 5.5",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-4-5": {
      "id": "claude-sonnet-4-5",
      "name": "Claude Sonnet 4.5 (latest)",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-sonnet-4-6": {
      "id": "claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-5": {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-5-5": {
      "id": "claude-sonnet-5-5",
      "name": "Claude Sonnet 5.5",
      "protocol": "anthropic-messages",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-4.1": {
      "id": "gpt-4.1",
      "name": "GPT-4.1",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "gpt-4.1-mini": {
      "id": "gpt-4.1-mini",
      "name": "GPT-4.1 mini",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 1.6,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "gpt-4.1-nano": {
      "id": "gpt-4.1-nano",
      "name": "GPT-4.1 nano",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 32768
    },
    "gpt-4o": {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 5,
        "cacheRead": 0.625,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-4o-mini": {
      "id": "gpt-4o-mini",
      "name": "GPT-4o mini",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.3,
        "cacheRead": 0.0375,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-5": {
      "id": "gpt-5",
      "name": "GPT-5",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "gpt-5-mini": {
      "id": "gpt-5-mini",
      "name": "GPT-5 Mini",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "gpt-5-nano": {
      "id": "gpt-5-nano",
      "name": "GPT-5 Nano",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.4,
        "cacheRead": 0.005,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "gpt-5.1": {
      "id": "gpt-5.1",
      "name": "GPT-5.1",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "gpt-5.4": {
      "id": "gpt-5.4",
      "name": "GPT-5.4",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-5.4-mini": {
      "id": "gpt-5.4-mini",
      "name": "GPT-5.4 mini",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "gpt-5.4-nano": {
      "id": "gpt-5.4-nano",
      "name": "GPT-5.4 nano",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.25,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "gpt-5.4-pro": {
      "id": "gpt-5.4-pro",
      "name": "GPT-5.4 Pro",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-5.5": {
      "id": "gpt-5.5",
      "name": "GPT-5.5",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-5.5-pro": {
      "id": "gpt-5.5-pro",
      "name": "GPT-5.5 Pro",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-5.6-luna": {
      "id": "gpt-5.6-luna",
      "name": "GPT-5.6 Luna",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.4,
            "output": 1.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.6-sol": {
      "id": "gpt-5.6-sol",
      "name": "GPT-5.6 Sol",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.4,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 8,
            "output": 30,
            "cacheRead": 0.8,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.6-terra": {
      "id": "gpt-5.6-terra",
      "name": "GPT-5.6 Terra",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6-astra": {
      "id": "gpt-6-astra",
      "name": "GPT-6 Astra",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 20,
            "output": 75,
            "cacheRead": 2,
            "cacheWrite": 25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6-luna": {
      "id": "gpt-6-luna",
      "name": "GPT-6 Luna",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6-sol": {
      "id": "gpt-6-sol",
      "name": "GPT-6 Sol",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6.1-sol": {
      "id": "gpt-6.1-sol",
      "name": "GPT-6.1 Sol",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.2,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "o3": {
      "id": "o3",
      "name": "o3",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "o3-mini": {
      "id": "o3-mini",
      "name": "o3-mini",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.55,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "o4-mini": {
      "id": "o4-mini",
      "name": "o4-mini",
      "protocol": "openai-responses",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/openai",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.275,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "workers-ai/@cf/deepseek-ai/deepseek-v4-flash-0731": {
      "id": "workers-ai/@cf/deepseek-ai/deepseek-v4-flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.44,
        "output": 1.32,
        "cacheRead": 0.014,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "workers-ai/@cf/deepseek-ai/deepseek-v4-pro-0813": {
      "id": "workers-ai/@cf/deepseek-ai/deepseek-v4-pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.32,
        "output": 3.96,
        "cacheRead": 0.044,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "workers-ai/@cf/google/gemma-4-26b-a4b-it": {
      "id": "workers-ai/@cf/google/gemma-4-26b-a4b-it",
      "name": "Gemma 4 26B A4B IT",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.3,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 16384
    },
    "workers-ai/@cf/ibm-granite/granite-4.0-h-micro": {
      "id": "workers-ai/@cf/ibm-granite/granite-4.0-h-micro",
      "name": "Granite 4.0 H Micro",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.017,
        "output": 0.112,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131000,
      "maxTokens": 131000
    },
    "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast": {
      "id": "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "name": "Llama 3.3 70B Instruct fp8 Fast",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.293,
        "output": 2.253,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 24000,
      "maxTokens": 24000
    },
    "workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct": {
      "id": "workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct",
      "name": "Llama 4 Scout 17B 16E Instruct",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.27,
        "output": 0.85,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131000,
      "maxTokens": 16384
    },
    "workers-ai/@cf/mistralai/mistral-small-3.1-24b-instruct": {
      "id": "workers-ai/@cf/mistralai/mistral-small-3.1-24b-instruct",
      "name": "Mistral Small 3.1 24B Instruct",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.351,
        "output": 0.555,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "workers-ai/@cf/moonshotai/kimi-k2.6": {
      "id": "workers-ai/@cf/moonshotai/kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "workers-ai/@cf/moonshotai/kimi-k2.7-code": {
      "id": "workers-ai/@cf/moonshotai/kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "workers-ai/@cf/nvidia/nemotron-3-120b-a12b": {
      "id": "workers-ai/@cf/nvidia/nemotron-3-120b-a12b",
      "name": "Nemotron 3 Super 120B",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "workers-ai/@cf/openai/gpt-oss-120b": {
      "id": "workers-ai/@cf/openai/gpt-oss-120b",
      "name": "GPT OSS 120B",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.35,
        "output": 0.75,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "workers-ai/@cf/openai/gpt-oss-20b": {
      "id": "workers-ai/@cf/openai/gpt-oss-20b",
      "name": "GPT OSS 20B",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "workers-ai/@cf/qwen/qwen3-30b-a3b-fp8": {
      "id": "workers-ai/@cf/qwen/qwen3-30b-a3b-fp8",
      "name": "Qwen3 30B A3b fp8",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0509,
        "output": 0.335,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 32768,
      "maxTokens": 32768
    },
    "workers-ai/@cf/qwen/qwen3.8-27b": {
      "id": "workers-ai/@cf/qwen/qwen3.8-27b",
      "name": "Qwen3.8 27B",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.45,
        "output": 3.2,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "workers-ai/@cf/zai-org/glm-4.7-flash": {
      "id": "workers-ai/@cf/zai-org/glm-4.7-flash",
      "name": "GLM-4.7-Flash",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0605,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "workers-ai/@cf/zai-org/glm-5.2": {
      "id": "workers-ai/@cf/zai-org/glm-5.2",
      "name": "Glm 5.2",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "workers-ai/@cf/zai-org/glm-5.3": {
      "id": "workers-ai/@cf/zai-org/glm-5.3",
      "name": "Glm 5.3",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "workers-ai/@cf/zai-org/glm-5.3-flash": {
      "id": "workers-ai/@cf/zai-org/glm-5.3-flash",
      "name": "Glm 5.3 Flash",
      "protocol": "openai-completions",
      "provider": "cloudflare-ai-gateway",
      "baseUrl": "https://gateway.ai.cloudflare.com/v1/{CLOUDFLARE_ACCOUNT_ID}/{CLOUDFLARE_GATEWAY_ID}/compat",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    }
  },
  "cloudflare-workers-ai": {
    "@cf/deepseek-ai/deepseek-v4-flash-0731": {
      "id": "@cf/deepseek-ai/deepseek-v4-flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.44,
        "output": 1.32,
        "cacheRead": 0.014,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "@cf/deepseek-ai/deepseek-v4-pro-0813": {
      "id": "@cf/deepseek-ai/deepseek-v4-pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.32,
        "output": 3.96,
        "cacheRead": 0.044,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "@cf/google/gemma-4-26b-a4b-it": {
      "id": "@cf/google/gemma-4-26b-a4b-it",
      "name": "Gemma 4 26B A4B IT",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.3,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 16384
    },
    "@cf/ibm-granite/granite-4.0-h-micro": {
      "id": "@cf/ibm-granite/granite-4.0-h-micro",
      "name": "Granite 4.0 H Micro",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.017,
        "output": 0.112,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131000,
      "maxTokens": 131000
    },
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast": {
      "id": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "name": "Llama 3.3 70B Instruct fp8 Fast",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.293,
        "output": 2.253,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 24000,
      "maxTokens": 24000
    },
    "@cf/meta/llama-4-scout-17b-16e-instruct": {
      "id": "@cf/meta/llama-4-scout-17b-16e-instruct",
      "name": "Llama 4 Scout 17B 16E Instruct",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.27,
        "output": 0.85,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131000,
      "maxTokens": 16384
    },
    "@cf/mistralai/mistral-small-3.1-24b-instruct": {
      "id": "@cf/mistralai/mistral-small-3.1-24b-instruct",
      "name": "Mistral Small 3.1 24B Instruct",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.351,
        "output": 0.555,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "@cf/moonshotai/kimi-k2.6": {
      "id": "@cf/moonshotai/kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "@cf/moonshotai/kimi-k2.7-code": {
      "id": "@cf/moonshotai/kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "@cf/nvidia/nemotron-3-120b-a12b": {
      "id": "@cf/nvidia/nemotron-3-120b-a12b",
      "name": "Nemotron 3 Super 120B",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "@cf/openai/gpt-oss-120b": {
      "id": "@cf/openai/gpt-oss-120b",
      "name": "GPT OSS 120B",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.35,
        "output": 0.75,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "@cf/openai/gpt-oss-20b": {
      "id": "@cf/openai/gpt-oss-20b",
      "name": "GPT OSS 20B",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "@cf/qwen/qwen3-30b-a3b-fp8": {
      "id": "@cf/qwen/qwen3-30b-a3b-fp8",
      "name": "Qwen3 30B A3b fp8",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0509,
        "output": 0.335,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 32768,
      "maxTokens": 32768
    },
    "@cf/qwen/qwen3.8-27b": {
      "id": "@cf/qwen/qwen3.8-27b",
      "name": "Qwen3.8 27B",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.45,
        "output": 3.2,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "@cf/zai-org/glm-4.7-flash": {
      "id": "@cf/zai-org/glm-4.7-flash",
      "name": "GLM-4.7-Flash",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0605,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "@cf/zai-org/glm-5.2": {
      "id": "@cf/zai-org/glm-5.2",
      "name": "Glm 5.2",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "@cf/zai-org/glm-5.3": {
      "id": "@cf/zai-org/glm-5.3",
      "name": "Glm 5.3",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "@cf/zai-org/glm-5.3-flash": {
      "id": "@cf/zai-org/glm-5.3-flash",
      "name": "Glm 5.3 Flash",
      "protocol": "openai-completions",
      "provider": "cloudflare-workers-ai",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    }
  },
  "deepseek": {
    "deepseek-flash": {
      "id": "deepseek-flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "deepseek",
      "baseUrl": "https://api.deepseek.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.006,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro": {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "openai-completions",
      "provider": "deepseek",
      "baseUrl": "https://api.deepseek.com",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.32,
        "output": 3.96,
        "cacheRead": 0.044,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    }
  },
  "fireworks": {
    "accounts/fireworks/models/deepseek-v4p1-flash": {
      "id": "accounts/fireworks/models/deepseek-v4p1-flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.006,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "accounts/fireworks/models/ember-1": {
      "id": "accounts/fireworks/models/ember-1",
      "name": "Ember-1",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "accounts/fireworks/models/glm-5p3": {
      "id": "accounts/fireworks/models/glm-5p3",
      "name": "GLM 5.3",
      "protocol": "openai-completions",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1048573,
      "maxTokens": 262144
    },
    "accounts/fireworks/models/glm-5p3-flash": {
      "id": "accounts/fireworks/models/glm-5p3-flash",
      "name": "GLM 5.3 Flash",
      "protocol": "openai-completions",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048573,
      "maxTokens": 131072
    },
    "accounts/fireworks/models/gpt-oss-120b": {
      "id": "accounts/fireworks/models/gpt-oss-120b",
      "name": "GPT OSS 120B",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "accounts/fireworks/models/inkling": {
      "id": "accounts/fireworks/models/inkling",
      "name": "Inkling",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 4.05,
        "cacheRead": 0.17,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "accounts/fireworks/models/kimi-k3": {
      "id": "accounts/fireworks/models/kimi-k3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "accounts/fireworks/models/minimax-m3": {
      "id": "accounts/fireworks/models/minimax-m3",
      "name": "MiniMax-M3",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 512000,
      "maxTokens": 512000
    },
    "accounts/fireworks/models/nemotron-3-ultra-nvfp4": {
      "id": "accounts/fireworks/models/nemotron-3-ultra-nvfp4",
      "name": "Nemotron 3 Ultra 550B A55B",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.12,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 128000
    },
    "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b": {
      "id": "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
      "name": "Nemotron 3.5 Lightning 30B A3B",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.2,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "accounts/fireworks/models/qwen3p8-2p4t-a95b": {
      "id": "accounts/fireworks/models/qwen3p8-2p4t-a95b",
      "name": "Qwen3.8 2.4T A95B",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "accounts/fireworks/models/qwen3p8-max": {
      "id": "accounts/fireworks/models/qwen3p8-max",
      "name": "Qwen3.8 Max",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "accounts/fireworks/routers/deepseek-flash-latest": {
      "id": "accounts/fireworks/routers/deepseek-flash-latest",
      "name": "DeepSeek Flash Latest",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.006,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "accounts/fireworks/routers/glm-5p3-fast": {
      "id": "accounts/fireworks/routers/glm-5p3-fast",
      "name": "GLM 5.3 Fast",
      "protocol": "openai-completions",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.1,
        "output": 6.6,
        "cacheRead": 0.39,
        "cacheWrite": 0
      },
      "contextWindow": 1048572,
      "maxTokens": 262144
    },
    "accounts/fireworks/routers/glm-fast-latest": {
      "id": "accounts/fireworks/routers/glm-fast-latest",
      "name": "GLM 5.3 Fast (Latest)",
      "protocol": "openai-completions",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.1,
        "output": 6.6,
        "cacheRead": 0.39,
        "cacheWrite": 0
      },
      "contextWindow": 1048572,
      "maxTokens": 262144
    },
    "accounts/fireworks/routers/glm-flash-latest": {
      "id": "accounts/fireworks/routers/glm-flash-latest",
      "name": "GLM Flash Latest (GLM 5.3 Flash)",
      "protocol": "openai-completions",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048573,
      "maxTokens": 131072
    },
    "accounts/fireworks/routers/glm-latest": {
      "id": "accounts/fireworks/routers/glm-latest",
      "name": "GLM Latest",
      "protocol": "openai-completions",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1048573,
      "maxTokens": 262144
    },
    "accounts/fireworks/routers/kimi-fast-latest": {
      "id": "accounts/fireworks/routers/kimi-fast-latest",
      "name": "Kimi Fast Latest",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4.5,
        "output": 22.5,
        "cacheRead": 0.45,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "accounts/fireworks/routers/kimi-k3-fast": {
      "id": "accounts/fireworks/routers/kimi-k3-fast",
      "name": "Kimi K3 Fast",
      "protocol": "openai-completions",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4.5,
        "output": 22.5,
        "cacheRead": 0.45,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "accounts/fireworks/routers/kimi-latest": {
      "id": "accounts/fireworks/routers/kimi-latest",
      "name": "Kimi Latest",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "accounts/fireworks/routers/minimax-latest": {
      "id": "accounts/fireworks/routers/minimax-latest",
      "name": "MiniMax Latest",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 512000,
      "maxTokens": 512000
    },
    "accounts/fireworks/routers/qwen-max-latest": {
      "id": "accounts/fireworks/routers/qwen-max-latest",
      "name": "Qwen Max Latest (Qwen3.8 Max)",
      "protocol": "anthropic-messages",
      "provider": "fireworks",
      "baseUrl": "https://api.fireworks.ai/inference",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    }
  },
  "github-copilot": {
    "claude-fable-5": {
      "id": "claude-fable-5",
      "name": "Claude Fable 5",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-fable-5.1": {
      "id": "claude-fable-5.1",
      "name": "Claude Fable 5.1",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 0.25,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-haiku-4.5": {
      "id": "claude-haiku-4.5",
      "name": "Claude Haiku 4.5 (latest)",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-haiku-5.5": {
      "id": "claude-haiku-5.5",
      "name": "Claude Haiku 5.5",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.5,
            "output": 2.5,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4.7": {
      "id": "claude-opus-4.7",
      "name": "Claude Opus 4.7",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 32000
    },
    "claude-opus-4.8": {
      "id": "claude-opus-4.8",
      "name": "Claude Opus 4.8",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "claude-opus-5": {
      "id": "claude-opus-5",
      "name": "Claude Opus 5",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "claude-opus-5.5": {
      "id": "claude-opus-5.5",
      "name": "Claude Opus 5.5",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-4.6": {
      "id": "claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 1000000,
      "maxTokens": 32000
    },
    "claude-sonnet-5": {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-5.5": {
      "id": "claude-sonnet-5.5",
      "name": "Claude Sonnet 5.5",
      "protocol": "anthropic-messages",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gemini-3.5-flash": {
      "id": "gemini-3.5-flash",
      "name": "Gemini 3.5 Flash",
      "protocol": "openai-completions",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 9,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "gemini-3.6-flash": {
      "id": "gemini-3.6-flash",
      "name": "Gemini 3.6 Flash",
      "protocol": "openai-completions",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "gemini-3.7-flash": {
      "id": "gemini-3.7-flash",
      "name": "Gemini 3.7 Flash",
      "protocol": "openai-completions",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "gemini-3.8-flash": {
      "id": "gemini-3.8-flash",
      "name": "Gemini 3.8 Flash",
      "protocol": "openai-completions",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "gpt-5-mini": {
      "id": "gpt-5-mini",
      "name": "GPT-5 Mini",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 264000,
      "maxTokens": 64000
    },
    "gpt-5.3-codex": {
      "id": "gpt-5.3-codex",
      "name": "GPT-5.3 Codex",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-5.4": {
      "id": "gpt-5.4",
      "name": "GPT-5.4",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 5,
            "output": 22.5,
            "cacheRead": 0.5,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-5.4-mini": {
      "id": "gpt-5.4-mini",
      "name": "GPT-5.4 mini",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.4-nano": {
      "id": "gpt-5.4-nano",
      "name": "GPT-5.4 nano",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.25,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.5": {
      "id": "gpt-5.5",
      "name": "GPT-5.5",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-5.6-luna": {
      "id": "gpt-5.6-luna",
      "name": "GPT-5.6 Luna",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 0.4,
            "output": 1.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.6-sol": {
      "id": "gpt-5.6-sol",
      "name": "GPT-5.6 Sol",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.4,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 8,
            "output": 30,
            "cacheRead": 0.8,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.6-terra": {
      "id": "gpt-5.6-terra",
      "name": "GPT-5.6 Terra",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6-astra": {
      "id": "gpt-6-astra",
      "name": "GPT-6 Astra",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 20,
            "output": 75,
            "cacheRead": 2,
            "cacheWrite": 25
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-6-luna": {
      "id": "gpt-6-luna",
      "name": "GPT-6 Luna",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-6-sol": {
      "id": "gpt-6-sol",
      "name": "GPT-6 Sol",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "gpt-6.1-sol": {
      "id": "gpt-6.1-sol",
      "name": "GPT-6.1 Sol",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.2,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "grok-4.5": {
      "id": "grok-4.5",
      "name": "Grok 4.5",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 128000
    },
    "grok-4.6": {
      "id": "grok-4.6",
      "name": "Grok 4.6",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 128000
    },
    "grok-4.7": {
      "id": "grok-4.7",
      "name": "Grok 4.7",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 128000
    },
    "kimi-k2.7-code": {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32000
    },
    "kimi-k3": {
      "id": "kimi-k3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mai-code-1-flash-picker": {
      "id": "mai-code-1-flash-picker",
      "name": "MAI-Code-1-Flash",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 128000
    },
    "mai-code-1.1-flash": {
      "id": "mai-code-1.1-flash",
      "name": "MAI-Code-1.1-Flash",
      "protocol": "openai-responses",
      "provider": "github-copilot",
      "baseUrl": "https://api.individual.githubcopilot.com",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 128000
    }
  },
  "groq": {
    "llama-3.1-8b-instant": {
      "id": "llama-3.1-8b-instant",
      "name": "Llama 3.1 8B",
      "protocol": "openai-completions",
      "provider": "groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.08,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "llama-3.3-70b-versatile": {
      "id": "llama-3.3-70b-versatile",
      "name": "Llama 3.3 70B",
      "protocol": "openai-completions",
      "provider": "groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.59,
        "output": 0.79,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "openai/gpt-oss-120b": {
      "id": "openai/gpt-oss-120b",
      "name": "GPT OSS 120B",
      "protocol": "openai-completions",
      "provider": "groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 65536
    },
    "openai/gpt-oss-20b": {
      "id": "openai/gpt-oss-20b",
      "name": "GPT OSS 20B",
      "protocol": "openai-completions",
      "provider": "groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.3,
        "cacheRead": 0.0375,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 65536
    },
    "openai/gpt-oss-safeguard-20b": {
      "id": "openai/gpt-oss-safeguard-20b",
      "name": "Safety GPT OSS 20B",
      "protocol": "openai-completions",
      "provider": "groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 65536
    },
    "qwen/qwen3.6-27b": {
      "id": "qwen/qwen3.6-27b",
      "name": "Qwen3.6 27B",
      "protocol": "openai-completions",
      "provider": "groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 3,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "qwen/qwen3.8-27b": {
      "id": "qwen/qwen3.8-27b",
      "name": "Qwen3.8 27B",
      "protocol": "openai-completions",
      "provider": "groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.8,
        "output": 4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131042,
      "maxTokens": 16384
    }
  },
  "huggingface": {
    "MiniMaxAI/MiniMax-M1-80k": {
      "id": "MiniMaxAI/MiniMax-M1-80k",
      "name": "MiniMax M1 80K",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.55,
        "output": 2.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 80000
    },
    "MiniMaxAI/MiniMax-M2": {
      "id": "MiniMaxAI/MiniMax-M2",
      "name": "MiniMax-M2",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "MiniMaxAI/MiniMax-M2.1": {
      "id": "MiniMaxAI/MiniMax-M2.1",
      "name": "MiniMax-M2.1",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "MiniMaxAI/MiniMax-M2.5": {
      "id": "MiniMaxAI/MiniMax-M2.5",
      "name": "MiniMax-M2.5",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "MiniMaxAI/MiniMax-M2.7": {
      "id": "MiniMaxAI/MiniMax-M2.7",
      "name": "MiniMax-M2.7",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "MiniMaxAI/MiniMax-M3": {
      "id": "MiniMaxAI/MiniMax-M3",
      "name": "MiniMax-M3",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 512000
    },
    "Qwen/Qwen2.5-Coder-32B-Instruct": {
      "id": "Qwen/Qwen2.5-Coder-32B-Instruct",
      "name": "Qwen2.5-Coder-32B-Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 8192
    },
    "Qwen/Qwen3-235B-A22B": {
      "id": "Qwen/Qwen3-235B-A22B",
      "name": "Qwen3 235B-A22B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.8,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 40960,
      "maxTokens": 16384
    },
    "Qwen/Qwen3-235B-A22B-Instruct-2507": {
      "id": "Qwen/Qwen3-235B-A22B-Instruct-2507",
      "name": "Qwen3 235B-A22B Instruct 2507",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.855,
        "output": 2.565,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 16384
    },
    "Qwen/Qwen3-235B-A22B-Thinking-2507": {
      "id": "Qwen/Qwen3-235B-A22B-Thinking-2507",
      "name": "Qwen3-235B-A22B-Thinking-2507",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "Qwen/Qwen3-30B-A3B": {
      "id": "Qwen/Qwen3-30B-A3B",
      "name": "Qwen3 30B A3B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.12,
        "output": 0.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 40960,
      "maxTokens": 16384
    },
    "Qwen/Qwen3-32B": {
      "id": "Qwen/Qwen3-32B",
      "name": "Qwen3 32B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.29,
        "output": 0.59,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "Qwen/Qwen3-Coder-30B-A3B-Instruct": {
      "id": "Qwen/Qwen3-Coder-30B-A3B-Instruct",
      "name": "Qwen3-Coder 30B-A3B Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.07,
        "output": 0.26,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3-Coder-480B-A35B-Instruct": {
      "id": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "name": "Qwen3-Coder-480B-A35B-Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2,
        "output": 2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 66536
    },
    "Qwen/Qwen3-Coder-Next": {
      "id": "Qwen/Qwen3-Coder-Next",
      "name": "Qwen3-Coder-Next",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3-Next-80B-A3B-Instruct": {
      "id": "Qwen/Qwen3-Next-80B-A3B-Instruct",
      "name": "Qwen3-Next-80B-A3B-Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 1,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 66536
    },
    "Qwen/Qwen3-Next-80B-A3B-Thinking": {
      "id": "Qwen/Qwen3-Next-80B-A3B-Thinking",
      "name": "Qwen3-Next-80B-A3B-Thinking",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "Qwen/Qwen3-VL-235B-A22B-Instruct": {
      "id": "Qwen/Qwen3-VL-235B-A22B-Instruct",
      "name": "Qwen3 VL 235B A22B Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "Qwen/Qwen3-VL-235B-A22B-Thinking": {
      "id": "Qwen/Qwen3-VL-235B-A22B-Thinking",
      "name": "Qwen3 VL 235B A22B Thinking",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.98,
        "output": 3.95,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "Qwen/Qwen3-VL-30B-A3B-Instruct": {
      "id": "Qwen/Qwen3-VL-30B-A3B-Instruct",
      "name": "Qwen3 VL 30B A3B Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.7,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "Qwen/Qwen3.5-122B-A10B": {
      "id": "Qwen/Qwen3.5-122B-A10B",
      "name": "Qwen3.5 122B-A10B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 3.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3.5-27B": {
      "id": "Qwen/Qwen3.5-27B",
      "name": "Qwen3.5 27B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 2.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3.5-35B-A3B": {
      "id": "Qwen/Qwen3.5-35B-A3B",
      "name": "Qwen3.5 35B-A3B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3.5-397B-A17B": {
      "id": "Qwen/Qwen3.5-397B-A17B",
      "name": "Qwen3.5-397B-A17B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 3.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "Qwen/Qwen3.5-9B": {
      "id": "Qwen/Qwen3.5-9B",
      "name": "Qwen3.5 9B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.17,
        "output": 0.25,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3.6-27B": {
      "id": "Qwen/Qwen3.6-27B",
      "name": "Qwen3.6 27B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.47,
        "output": 3.19,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3.6-35B-A3B": {
      "id": "Qwen/Qwen3.6-35B-A3B",
      "name": "Qwen3.6 35B-A3B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.95,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3.8-2.4T-A95B": {
      "id": "Qwen/Qwen3.8-2.4T-A95B",
      "name": "Qwen3.8 2.4T A95B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.5,
        "output": 6.25,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "Qwen/Qwen3.8-27B": {
      "id": "Qwen/Qwen3.8-27B",
      "name": "Qwen3.8 27B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "XiaomiMiMo/MiMo-V2-Flash": {
      "id": "XiaomiMiMo/MiMo-V2-Flash",
      "name": "MiMo-V2-Flash",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 4096
    },
    "XiaomiMiMo/MiMo-V2.5": {
      "id": "XiaomiMiMo/MiMo-V2.5",
      "name": "MiMo-V2.5",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.4,
        "output": 2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "XiaomiMiMo/MiMo-V2.5-Pro": {
      "id": "XiaomiMiMo/MiMo-V2.5-Pro",
      "name": "MiMo-V2.5-Pro",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "deepseek-ai/DeepSeek-R1": {
      "id": "deepseek-ai/DeepSeek-R1",
      "name": "DeepSeek-R1",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.7,
        "output": 2.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 64000,
      "maxTokens": 32768
    },
    "deepseek-ai/DeepSeek-R1-0528": {
      "id": "deepseek-ai/DeepSeek-R1-0528",
      "name": "DeepSeek-R1-0528",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 3,
        "output": 5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 163840
    },
    "deepseek-ai/DeepSeek-V3": {
      "id": "deepseek-ai/DeepSeek-V3",
      "name": "DeepSeek-V3",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.4,
        "output": 1.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 64000,
      "maxTokens": 8192
    },
    "deepseek-ai/DeepSeek-V3-0324": {
      "id": "deepseek-ai/DeepSeek-V3-0324",
      "name": "DeepSeek V3 0324",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.27,
        "output": 1.12,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 163840
    },
    "deepseek-ai/DeepSeek-V3.1": {
      "id": "deepseek-ai/DeepSeek-V3.1",
      "name": "DeepSeek-V3.1",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.27,
        "output": 1,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 8192
    },
    "deepseek-ai/DeepSeek-V3.2": {
      "id": "deepseek-ai/DeepSeek-V3.2",
      "name": "DeepSeek-V3.2",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.28,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 65536
    },
    "deepseek-ai/DeepSeek-V4-Flash": {
      "id": "deepseek-ai/DeepSeek-V4-Flash",
      "name": "DeepSeek V4 Flash",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 384000
    },
    "deepseek-ai/DeepSeek-V4-Flash-0731": {
      "id": "deepseek-ai/DeepSeek-V4-Flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 384000
    },
    "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp": {
      "id": "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp",
      "name": "DeepSeek V4 Flash Vision Exp",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.44,
        "output": 1.32,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 384000
    },
    "deepseek-ai/DeepSeek-V4-Pro": {
      "id": "deepseek-ai/DeepSeek-V4-Pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.003625,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 393216
    },
    "deepseek-ai/DeepSeek-V4-Pro-0813": {
      "id": "deepseek-ai/DeepSeek-V4-Pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.32,
        "output": 3.96,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-ai/DeepSeek-V4.1-Flash": {
      "id": "deepseek-ai/DeepSeek-V4.1-Flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 384000
    },
    "google/gemma-3-12b-it": {
      "id": "google/gemma-3-12b-it",
      "name": "Gemma 3 12B IT",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "google/gemma-3-27b-it": {
      "id": "google/gemma-3-27b-it",
      "name": "Gemma 3 27B IT",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.08,
        "output": 0.16,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "google/gemma-3-4b-it": {
      "id": "google/gemma-3-4b-it",
      "name": "Gemma 3 4B IT",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.1,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "google/gemma-4-26B-A4B-it": {
      "id": "google/gemma-4-26B-A4B-it",
      "name": "Gemma 4 26B A4B IT",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.13,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "google/gemma-4-31B-it": {
      "id": "google/gemma-4-31B-it",
      "name": "Gemma 4 31B IT",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "meta-llama/Llama-3.1-8B-Instruct": {
      "id": "meta-llama/Llama-3.1-8B-Instruct",
      "name": "Llama-3.1-8B-Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.06,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 4096
    },
    "meta-llama/Llama-3.3-70B-Instruct": {
      "id": "meta-llama/Llama-3.3-70B-Instruct",
      "name": "Llama-3.3-70B-Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.59,
        "output": 0.79,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 4096
    },
    "moonshotai/Kimi-K2-Instruct": {
      "id": "moonshotai/Kimi-K2-Instruct",
      "name": "Kimi-K2-Instruct",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "moonshotai/Kimi-K2-Instruct-0905": {
      "id": "moonshotai/Kimi-K2-Instruct-0905",
      "name": "Kimi-K2-Instruct-0905",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 16384
    },
    "moonshotai/Kimi-K2-Thinking": {
      "id": "moonshotai/Kimi-K2-Thinking",
      "name": "Kimi-K2-Thinking",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.5,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "moonshotai/Kimi-K2.5": {
      "id": "moonshotai/Kimi-K2.5",
      "name": "Kimi-K2.5",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 3,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "moonshotai/Kimi-K2.6": {
      "id": "moonshotai/Kimi-K2.6",
      "name": "Kimi-K2.6",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "moonshotai/Kimi-K2.7-Code": {
      "id": "moonshotai/Kimi-K2.7-Code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "moonshotai/Kimi-K3": {
      "id": "moonshotai/Kimi-K3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "openai/gpt-oss-120b": {
      "id": "openai/gpt-oss-120b",
      "name": "GPT OSS 120B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.69,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "openai/gpt-oss-20b": {
      "id": "openai/gpt-oss-20b",
      "name": "GPT OSS 20B",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "stepfun-ai/Step-3.5-Flash": {
      "id": "stepfun-ai/Step-3.5-Flash",
      "name": "Step 3.5 Flash",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "stepfun-ai/Step-3.7-Flash": {
      "id": "stepfun-ai/Step-3.7-Flash",
      "name": "Step 3.7 Flash",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "tencent/Hy3": {
      "id": "tencent/Hy3",
      "name": "Hy3",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.58,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 128000
    },
    "tencent/Hy4-preview": {
      "id": "tencent/Hy4-preview",
      "name": "Hy4 preview",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.834,
        "output": 2.501,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "thinkingmachines/Inkling": {
      "id": "thinkingmachines/Inkling",
      "name": "Inkling",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 4.05,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "thinkingmachines/Inkling-Small": {
      "id": "thinkingmachines/Inkling-Small",
      "name": "Inkling Small",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 1048576
    },
    "zai-org/GLM-4.5": {
      "id": "zai-org/GLM-4.5",
      "name": "GLM-4.5",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 98304
    },
    "zai-org/GLM-4.5-Air": {
      "id": "zai-org/GLM-4.5-Air",
      "name": "GLM-4.5-Air",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.13,
        "output": 0.85,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 98304
    },
    "zai-org/GLM-4.5V": {
      "id": "zai-org/GLM-4.5V",
      "name": "GLM-4.5V",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 1.8,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 65536,
      "maxTokens": 16384
    },
    "zai-org/GLM-4.6": {
      "id": "zai-org/GLM-4.6",
      "name": "GLM-4.6",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.55,
        "output": 2.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "zai-org/GLM-4.6V-Flash": {
      "id": "zai-org/GLM-4.6V-Flash",
      "name": "GLM-4.6V-Flash",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 0.9,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "zai-org/GLM-4.7": {
      "id": "zai-org/GLM-4.7",
      "name": "GLM-4.7",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "zai-org/GLM-4.7-Flash": {
      "id": "zai-org/GLM-4.7-Flash",
      "name": "GLM-4.7-Flash",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 128000
    },
    "zai-org/GLM-5": {
      "id": "zai-org/GLM-5",
      "name": "GLM-5",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 3.2,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 131072
    },
    "zai-org/GLM-5.1": {
      "id": "zai-org/GLM-5.1",
      "name": "GLM-5.1",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 3.2,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 131072
    },
    "zai-org/GLM-5.2": {
      "id": "zai-org/GLM-5.2",
      "name": "GLM-5.2",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "zai-org/GLM-5.3": {
      "id": "zai-org/GLM-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "zai-org/GLM-5.3-Flash": {
      "id": "zai-org/GLM-5.3-Flash",
      "name": "GLM-5.3-Flash",
      "protocol": "openai-completions",
      "provider": "huggingface",
      "baseUrl": "https://router.huggingface.co/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    }
  },
  "kimi-coding": {
    "k3": {
      "id": "k3",
      "name": "Kimi K3",
      "protocol": "anthropic-messages",
      "provider": "kimi-coding",
      "baseUrl": "https://api.kimi.com/coding",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "k3-256k": {
      "id": "k3-256k",
      "name": "Kimi K3-256K",
      "protocol": "anthropic-messages",
      "provider": "kimi-coding",
      "baseUrl": "https://api.kimi.com/coding",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "kimi-for-coding": {
      "id": "kimi-for-coding",
      "name": "kimi-for-coding",
      "protocol": "anthropic-messages",
      "provider": "kimi-coding",
      "baseUrl": "https://api.kimi.com/coding",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 32768
    },
    "kimi-for-coding-highspeed": {
      "id": "kimi-for-coding-highspeed",
      "name": "Kimi For Coding HighSpeed",
      "protocol": "anthropic-messages",
      "provider": "kimi-coding",
      "baseUrl": "https://api.kimi.com/coding",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.9,
        "output": 8,
        "cacheRead": 0.38,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    }
  },
  "meta": {
    "muse-spark-1.1": {
      "id": "muse-spark-1.1",
      "name": "Muse Spark 1.1",
      "protocol": "openai-responses",
      "provider": "meta",
      "baseUrl": "https://api.meta.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "muse-spark-1.2": {
      "id": "muse-spark-1.2",
      "name": "Muse Spark 1.2",
      "protocol": "openai-responses",
      "provider": "meta",
      "baseUrl": "https://api.meta.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "muse-spark-1.2-contributor": {
      "id": "muse-spark-1.2-contributor",
      "name": "Muse Spark 1.2 Contributor",
      "protocol": "openai-responses",
      "provider": "meta",
      "baseUrl": "https://api.meta.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0.002,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "muse-spark-1.3": {
      "id": "muse-spark-1.3",
      "name": "Muse Spark 1.3",
      "protocol": "openai-responses",
      "provider": "meta",
      "baseUrl": "https://api.meta.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "muse-spark-1.3-contributor": {
      "id": "muse-spark-1.3-contributor",
      "name": "Muse Spark 1.3 Contributor",
      "protocol": "openai-responses",
      "provider": "meta",
      "baseUrl": "https://api.meta.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0.002,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "muse-wonder-1.0": {
      "id": "muse-wonder-1.0",
      "name": "Muse Wonder",
      "protocol": "openai-responses",
      "provider": "meta",
      "baseUrl": "https://api.meta.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    }
  },
  "minimax": {
    "MiniMax-M2.7": {
      "id": "MiniMax-M2.7",
      "name": "MiniMax-M2.7",
      "protocol": "anthropic-messages",
      "provider": "minimax",
      "baseUrl": "https://api.minimax.io/anthropic",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "MiniMax-M2.7-highspeed": {
      "id": "MiniMax-M2.7-highspeed",
      "name": "MiniMax-M2.7-highspeed",
      "protocol": "anthropic-messages",
      "provider": "minimax",
      "baseUrl": "https://api.minimax.io/anthropic",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.06,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "MiniMax-M3": {
      "id": "MiniMax-M3",
      "name": "MiniMax-M3",
      "protocol": "anthropic-messages",
      "provider": "minimax",
      "baseUrl": "https://api.minimax.io/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 512000,
            "input": 0.6,
            "output": 2.4,
            "cacheRead": 0.12,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 512000
    }
  },
  "minimax-cn": {
    "MiniMax-M2.7": {
      "id": "MiniMax-M2.7",
      "name": "MiniMax-M2.7",
      "protocol": "anthropic-messages",
      "provider": "minimax-cn",
      "baseUrl": "https://api.minimaxi.com/anthropic",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "MiniMax-M2.7-highspeed": {
      "id": "MiniMax-M2.7-highspeed",
      "name": "MiniMax-M2.7-highspeed",
      "protocol": "anthropic-messages",
      "provider": "minimax-cn",
      "baseUrl": "https://api.minimaxi.com/anthropic",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.06,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "MiniMax-M3": {
      "id": "MiniMax-M3",
      "name": "MiniMax-M3",
      "protocol": "anthropic-messages",
      "provider": "minimax-cn",
      "baseUrl": "https://api.minimaxi.com/anthropic",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 512000,
            "input": 0.6,
            "output": 2.4,
            "cacheRead": 0.12,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 512000
    }
  },
  "moonshotai": {
    "kimi-k2.6": {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "moonshotai",
      "baseUrl": "https://api.moonshot.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k2.7-code": {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "moonshotai",
      "baseUrl": "https://api.moonshot.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k2.7-code-highspeed": {
      "id": "kimi-k2.7-code-highspeed",
      "name": "Kimi K2.7 Code HighSpeed",
      "protocol": "openai-completions",
      "provider": "moonshotai",
      "baseUrl": "https://api.moonshot.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.9,
        "output": 8,
        "cacheRead": 0.38,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k3": {
      "id": "kimi-k3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "moonshotai",
      "baseUrl": "https://api.moonshot.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    }
  },
  "moonshotai-cn": {
    "kimi-k2.6": {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "moonshotai-cn",
      "baseUrl": "https://api.moonshot.cn/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k2.7-code": {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "moonshotai-cn",
      "baseUrl": "https://api.moonshot.cn/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k2.7-code-highspeed": {
      "id": "kimi-k2.7-code-highspeed",
      "name": "Kimi K2.7 Code HighSpeed",
      "protocol": "openai-completions",
      "provider": "moonshotai-cn",
      "baseUrl": "https://api.moonshot.cn/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.9,
        "output": 8,
        "cacheRead": 0.38,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k3": {
      "id": "kimi-k3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "moonshotai-cn",
      "baseUrl": "https://api.moonshot.cn/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    }
  },
  "nvidia": {
    "deepseek-ai/deepseek-v4.1-flash": {
      "id": "deepseek-ai/deepseek-v4.1-flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "google/diffusiongemma-26b-a4b-it": {
      "id": "google/diffusiongemma-26b-a4b-it",
      "name": "DiffusionGemma 26B A4B IT",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 250000,
      "maxTokens": 32768
    },
    "google/gemma-3-12b-it": {
      "id": "google/gemma-3-12b-it",
      "name": "Gemma 3 12B IT",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "google/gemma-3-4b-it": {
      "id": "google/gemma-3-4b-it",
      "name": "Gemma 3 4B IT",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "meta/llama-3.2-11b-vision-instruct": {
      "id": "meta/llama-3.2-11b-vision-instruct",
      "name": "Llama 3.2 11b Vision Instruct",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "meta/llama-3.2-90b-vision-instruct": {
      "id": "meta/llama-3.2-90b-vision-instruct",
      "name": "Llama-3.2-90B-Vision-Instruct",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "meta/muse-glimmer-30b": {
      "id": "meta/muse-glimmer-30b",
      "name": "Muse Glimmer 30B",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "mistralai/mistral-7b-instruct-v0.3": {
      "id": "mistralai/mistral-7b-instruct-v0.3",
      "name": "Mistral-7B-Instruct-v0.3",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 65536,
      "maxTokens": 65536
    },
    "moonshotai/kimi-k2.6": {
      "id": "moonshotai/kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "moonshotai/kimi-k3": {
      "id": "moonshotai/kimi-k3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "nvidia/cosmos-reason2-8b": {
      "id": "nvidia/cosmos-reason2-8b",
      "name": "Cosmos Reason2 8B",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "nvidia/llama-3.1-nemotron-70b-instruct": {
      "id": "nvidia/llama-3.1-nemotron-70b-instruct",
      "name": "Llama 3.1 Nemotron 70B Instruct",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
      "id": "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      "name": "Llama 3.1 Nemotron Ultra 253B",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
      "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      "name": "Nemotron 3 Nano Omni",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 65536
    },
    "nvidia/nemotron-3-super-120b-a12b": {
      "id": "nvidia/nemotron-3-super-120b-a12b",
      "name": "Nemotron 3 Super",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.8,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "nvidia/nemotron-3-ultra-550b-a55b": {
      "id": "nvidia/nemotron-3-ultra-550b-a55b",
      "name": "Nemotron 3 Ultra 550B A55B",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 2.5,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "nvidia/nemotron-3.5-lightning-30b-a3b": {
      "id": "nvidia/nemotron-3.5-lightning-30b-a3b",
      "name": "Nemotron 3.5 Lightning 30B A3B",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "openai/gpt-oss-20b": {
      "id": "openai/gpt-oss-20b",
      "name": "GPT OSS 20B",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "poolside/laguna-xs-2.1": {
      "id": "poolside/laguna-xs-2.1",
      "name": "Laguna XS 2.1",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 16384
    },
    "z-ai/glm-5.3": {
      "id": "z-ai/glm-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "z-ai/glm-5.3-flash": {
      "id": "z-ai/glm-5.3-flash",
      "name": "GLM-5.3-Flash",
      "protocol": "openai-completions",
      "provider": "nvidia",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    }
  },
  "openai": {
    "gpt-4": {
      "id": "gpt-4",
      "name": "GPT-4",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 30,
        "output": 60,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 8192,
      "maxTokens": 8192
    },
    "gpt-4-turbo": {
      "id": "gpt-4-turbo",
      "name": "GPT-4 Turbo",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 30,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "gpt-4.1": {
      "id": "gpt-4.1",
      "name": "GPT-4.1",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "gpt-4.1-mini": {
      "id": "gpt-4.1-mini",
      "name": "GPT-4.1 mini",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 1.6,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "gpt-4.1-nano": {
      "id": "gpt-4.1-nano",
      "name": "GPT-4.1 nano",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "gpt-4o": {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 1.25,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-4o-2024-05-13": {
      "id": "gpt-4o-2024-05-13",
      "name": "GPT-4o (2024-05-13)",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "gpt-4o-2024-08-06": {
      "id": "gpt-4o-2024-08-06",
      "name": "GPT-4o (2024-08-06)",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 1.25,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-4o-2024-11-20": {
      "id": "gpt-4o-2024-11-20",
      "name": "GPT-4o (2024-11-20)",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 1.25,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-4o-mini": {
      "id": "gpt-4o-mini",
      "name": "GPT-4o mini",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-5": {
      "id": "gpt-5",
      "name": "GPT-5",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5-chat-latest": {
      "id": "gpt-5-chat-latest",
      "name": "GPT-5 Chat Latest",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-5-mini": {
      "id": "gpt-5-mini",
      "name": "GPT-5 Mini",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5-nano": {
      "id": "gpt-5-nano",
      "name": "GPT-5 Nano",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.4,
        "cacheRead": 0.005,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5-pro": {
      "id": "gpt-5-pro",
      "name": "GPT-5 Pro",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 120,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.1": {
      "id": "gpt-5.1",
      "name": "GPT-5.1",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.2": {
      "id": "gpt-5.2",
      "name": "GPT-5.2",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.2-chat-latest": {
      "id": "gpt-5.2-chat-latest",
      "name": "GPT-5.2 Chat",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-5.2-pro": {
      "id": "gpt-5.2-pro",
      "name": "GPT-5.2 Pro",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 21,
        "output": 168,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.3-chat-latest": {
      "id": "gpt-5.3-chat-latest",
      "name": "GPT-5.3 Chat (latest)",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "gpt-5.3-codex": {
      "id": "gpt-5.3-codex",
      "name": "GPT-5.3 Codex",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.3-codex-spark": {
      "id": "gpt-5.3-codex-spark",
      "name": "GPT-5.3 Codex Spark",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 32000
    },
    "gpt-5.4": {
      "id": "gpt-5.4",
      "name": "GPT-5.4",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 5,
            "output": 22.5,
            "cacheRead": 0.5,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-5.4-mini": {
      "id": "gpt-5.4-mini",
      "name": "GPT-5.4 mini",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.4-nano": {
      "id": "gpt-5.4-nano",
      "name": "GPT-5.4 nano",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.25,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.4-pro": {
      "id": "gpt-5.4-pro",
      "name": "GPT-5.4 Pro",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 60,
            "output": 270,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.5": {
      "id": "gpt-5.5",
      "name": "GPT-5.5",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-5.5-pro": {
      "id": "gpt-5.5-pro",
      "name": "GPT-5.5 Pro",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 60,
            "output": 270,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.6-luna": {
      "id": "gpt-5.6-luna",
      "name": "GPT-5.6 Luna",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.4,
            "output": 1.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-5.6-sol": {
      "id": "gpt-5.6-sol",
      "name": "GPT-5.6 Sol",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.4,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 8,
            "output": 30,
            "cacheRead": 0.8,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-5.6-terra": {
      "id": "gpt-5.6-terra",
      "name": "GPT-5.6 Terra",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-6-astra": {
      "id": "gpt-6-astra",
      "name": "GPT-6 Astra",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 20,
            "output": 75,
            "cacheRead": 2,
            "cacheWrite": 25
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-6-luna": {
      "id": "gpt-6-luna",
      "name": "GPT-6 Luna",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-6-sol": {
      "id": "gpt-6-sol",
      "name": "GPT-6 Sol",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-6.1-sol": {
      "id": "gpt-6.1-sol",
      "name": "GPT-6.1 Sol",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.2,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-daybreak-blue-latest": {
      "id": "gpt-daybreak-blue-latest",
      "name": "Daybreak Blue",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.4,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 8,
            "output": 30,
            "cacheRead": 0.8,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-daybreak-red-latest": {
      "id": "gpt-daybreak-red-latest",
      "name": "Daybreak Red",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 12.5,
        "output": 75,
        "cacheRead": 1.25,
        "cacheWrite": 15.625
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-realtime-2.1": {
      "id": "gpt-realtime-2.1",
      "name": "GPT-Realtime-2.1",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 24,
        "cacheRead": 0.4,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 32000
    },
    "o1": {
      "id": "o1",
      "name": "o1",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 60,
        "cacheRead": 7.5,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "o1-pro": {
      "id": "o1-pro",
      "name": "o1-pro",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 150,
        "output": 600,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "o3": {
      "id": "o3",
      "name": "o3",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "o3-mini": {
      "id": "o3-mini",
      "name": "o3-mini",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.55,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "o3-pro": {
      "id": "o3-pro",
      "name": "o3-pro",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 20,
        "output": 80,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "o4-mini": {
      "id": "o4-mini",
      "name": "o4-mini",
      "protocol": "openai-responses",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.275,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    }
  },
  "opencode": {
    "big-pickle": {
      "id": "big-pickle",
      "name": "Big Pickle",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 32000
    },
    "claude-fable-5": {
      "id": "claude-fable-5",
      "name": "Claude Fable 5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-fable-5-1": {
      "id": "claude-fable-5-1",
      "name": "Claude Fable 5.1",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 0.25,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-haiku-4-5": {
      "id": "claude-haiku-4-5",
      "name": "Claude Haiku 4.5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-haiku-5-5": {
      "id": "claude-haiku-5-5",
      "name": "Claude Haiku 5.5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.5,
            "output": 2.5,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-5": {
      "id": "claude-opus-4-5",
      "name": "Claude Opus 4.5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-opus-4-6": {
      "id": "claude-opus-4-6",
      "name": "Claude Opus 4.6",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-7": {
      "id": "claude-opus-4-7",
      "name": "Claude Opus 4.7",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-4-8": {
      "id": "claude-opus-4-8",
      "name": "Claude Opus 4.8",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-5": {
      "id": "claude-opus-5",
      "name": "Claude Opus 5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-opus-5-5": {
      "id": "claude-opus-5-5",
      "name": "Claude Opus 5.5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-4": {
      "id": "claude-sonnet-4",
      "name": "Claude Sonnet 4",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 6,
            "output": 22.5,
            "cacheRead": 0.6,
            "cacheWrite": 7.5
          }
        ]
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-sonnet-4-5": {
      "id": "claude-sonnet-4-5",
      "name": "Claude Sonnet 4.5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 6,
            "output": 22.5,
            "cacheRead": 0.6,
            "cacheWrite": 7.5
          }
        ]
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "claude-sonnet-4-6": {
      "id": "claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "claude-sonnet-5": {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "claude-sonnet-5-5": {
      "id": "claude-sonnet-5-5",
      "name": "Claude Sonnet 5.5",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "deepseek-v4-flash": {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.028,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-flash-vision-exp": {
      "id": "deepseek-v4-flash-vision-exp",
      "name": "DeepSeek V4 Flash Vision Exp",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.028,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro": {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.74,
        "output": 3.84,
        "cacheRead": 0.145,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4.1-flash": {
      "id": "deepseek-v4.1-flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.006,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "exo-free": {
      "id": "exo-free",
      "name": "Exo Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "glm-5": {
      "id": "glm-5",
      "name": "GLM-5",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 3.2,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "glm-5.1": {
      "id": "glm-5.1",
      "name": "GLM-5.1",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "glm-5.2": {
      "id": "glm-5.2",
      "name": "GLM-5.2",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3": {
      "id": "glm-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3-flash": {
      "id": "glm-5.3-flash",
      "name": "GLM-5.3-Flash",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "gpt-5": {
      "id": "gpt-5",
      "name": "GPT-5",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.07,
        "output": 8.5,
        "cacheRead": 0.107,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5-codex": {
      "id": "gpt-5-codex",
      "name": "GPT-5 Codex",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.07,
        "output": 8.5,
        "cacheRead": 0.107,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5-nano": {
      "id": "gpt-5-nano",
      "name": "GPT-5 Nano",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.4,
        "cacheRead": 0.005,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.1": {
      "id": "gpt-5.1",
      "name": "GPT-5.1",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.07,
        "output": 8.5,
        "cacheRead": 0.107,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.1-codex": {
      "id": "gpt-5.1-codex",
      "name": "GPT-5.1 Codex",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.07,
        "output": 8.5,
        "cacheRead": 0.107,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.1-codex-max": {
      "id": "gpt-5.1-codex-max",
      "name": "GPT-5.1 Codex Max",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.1-codex-mini": {
      "id": "gpt-5.1-codex-mini",
      "name": "GPT-5.1 Codex Mini",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.2": {
      "id": "gpt-5.2",
      "name": "GPT-5.2",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.2-codex": {
      "id": "gpt-5.2-codex",
      "name": "GPT-5.2 Codex",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.3-codex": {
      "id": "gpt-5.3-codex",
      "name": "GPT-5.3 Codex",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.4": {
      "id": "gpt-5.4",
      "name": "GPT-5.4",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 5,
            "output": 22.5,
            "cacheRead": 0.5,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 272000,
      "maxTokens": 128000
    },
    "gpt-5.4-mini": {
      "id": "gpt-5.4-mini",
      "name": "GPT-5.4 Mini",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.4-nano": {
      "id": "gpt-5.4-nano",
      "name": "GPT-5.4 Nano",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.25,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "gpt-5.4-pro": {
      "id": "gpt-5.4-pro",
      "name": "GPT-5.4 Pro",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 30,
        "cacheWrite": 0
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.5": {
      "id": "gpt-5.5",
      "name": "GPT-5.5",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.5-pro": {
      "id": "gpt-5.5-pro",
      "name": "GPT-5.5 Pro",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 30,
        "cacheWrite": 0
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.6-luna": {
      "id": "gpt-5.6-luna",
      "name": "GPT-5.6 Luna",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.4,
            "output": 1.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.6-sol": {
      "id": "gpt-5.6-sol",
      "name": "GPT-5.6 Sol",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.4,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 8,
            "output": 30,
            "cacheRead": 0.8,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-5.6-terra": {
      "id": "gpt-5.6-terra",
      "name": "GPT-5.6 Terra",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 3.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 5,
            "output": 22.5,
            "cacheRead": 0.5,
            "cacheWrite": 6.25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6-astra": {
      "id": "gpt-6-astra",
      "name": "GPT-6 Astra",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 20,
            "output": 75,
            "cacheRead": 2,
            "cacheWrite": 25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6-luna": {
      "id": "gpt-6-luna",
      "name": "GPT-6 Luna",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6-sol": {
      "id": "gpt-6-sol",
      "name": "GPT-6 Sol",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6.1-sol": {
      "id": "gpt-6.1-sol",
      "name": "GPT-6.1 Sol",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.2,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "grok-4.5": {
      "id": "grok-4.5",
      "name": "Grok 4.5",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.3,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 0.6,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "grok-4.6": {
      "id": "grok-4.6",
      "name": "Grok 4.6",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "grok-4.7": {
      "id": "grok-4.7",
      "name": "Grok 4.7",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "grok-build-0.1": {
      "id": "grok-build-0.1",
      "name": "Grok Build 0.1",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 2,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "kimi-k2.5": {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 3,
        "cacheRead": 0.08,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "kimi-k2.6": {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "kimi-k2.7-code": {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k3": {
      "id": "kimi-k3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "ling-3.0-flash-fin-free": {
      "id": "ling-3.0-flash-fin-free",
      "name": "Ling 3.0 Flash Fin Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "ling-3.1-flash-free": {
      "id": "ling-3.1-flash-free",
      "name": "Ling 3.1 Flash Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "longcat-2.5-preview-free": {
      "id": "longcat-2.5-preview-free",
      "name": "LongCat 2.5 Preview Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "mimo-v2.6-flash-free": {
      "id": "mimo-v2.6-flash-free",
      "name": "MiMo-V2.6-Flash Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 32000
    },
    "minimax-m2.5": {
      "id": "minimax-m2.5",
      "name": "MiniMax-M2.5",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "minimax-m2.7": {
      "id": "minimax-m2.7",
      "name": "MiniMax-M2.7",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "minimax-m3": {
      "id": "minimax-m3",
      "name": "MiniMax-M3",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 512000,
      "maxTokens": 128000
    },
    "mistral-large-4": {
      "id": "mistral-large-4",
      "name": "Mistral Large 4",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.68,
        "output": 2.09,
        "cacheRead": 0.07,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 262144
    },
    "muse-spark-1.2": {
      "id": "muse-spark-1.2",
      "name": "Muse Spark 1.2",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "muse-spark-1.3": {
      "id": "muse-spark-1.3",
      "name": "Muse Spark 1.3",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "muse-spark-1.3-contributor-free": {
      "id": "muse-spark-1.3-contributor-free",
      "name": "Muse Spark 1.3 Free",
      "protocol": "openai-responses",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "nemotron-3-ultra-free": {
      "id": "nemotron-3-ultra-free",
      "name": "Nemotron 3 Ultra Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "nemotron-3.5-lightning-free": {
      "id": "nemotron-3.5-lightning-free",
      "name": "Nemotron 3.5 Lightning Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "qwen3.5-plus": {
      "id": "qwen3.5-plus",
      "name": "Qwen3.5 Plus",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "qwen3.6-plus": {
      "id": "qwen3.6-plus",
      "name": "Qwen3.6 Plus",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 3,
        "cacheRead": 0.05,
        "cacheWrite": 0.625
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "qwen3.8-flash": {
      "id": "qwen3.8-flash",
      "name": "Qwen3.8 Flash",
      "protocol": "anthropic-messages",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.47,
        "cacheRead": 0.016,
        "cacheWrite": 0.2
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.8-max": {
      "id": "qwen3.8-max",
      "name": "Qwen3.8 Max",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 2.5
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "space-bunny-free": {
      "id": "space-bunny-free",
      "name": "Space Bunny Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 524288
    },
    "step-5-preview-free": {
      "id": "step-5-preview-free",
      "name": "Step 5 Preview Free",
      "protocol": "openai-completions",
      "provider": "opencode",
      "baseUrl": "https://opencode.ai/zen/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    }
  },
  "opencode-go": {
    "claude-haiku-5-5": {
      "id": "claude-haiku-5-5",
      "name": "Claude Haiku 5.5",
      "protocol": "anthropic-messages",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.5,
            "output": 2.5,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "deepseek-v4-flash": {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.003,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-flash-vision-exp": {
      "id": "deepseek-v4-flash-vision-exp",
      "name": "DeepSeek V4 Flash Vision Exp",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.003,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro": {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro (New)",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.66,
        "output": 1.98,
        "cacheRead": 0.022,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4.1-flash": {
      "id": "deepseek-v4.1-flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.003,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "glm-5.2": {
      "id": "glm-5.2",
      "name": "GLM-5.2",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3": {
      "id": "glm-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3-flash": {
      "id": "glm-5.3-flash",
      "name": "GLM-5.3-Flash",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "gpt-5.6-luna": {
      "id": "gpt-5.6-luna",
      "name": "GPT-5.6 Luna",
      "protocol": "openai-responses",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.4,
            "output": 1.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "gpt-6-luna": {
      "id": "gpt-6-luna",
      "name": "GPT-6 Luna",
      "protocol": "openai-responses",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "grok-4.6": {
      "id": "grok-4.6",
      "name": "Grok 4.6",
      "protocol": "openai-responses",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "grok-4.7": {
      "id": "grok-4.7",
      "name": "Grok 4.7",
      "protocol": "openai-responses",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "hy3": {
      "id": "hy3",
      "name": "Hy3",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.58,
        "cacheRead": 0.035,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 128000
    },
    "hy4-preview": {
      "id": "hy4-preview",
      "name": "Hy4 preview",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.834,
        "output": 2.501,
        "cacheRead": 0.042,
        "cacheWrite": 0
      },
      "contextWindow": 1024000,
      "maxTokens": 64000
    },
    "kimi-k2.7-code": {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k3": {
      "id": "kimi-k3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "longcat-2.0": {
      "id": "longcat-2.0",
      "name": "LongCat-2.0",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.006,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "longcat-2.5-preview-free": {
      "id": "longcat-2.5-preview-free",
      "name": "LongCat 2.5 Preview Free",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "mimo-v2.5": {
      "id": "mimo-v2.5",
      "name": "MiMo V2.5",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.0028,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "mimo-v2.5-pro": {
      "id": "mimo-v2.5-pro",
      "name": "MiMo V2.5 Pro",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.003625,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 128000
    },
    "mimo-v2.6-flash": {
      "id": "mimo-v2.6-flash",
      "name": "MiMo-V2.6-Flash",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.0028,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-pro": {
      "id": "mimo-v2.6-pro",
      "name": "MiMo-V2.6-Pro",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.003625,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "minimax-m2.7": {
      "id": "minimax-m2.7",
      "name": "MiniMax-M2.7",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "minimax-m3": {
      "id": "minimax-m3",
      "name": "MiniMax-M3",
      "protocol": "anthropic-messages",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 512000,
            "input": 0.6,
            "output": 2.4,
            "cacheRead": 0.12,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "muse-spark-1.2-contributor": {
      "id": "muse-spark-1.2-contributor",
      "name": "Muse Spark 1.2 Contributor",
      "protocol": "openai-responses",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0.002,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "muse-spark-1.3-contributor": {
      "id": "muse-spark-1.3-contributor",
      "name": "Muse Spark 1.3 Contributor",
      "protocol": "openai-responses",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0.002,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "qwen3.7-plus": {
      "id": "qwen3.7-plus",
      "name": "Qwen3.7 Plus",
      "protocol": "anthropic-messages",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 1.6,
        "cacheRead": 0.04,
        "cacheWrite": 0.5,
        "tiers": [
          {
            "inputTokensAbove": 256000,
            "input": 1.2,
            "output": 4.8,
            "cacheRead": 0.12,
            "cacheWrite": 1.5
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.8-flash": {
      "id": "qwen3.8-flash",
      "name": "Qwen3.8 Flash",
      "protocol": "anthropic-messages",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.47,
        "cacheRead": 0.016,
        "cacheWrite": 0.2
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.8-max": {
      "id": "qwen3.8-max",
      "name": "Qwen3.8 Max",
      "protocol": "anthropic-messages",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "space-bunny": {
      "id": "space-bunny",
      "name": "Space Bunny",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 524288
    },
    "step-5-preview-free": {
      "id": "step-5-preview-free",
      "name": "Step 5 Preview Free",
      "protocol": "openai-completions",
      "provider": "opencode-go",
      "baseUrl": "https://opencode.ai/zen/go/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    }
  },
  "openrouter": {
    "aion-labs/aion-2.0": {
      "id": "aion-labs/aion-2.0",
      "name": "AionLabs: Aion-2.0",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.8,
        "output": 1.6,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "aion-labs/aion-3.0": {
      "id": "aion-labs/aion-3.0",
      "name": "AionLabs: Aion-3.0",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 3,
        "output": 6,
        "cacheRead": 0.75,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "aion-labs/aion-3.0-mini": {
      "id": "aion-labs/aion-3.0-mini",
      "name": "AionLabs: Aion-3.0-Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.7,
        "output": 1.4,
        "cacheRead": 0.18,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "aion-labs/aion-3.5": {
      "id": "aion-labs/aion-3.5",
      "name": "AionLabs: Aion 3.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 3,
        "output": 6,
        "cacheRead": 0.75,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "aion-labs/aion-3.5-mini": {
      "id": "aion-labs/aion-3.5-mini",
      "name": "AionLabs: Aion 3.5 Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.7,
        "output": 1.4,
        "cacheRead": 0.18,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "amazon/nova-2-lite-v1": {
      "id": "amazon/nova-2-lite-v1",
      "name": "Amazon: Nova 2 Lite",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 2.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65535
    },
    "amazon/nova-lite-v1": {
      "id": "amazon/nova-lite-v1",
      "name": "Amazon: Nova Lite 1.0",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.24,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 300000,
      "maxTokens": 5120
    },
    "amazon/nova-micro-v1": {
      "id": "amazon/nova-micro-v1",
      "name": "Amazon: Nova Micro 1.0",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.035,
        "output": 0.14,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 5120
    },
    "amazon/nova-premier-v1": {
      "id": "amazon/nova-premier-v1",
      "name": "Amazon: Nova Premier 1.0",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 12.5,
        "cacheRead": 0.625,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 32000
    },
    "amazon/nova-pro-v1": {
      "id": "amazon/nova-pro-v1",
      "name": "Amazon: Nova Pro 1.0",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.8,
        "output": 3.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 300000,
      "maxTokens": 5120
    },
    "anthropic/claude-fable-5": {
      "id": "anthropic/claude-fable-5",
      "name": "Anthropic: Claude Fable 5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-fable-5.1": {
      "id": "anthropic/claude-fable-5.1",
      "name": "Anthropic: Claude Fable 5.1",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 0.25,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-fable-5.1:batch": {
      "id": "anthropic/claude-fable-5.1:batch",
      "name": "Anthropic: Claude Fable 5.1 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.125,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-fable-5:batch": {
      "id": "anthropic/claude-fable-5:batch",
      "name": "Anthropic: Claude Fable 5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-haiku-4.5": {
      "id": "anthropic/claude-haiku-4.5",
      "name": "Anthropic: Claude Haiku 4.5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "anthropic/claude-haiku-4.5:batch": {
      "id": "anthropic/claude-haiku-4.5:batch",
      "name": "Anthropic: Claude Haiku 4.5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 2.5,
        "cacheRead": 0.05,
        "cacheWrite": 0.625
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "anthropic/claude-haiku-5.5": {
      "id": "anthropic/claude-haiku-5.5",
      "name": "Anthropic: Claude Haiku 5.5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.5,
            "output": 2.5,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-haiku-5.5:batch": {
      "id": "anthropic/claude-haiku-5.5:batch",
      "name": "Anthropic: Claude Haiku 5.5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.25,
        "cacheRead": 0.005,
        "cacheWrite": 0.0625,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.25,
            "output": 1.25,
            "cacheRead": 0.025,
            "cacheWrite": 0.3125
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.1": {
      "id": "anthropic/claude-opus-4.1",
      "name": "Anthropic: Claude Opus 4.1",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 75,
        "cacheRead": 1.5,
        "cacheWrite": 18.75
      },
      "contextWindow": 200000,
      "maxTokens": 32000
    },
    "anthropic/claude-opus-4.1:batch": {
      "id": "anthropic/claude-opus-4.1:batch",
      "name": "Anthropic: Claude Opus 4.1 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 7.5,
        "output": 37.5,
        "cacheRead": 0.75,
        "cacheWrite": 9.375
      },
      "contextWindow": 200000,
      "maxTokens": 32000
    },
    "anthropic/claude-opus-4.5": {
      "id": "anthropic/claude-opus-4.5",
      "name": "Anthropic: Claude Opus 4.5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "anthropic/claude-opus-4.5:batch": {
      "id": "anthropic/claude-opus-4.5:batch",
      "name": "Anthropic: Claude Opus 4.5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 12.5,
        "cacheRead": 0.25,
        "cacheWrite": 3.125
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "anthropic/claude-opus-4.6": {
      "id": "anthropic/claude-opus-4.6",
      "name": "Anthropic: Claude Opus 4.6",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.6:batch": {
      "id": "anthropic/claude-opus-4.6:batch",
      "name": "Anthropic: Claude Opus 4.6 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 12.5,
        "cacheRead": 0.25,
        "cacheWrite": 3.125
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.7": {
      "id": "anthropic/claude-opus-4.7",
      "name": "Anthropic: Claude Opus 4.7",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.7:batch": {
      "id": "anthropic/claude-opus-4.7:batch",
      "name": "Anthropic: Claude Opus 4.7 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 12.5,
        "cacheRead": 0.25,
        "cacheWrite": 3.125
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.8": {
      "id": "anthropic/claude-opus-4.8",
      "name": "Anthropic: Claude Opus 4.8",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.8:batch": {
      "id": "anthropic/claude-opus-4.8:batch",
      "name": "Anthropic: Claude Opus 4.8 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 12.5,
        "cacheRead": 0.25,
        "cacheWrite": 3.125
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-5": {
      "id": "anthropic/claude-opus-5",
      "name": "Anthropic: Claude Opus 5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-5.5": {
      "id": "anthropic/claude-opus-5.5",
      "name": "Anthropic: Claude Opus 5.5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-5.5:batch": {
      "id": "anthropic/claude-opus-5.5:batch",
      "name": "Anthropic: Claude Opus 5.5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-5:batch": {
      "id": "anthropic/claude-opus-5:batch",
      "name": "Anthropic: Claude Opus 5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 12.5,
        "cacheRead": 0.25,
        "cacheWrite": 3.125
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-4": {
      "id": "anthropic/claude-sonnet-4",
      "name": "Anthropic: Claude Sonnet 4",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 6,
            "output": 22.5,
            "cacheRead": 0.6,
            "cacheWrite": 7.5
          }
        ]
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "anthropic/claude-sonnet-4.5": {
      "id": "anthropic/claude-sonnet-4.5",
      "name": "Anthropic: Claude Sonnet 4.5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 6,
            "output": 22.5,
            "cacheRead": 0.6,
            "cacheWrite": 7.5
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "anthropic/claude-sonnet-4.5:batch": {
      "id": "anthropic/claude-sonnet-4.5:batch",
      "name": "Anthropic: Claude Sonnet 4.5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 7.5,
        "cacheRead": 0.15,
        "cacheWrite": 1.875,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 3,
            "output": 11.25,
            "cacheRead": 0.3,
            "cacheWrite": 3.75
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "anthropic/claude-sonnet-4.6": {
      "id": "anthropic/claude-sonnet-4.6",
      "name": "Anthropic: Claude Sonnet 4.6",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-4.6:batch": {
      "id": "anthropic/claude-sonnet-4.6:batch",
      "name": "Anthropic: Claude Sonnet 4.6 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 7.5,
        "cacheRead": 0.15,
        "cacheWrite": 1.875
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-5": {
      "id": "anthropic/claude-sonnet-5",
      "name": "Anthropic: Claude Sonnet 5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-5.5": {
      "id": "anthropic/claude-sonnet-5.5",
      "name": "Anthropic: Claude Sonnet 5.5",
      "protocol": "anthropic-messages",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-5.5:batch": {
      "id": "anthropic/claude-sonnet-5.5:batch",
      "name": "Anthropic: Claude Sonnet 5.5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.05,
        "cacheWrite": 1.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-5:batch": {
      "id": "anthropic/claude-sonnet-5:batch",
      "name": "Anthropic: Claude Sonnet 5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "apodex/apodex-1.1-mini:free": {
      "id": "apodex/apodex-1.1-mini:free",
      "name": "Apodex: Apodex 1.1 Mini (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "arcee-ai/trinity-large-thinking": {
      "id": "arcee-ai/trinity-large-thinking",
      "name": "Arcee AI: Trinity Large Thinking",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.8,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 80000
    },
    "auto": {
      "id": "auto",
      "name": "Auto",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 2000000,
      "maxTokens": 30000
    },
    "bytedance-seed/seed-1.6": {
      "id": "bytedance-seed/seed-1.6",
      "name": "ByteDance Seed: Seed 1.6",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 128000,
            "input": 0.5,
            "output": 4,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "bytedance-seed/seed-1.6-flash": {
      "id": "bytedance-seed/seed-1.6-flash",
      "name": "ByteDance Seed: Seed 1.6 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 128000,
            "input": 0.1,
            "output": 0.8,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "bytedance-seed/seed-2-1-turbo": {
      "id": "bytedance-seed/seed-2-1-turbo",
      "name": "ByteDance Seed: Seed 2.1 Turbo",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 2.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "bytedance-seed/seed-2.0-code": {
      "id": "bytedance-seed/seed-2.0-code",
      "name": "ByteDance Seed: Seed-2.0-Code",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 128000,
            "input": 1,
            "output": 6,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "bytedance-seed/seed-2.0-lite": {
      "id": "bytedance-seed/seed-2.0-lite",
      "name": "ByteDance Seed: Seed-2.0-Lite",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 128000,
            "input": 0.5,
            "output": 4,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "bytedance-seed/seed-2.0-mini": {
      "id": "bytedance-seed/seed-2.0-mini",
      "name": "ByteDance Seed: Seed-2.0-Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 128000,
            "input": 0.2,
            "output": 0.8,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "cohere/command-a-plus": {
      "id": "cohere/command-a-plus",
      "name": "Cohere: Command A+",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.5,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 192000,
      "maxTokens": 64000
    },
    "cohere/command-r-08-2024": {
      "id": "cohere/command-r-08-2024",
      "name": "Cohere: Command R (08-2024)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4000
    },
    "cohere/command-r-plus-08-2024": {
      "id": "cohere/command-r-plus-08-2024",
      "name": "Cohere: Command R+ (08-2024)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4000
    },
    "cohere/north-mini-code:free": {
      "id": "cohere/north-mini-code:free",
      "name": "Cohere: North Mini Code (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 64000
    },
    "deepseek/deepseek-chat": {
      "id": "deepseek/deepseek-chat",
      "name": "DeepSeek: DeepSeek V3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.32,
        "output": 0.89,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 16384
    },
    "deepseek/deepseek-chat-v3-0324": {
      "id": "deepseek/deepseek-chat-v3-0324",
      "name": "DeepSeek: DeepSeek V3 0324",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.29,
        "output": 1.14,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 115200
    },
    "deepseek/deepseek-chat-v3.1": {
      "id": "deepseek/deepseek-chat-v3.1",
      "name": "DeepSeek: DeepSeek V3.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.95,
        "cacheRead": 0.13,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 32768
    },
    "deepseek/deepseek-r1": {
      "id": "deepseek/deepseek-r1",
      "name": "DeepSeek: R1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.7,
        "output": 2.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 64000,
      "maxTokens": 16000
    },
    "deepseek/deepseek-r1-0528": {
      "id": "deepseek/deepseek-r1-0528",
      "name": "DeepSeek: R1 0528",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 2.15,
        "cacheRead": 0.35,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 32768
    },
    "deepseek/deepseek-v3.1-terminus": {
      "id": "deepseek/deepseek-v3.1-terminus",
      "name": "DeepSeek: DeepSeek V3.1 Terminus",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.27,
        "output": 1,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 147456
    },
    "deepseek/deepseek-v3.2": {
      "id": "deepseek/deepseek-v3.2",
      "name": "DeepSeek: DeepSeek V3.2",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.259,
        "output": 0.8,
        "cacheRead": 0.14,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 147456
    },
    "deepseek/deepseek-v3.2-exp": {
      "id": "deepseek/deepseek-v3.2-exp",
      "name": "DeepSeek: DeepSeek V3.2 Exp",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.27,
        "output": 0.41,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 147456
    },
    "deepseek/deepseek-v4-flash": {
      "id": "deepseek/deepseek-v4-flash",
      "name": "DeepSeek: DeepSeek V4 Flash 0423",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0173,
        "output": 1.28,
        "cacheRead": 0.0173,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "deepseek/deepseek-v4-flash-0731": {
      "id": "deepseek/deepseek-v4-flash-0731",
      "name": "DeepSeek: DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.016,
        "output": 0.64,
        "cacheRead": 0.016,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "deepseek/deepseek-v4-flash-vision-exp": {
      "id": "deepseek/deepseek-v4-flash-vision-exp",
      "name": "DeepSeek: DeepSeek V4 Flash Vision Exp",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2156,
        "output": 0.6468,
        "cacheRead": 0.00686,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "deepseek/deepseek-v4-pro": {
      "id": "deepseek/deepseek-v4-pro",
      "name": "DeepSeek: DeepSeek V4 Pro 0423",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.41238,
        "output": 0.82476,
        "cacheRead": 0.034365,
        "cacheWrite": 0
      },
      "contextWindow": 1024000,
      "maxTokens": 384000
    },
    "deepseek/deepseek-v4-pro-0813": {
      "id": "deepseek/deepseek-v4-pro-0813",
      "name": "DeepSeek: DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.66,
        "output": 1.98,
        "cacheRead": 0.022,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 393216
    },
    "deepseek/deepseek-v4.1-flash": {
      "id": "deepseek/deepseek-v4.1-flash",
      "name": "DeepSeek: DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.003,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 393216
    },
    "deepseek/deepseek-v4.1-flash:batch": {
      "id": "deepseek/deepseek-v4.1-flash:batch",
      "name": "DeepSeek: DeepSeek V4.1 Flash (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.112,
        "output": 0.336,
        "cacheRead": 0.00336,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "dots-studio/dots-3-note-preview:free": {
      "id": "dots-studio/dots-3-note-preview:free",
      "name": "Dots Studio: Dots3-Note Preview (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 512000,
      "maxTokens": 460800
    },
    "fireworks/ember-1": {
      "id": "fireworks/ember-1",
      "name": "Fireworks: Ember-1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "google/gemini-2.5-flash": {
      "id": "google/gemini-2.5-flash",
      "name": "Google: Gemini 2.5 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 2.5,
        "cacheRead": 0.03,
        "cacheWrite": 0.083333
      },
      "contextWindow": 1048576,
      "maxTokens": 65535
    },
    "google/gemini-2.5-flash-lite": {
      "id": "google/gemini-2.5-flash-lite",
      "name": "Google: Gemini 2.5 Flash Lite",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0.01,
        "cacheWrite": 0.083333
      },
      "contextWindow": 1048576,
      "maxTokens": 65535
    },
    "google/gemini-2.5-flash-lite:batch": {
      "id": "google/gemini-2.5-flash-lite:batch",
      "name": "Google: Gemini 2.5 Flash Lite (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.2,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 65535
    },
    "google/gemini-2.5-flash:batch": {
      "id": "google/gemini-2.5-flash:batch",
      "name": "Google: Gemini 2.5 Flash (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 1.25,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 65535
    },
    "google/gemini-2.5-pro": {
      "id": "google/gemini-2.5-pro",
      "name": "Google: Gemini 2.5 Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0.375,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 15,
            "cacheRead": 0.25,
            "cacheWrite": 0.375
          }
        ]
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-2.5-pro-preview": {
      "id": "google/gemini-2.5-pro-preview",
      "name": "Google: Gemini 2.5 Pro Preview 06-05",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0.375,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 15,
            "cacheRead": 0.25,
            "cacheWrite": 0.375
          }
        ]
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-2.5-pro:batch": {
      "id": "google/gemini-2.5-pro:batch",
      "name": "Google: Gemini 2.5 Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.625,
        "output": 5,
        "cacheRead": 0.125,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 1.25,
            "output": 7.5,
            "cacheRead": 0.25,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3-flash-preview": {
      "id": "google/gemini-3-flash-preview",
      "name": "Google: Gemini 3 Flash Preview",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 3,
        "cacheRead": 0.05,
        "cacheWrite": 0.083333
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3-flash-preview:batch": {
      "id": "google/gemini-3-flash-preview:batch",
      "name": "Google: Gemini 3 Flash Preview (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 1.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3-pro-image": {
      "id": "google/gemini-3-pro-image",
      "name": "Google: Nano Banana Pro (Gemini 3 Pro Image)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 0.375
      },
      "contextWindow": 65536,
      "maxTokens": 32768
    },
    "google/gemini-3.1-flash-lite": {
      "id": "google/gemini-3.1-flash-lite",
      "name": "Google: Gemini 3.1 Flash Lite",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 1.5,
        "cacheRead": 0.025,
        "cacheWrite": 0.083333
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.1-flash-lite-preview": {
      "id": "google/gemini-3.1-flash-lite-preview",
      "name": "Google: Gemini 3.1 Flash Lite Preview",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 1.5,
        "cacheRead": 0.025,
        "cacheWrite": 0.083333
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.1-flash-lite:batch": {
      "id": "google/gemini-3.1-flash-lite:batch",
      "name": "Google: Gemini 3.1 Flash Lite (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.125,
        "output": 0.75,
        "cacheRead": 0.0125,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.1-pro-preview": {
      "id": "google/gemini-3.1-pro-preview",
      "name": "Google: Gemini 3.1 Pro Preview",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 0.375,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 0.375
          }
        ]
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.1-pro-preview-customtools": {
      "id": "google/gemini-3.1-pro-preview-customtools",
      "name": "Google: Gemini 3.1 Pro Preview Custom Tools",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 0.375,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 0.375
          }
        ]
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.1-pro-preview:batch": {
      "id": "google/gemini-3.1-pro-preview:batch",
      "name": "Google: Gemini 3.1 Pro Preview (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 6,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2,
            "output": 9,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.5-flash": {
      "id": "google/gemini-3.5-flash",
      "name": "Google: Gemini 3.5 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 9,
        "cacheRead": 0.15,
        "cacheWrite": 0.083333
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.5-flash-lite": {
      "id": "google/gemini-3.5-flash-lite",
      "name": "Google: Gemini 3.5 Flash Lite",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 2.5,
        "cacheRead": 0.03,
        "cacheWrite": 0.083333
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.5-flash-lite:batch": {
      "id": "google/gemini-3.5-flash-lite:batch",
      "name": "Google: Gemini 3.5 Flash Lite (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 1.25,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.5-flash:batch": {
      "id": "google/gemini-3.5-flash:batch",
      "name": "Google: Gemini 3.5 Flash (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.6-flash": {
      "id": "google/gemini-3.6-flash",
      "name": "Google: Gemini 3.6 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0.041667
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.6-flash:batch": {
      "id": "google/gemini-3.6-flash:batch",
      "name": "Google: Gemini 3.6 Flash (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.375,
        "output": 1.875,
        "cacheRead": 0.0375,
        "cacheWrite": 0.041667
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.7-flash": {
      "id": "google/gemini-3.7-flash",
      "name": "Google: Gemini 3.7 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0.041667
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.7-flash:batch": {
      "id": "google/gemini-3.7-flash:batch",
      "name": "Google: Gemini 3.7 Flash (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.375,
        "output": 1.875,
        "cacheRead": 0.0375,
        "cacheWrite": 0.041667
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.8-flash": {
      "id": "google/gemini-3.8-flash",
      "name": "Google: Gemini 3.8 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0.041667
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-3.8-flash:batch": {
      "id": "google/gemini-3.8-flash:batch",
      "name": "Google: Gemini 3.8 Flash (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.375,
        "output": 1.875,
        "cacheRead": 0.0375,
        "cacheWrite": 0.041667
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "google/gemini-nano-banana-2.1": {
      "id": "google/gemini-nano-banana-2.1",
      "name": "Google: Nano Banana 2.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 7.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 65536,
      "maxTokens": 58982
    },
    "google/gemma-3-12b-it": {
      "id": "google/gemma-3-12b-it",
      "name": "Google: Gemma 3 12B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "google/gemma-3-27b-it": {
      "id": "google/gemma-3-27b-it",
      "name": "Google: Gemma 3 27B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.08,
        "output": 0.45,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "google/gemma-4-26b-a4b-it": {
      "id": "google/gemma-4-26b-a4b-it",
      "name": "Google: Gemma 4 26B A4B ",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.0765,
        "output": 0.255,
        "cacheRead": 0.0425,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "google/gemma-4-26b-a4b-it:free": {
      "id": "google/gemma-4-26b-a4b-it:free",
      "name": "Google: Gemma 4 26B A4B  (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "google/gemma-4-31b-it": {
      "id": "google/gemma-4-31b-it",
      "name": "Google: Gemma 4 31B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.09,
        "output": 0.34,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 16384
    },
    "google/gemma-4-31b-it:free": {
      "id": "google/gemma-4-31b-it:free",
      "name": "Google: Gemma 4 31B (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "ibm-granite/granite-4.2-8b": {
      "id": "ibm-granite/granite-4.2-8b",
      "name": "IBM: Granite 4.2 8B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.25,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "inception/mercury-2": {
      "id": "inception/mercury-2",
      "name": "Inception: Mercury 2",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.75,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 50000
    },
    "inception/mercury-2.5": {
      "id": "inception/mercury-2.5",
      "name": "Inception: Mercury 2.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.04,
        "output": 0.15,
        "cacheRead": 0.004,
        "cacheWrite": 0
      },
      "contextWindow": 260000,
      "maxTokens": 65536
    },
    "inclusionai/ling-3.0-flash": {
      "id": "inclusionai/ling-3.0-flash",
      "name": "inclusionAI: Ling 3.0 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.021,
        "output": 0.063,
        "cacheRead": 0.0042,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "inclusionai/ling-3.0-flash-fin": {
      "id": "inclusionai/ling-3.0-flash-fin",
      "name": "inclusionAI: Ling 3.0 Flash Fin",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.042,
        "output": 0.1232,
        "cacheRead": 0.0084,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "inclusionai/ling-3.0-flash-sante": {
      "id": "inclusionai/ling-3.0-flash-sante",
      "name": "inclusionAI: Ling 3.0 Flash Sante",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.042,
        "output": 0.1232,
        "cacheRead": 0.0084,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "inclusionai/ling-3.0-flash-vl": {
      "id": "inclusionai/ling-3.0-flash-vl",
      "name": "inclusionAI: Ling 3.0 Flash VL",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.021,
        "output": 0.0616,
        "cacheRead": 0.0042,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "inclusionai/ling-3.1-flash": {
      "id": "inclusionai/ling-3.1-flash",
      "name": "inclusionAI: Ling 3.1 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "liquid/lfm-2.5-2.6b:free": {
      "id": "liquid/lfm-2.5-2.6b:free",
      "name": "LiquidAI: LFM2.5-2.6B (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 65536,
      "maxTokens": 8192
    },
    "meituan/longcat-2.0": {
      "id": "meituan/longcat-2.0",
      "name": "Meituan: LongCat 2.0",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.006,
        "cacheWrite": 0
      },
      "contextWindow": 1048756,
      "maxTokens": 262144
    },
    "meta-llama/llama-3.1-70b-instruct": {
      "id": "meta-llama/llama-3.1-70b-instruct",
      "name": "Meta: Llama 3.1 70B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.4,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "meta-llama/llama-3.1-8b-instruct": {
      "id": "meta-llama/llama-3.1-8b-instruct",
      "name": "Meta: Llama 3.1 8B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.08,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "meta-llama/llama-3.3-70b-instruct": {
      "id": "meta-llama/llama-3.3-70b-instruct",
      "name": "Meta: Llama 3.3 70B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.22,
        "output": 0.5,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "meta-llama/llama-4-maverick": {
      "id": "meta-llama/llama-4-maverick",
      "name": "Meta: Llama 4 Maverick",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1875,
        "output": 0.6525,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "meta-llama/llama-4-scout": {
      "id": "meta-llama/llama-4-scout",
      "name": "Meta: Llama 4 Scout",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.18,
        "output": 0.59,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "meta/muse-glimmer-30b": {
      "id": "meta/muse-glimmer-30b",
      "name": "Meta: Muse Glimmer 30B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "meta/muse-spark-1.1": {
      "id": "meta/muse-spark-1.1",
      "name": "Meta: Muse Spark 1.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "meta/muse-spark-1.2": {
      "id": "meta/muse-spark-1.2",
      "name": "Meta: Muse Spark 1.2",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "meta/muse-spark-1.2-contributor": {
      "id": "meta/muse-spark-1.2-contributor",
      "name": "Meta: Muse Spark 1.2 Contributor",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0.002,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "meta/muse-spark-1.3": {
      "id": "meta/muse-spark-1.3",
      "name": "Meta: Muse Spark 1.3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "meta/muse-spark-1.3-contributor": {
      "id": "meta/muse-spark-1.3-contributor",
      "name": "Meta: Muse Spark 1.3 Contributor",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0.002,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "meta/muse-wonder": {
      "id": "meta/muse-wonder",
      "name": "Meta: Muse Wonder",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "minimax/minimax-m1": {
      "id": "minimax/minimax-m1",
      "name": "MiniMax: MiniMax M1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.55,
        "output": 2.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 40000
    },
    "minimax/minimax-m2": {
      "id": "minimax/minimax-m2",
      "name": "MiniMax: MiniMax M2",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 196608,
      "maxTokens": 176947
    },
    "minimax/minimax-m2.1": {
      "id": "minimax/minimax-m2.1",
      "name": "MiniMax: MiniMax M2.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "minimax/minimax-m2.5": {
      "id": "minimax/minimax-m2.5",
      "name": "MiniMax: MiniMax M2.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.27,
        "output": 1.08,
        "cacheRead": 0.027,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 128000
    },
    "minimax/minimax-m2.7": {
      "id": "minimax/minimax-m2.7",
      "name": "MiniMax: MiniMax M2.7",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.21,
        "output": 0.84,
        "cacheRead": 0.042,
        "cacheWrite": 0
      },
      "contextWindow": 196608,
      "maxTokens": 176947
    },
    "minimax/minimax-m3": {
      "id": "minimax/minimax-m3",
      "name": "MiniMax: MiniMax M3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 512000
    },
    "mistralai/codestral-2508": {
      "id": "mistralai/codestral-2508",
      "name": "Mistral: Codestral 2508",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 0.9,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 204800
    },
    "mistralai/codestral-2508:batch": {
      "id": "mistralai/codestral-2508:batch",
      "name": "Mistral: Codestral 2508 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.45,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 204800
    },
    "mistralai/devstral-2512": {
      "id": "mistralai/devstral-2512",
      "name": "Mistral: Devstral 2 2512",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.4,
        "output": 2,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/ministral-14b-2512": {
      "id": "mistralai/ministral-14b-2512",
      "name": "Mistral: Ministral 3 14B 2512",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.2,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/ministral-3b-2512": {
      "id": "mistralai/ministral-3b-2512",
      "name": "Mistral: Ministral 3 3B 2512",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.1,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 104857
    },
    "mistralai/ministral-8b-2512": {
      "id": "mistralai/ministral-8b-2512",
      "name": "Mistral: Ministral 3 8B 2512",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.15,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/ministral-8b-2512:batch": {
      "id": "mistralai/ministral-8b-2512:batch",
      "name": "Mistral: Ministral 3 8B 2512 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.075,
        "cacheRead": 0.0075,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/mistral-large": {
      "id": "mistralai/mistral-large",
      "name": "Mistral Large",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 102400
    },
    "mistralai/mistral-large-2407": {
      "id": "mistralai/mistral-large-2407",
      "name": "Mistral Large 2407",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 104857
    },
    "mistralai/mistral-large-2512": {
      "id": "mistralai/mistral-large-2512",
      "name": "Mistral: Mistral Large 3 2512",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.5,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/mistral-large-2512:batch": {
      "id": "mistralai/mistral-large-2512:batch",
      "name": "Mistral: Mistral Large 3 2512 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.75,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/mistral-large-4-0": {
      "id": "mistralai/mistral-large-4-0",
      "name": "Mistral: Mistral Large 4",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.68,
        "output": 2.09,
        "cacheRead": 0.07,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "mistralai/mistral-medium-3": {
      "id": "mistralai/mistral-medium-3",
      "name": "Mistral: Mistral Medium 3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 2,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 104857
    },
    "mistralai/mistral-medium-3-5": {
      "id": "mistralai/mistral-medium-3-5",
      "name": "Mistral: Mistral Medium 3.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 7.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/mistral-medium-3-5:batch": {
      "id": "mistralai/mistral-medium-3-5:batch",
      "name": "Mistral: Mistral Medium 3.5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/mistral-medium-3.1": {
      "id": "mistralai/mistral-medium-3.1",
      "name": "Mistral: Mistral Medium 3.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 2,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 104857
    },
    "mistralai/mistral-medium-3.1:batch": {
      "id": "mistralai/mistral-medium-3.1:batch",
      "name": "Mistral: Mistral Medium 3.1 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 104857
    },
    "mistralai/mistral-nemo": {
      "id": "mistralai/mistral-nemo",
      "name": "Mistral: Mistral Nemo",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.029,
        "output": 0.03,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 16384
    },
    "mistralai/mistral-saba": {
      "id": "mistralai/mistral-saba",
      "name": "Mistral: Saba",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.6,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 32768,
      "maxTokens": 26214
    },
    "mistralai/mistral-small-2603": {
      "id": "mistralai/mistral-small-2603",
      "name": "Mistral: Mistral Small 4",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/mistral-small-2603:batch": {
      "id": "mistralai/mistral-small-2603:batch",
      "name": "Mistral: Mistral Small 4 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.3,
        "cacheRead": 0.0075,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 209715
    },
    "mistralai/mistral-small-3.1-24b-instruct": {
      "id": "mistralai/mistral-small-3.1-24b-instruct",
      "name": "Mistral: Mistral Small 3.1 24B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.351,
        "output": 0.555,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 102400
    },
    "mistralai/mistral-small-3.2-24b-instruct": {
      "id": "mistralai/mistral-small-3.2-24b-instruct",
      "name": "Mistral: Mistral Small 3.2 24B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.09375,
        "output": 0.25,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 16384
    },
    "mistralai/mixtral-8x22b-instruct": {
      "id": "mistralai/mixtral-8x22b-instruct",
      "name": "Mistral: Mixtral 8x22B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 65536,
      "maxTokens": 52428
    },
    "mistralai/voxtral-small-24b-2507": {
      "id": "mistralai/voxtral-small-24b-2507",
      "name": "Mistral: Voxtral Small 24B 2507",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.3,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 32768,
      "maxTokens": 26214
    },
    "moonshotai/kimi-k2": {
      "id": "moonshotai/kimi-k2",
      "name": "MoonshotAI: Kimi K2 0711",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.57,
        "output": 2.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 98304
    },
    "moonshotai/kimi-k2-0905": {
      "id": "moonshotai/kimi-k2-0905",
      "name": "MoonshotAI: Kimi K2 0905",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 98304
    },
    "moonshotai/kimi-k2-thinking": {
      "id": "moonshotai/kimi-k2-thinking",
      "name": "MoonshotAI: Kimi K2 Thinking",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.5,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 98304
    },
    "moonshotai/kimi-k2.5": {
      "id": "moonshotai/kimi-k2.5",
      "name": "MoonshotAI: Kimi K2.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.41,
        "output": 2.06,
        "cacheRead": 0.07,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 4096
    },
    "moonshotai/kimi-k2.6": {
      "id": "moonshotai/kimi-k2.6",
      "name": "MoonshotAI: Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.65,
        "output": 3.41,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "moonshotai/kimi-k2.7-code": {
      "id": "moonshotai/kimi-k2.7-code",
      "name": "MoonshotAI: Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6712,
        "output": 3.35,
        "cacheRead": 0.18,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "moonshotai/kimi-k3": {
      "id": "moonshotai/kimi-k3",
      "name": "MoonshotAI: Kimi K3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.73,
        "output": 10,
        "cacheRead": 0.55,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "moonshotai/kimi-k3:batch": {
      "id": "moonshotai/kimi-k3:batch",
      "name": "MoonshotAI: Kimi K3 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.28,
        "output": 11.4,
        "cacheRead": 0.228,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 16384
    },
    "nex-agi/nex-n2.5-pro": {
      "id": "nex-agi/nex-n2.5-pro",
      "name": "Nex AGI: Nex-N2.5-Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.25,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "nvidia/nemotron-3-nano-30b-a3b": {
      "id": "nvidia/nemotron-3-nano-30b-a3b",
      "name": "NVIDIA: Nemotron 3 Nano 30B A3B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.24,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
      "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "name": "NVIDIA: Nemotron 3 Nano Omni (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 65536
    },
    "nvidia/nemotron-3-super-120b-a12b": {
      "id": "nvidia/nemotron-3-super-120b-a12b",
      "name": "NVIDIA: Nemotron 3 Super",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.08,
        "output": 0.45,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "nvidia/nemotron-3-super-120b-a12b:free": {
      "id": "nvidia/nemotron-3-super-120b-a12b:free",
      "name": "NVIDIA: Nemotron 3 Super (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "nvidia/nemotron-3-ultra-550b-a55b": {
      "id": "nvidia/nemotron-3-ultra-550b-a55b",
      "name": "NVIDIA: Nemotron 3 Ultra",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.12,
        "cacheWrite": 0
      },
      "contextWindow": 202800,
      "maxTokens": 182520
    },
    "nvidia/nemotron-3-ultra-550b-a55b:free": {
      "id": "nvidia/nemotron-3-ultra-550b-a55b:free",
      "name": "NVIDIA: Nemotron 3 Ultra (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "nvidia/nemotron-3.5-lightning": {
      "id": "nvidia/nemotron-3.5-lightning",
      "name": "NVIDIA: Nemotron 3.5 Lightning",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.07,
        "output": 0.2,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "nvidia/nemotron-3.5-lightning:free": {
      "id": "nvidia/nemotron-3.5-lightning:free",
      "name": "NVIDIA: Nemotron 3.5 Lightning (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "openai/gpt-3.5-turbo": {
      "id": "openai/gpt-3.5-turbo",
      "name": "OpenAI: GPT-3.5 Turbo",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 16385,
      "maxTokens": 4096
    },
    "openai/gpt-3.5-turbo-0613": {
      "id": "openai/gpt-3.5-turbo-0613",
      "name": "OpenAI: GPT-3.5 Turbo (older v0613)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 4095,
      "maxTokens": 3685
    },
    "openai/gpt-3.5-turbo-16k": {
      "id": "openai/gpt-3.5-turbo-16k",
      "name": "OpenAI: GPT-3.5 Turbo 16k",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 3,
        "output": 4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 16385,
      "maxTokens": 4096
    },
    "openai/gpt-3.5-turbo:batch": {
      "id": "openai/gpt-3.5-turbo:batch",
      "name": "OpenAI: GPT-3.5 Turbo (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.75,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 16385,
      "maxTokens": 4096
    },
    "openai/gpt-4": {
      "id": "openai/gpt-4",
      "name": "OpenAI: GPT-4",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 30,
        "output": 60,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 8191,
      "maxTokens": 4096
    },
    "openai/gpt-4-turbo": {
      "id": "openai/gpt-4-turbo",
      "name": "OpenAI: GPT-4 Turbo",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 30,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "openai/gpt-4-turbo:batch": {
      "id": "openai/gpt-4-turbo:batch",
      "name": "OpenAI: GPT-4 Turbo (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "openai/gpt-4.1": {
      "id": "openai/gpt-4.1",
      "name": "OpenAI: GPT-4.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-mini": {
      "id": "openai/gpt-4.1-mini",
      "name": "OpenAI: GPT-4.1 Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 1.6,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-mini:batch": {
      "id": "openai/gpt-4.1-mini:batch",
      "name": "OpenAI: GPT-4.1 Mini (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.8,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-nano": {
      "id": "openai/gpt-4.1-nano",
      "name": "OpenAI: GPT-4.1 Nano",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-nano:batch": {
      "id": "openai/gpt-4.1-nano:batch",
      "name": "OpenAI: GPT-4.1 Nano (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.2,
        "cacheRead": 0.0125,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1:batch": {
      "id": "openai/gpt-4.1:batch",
      "name": "OpenAI: GPT-4.1 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 4,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4o": {
      "id": "openai/gpt-4o",
      "name": "OpenAI: GPT-4o",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 1.25,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o-2024-05-13": {
      "id": "openai/gpt-4o-2024-05-13",
      "name": "OpenAI: GPT-4o (2024-05-13)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "openai/gpt-4o-2024-08-06": {
      "id": "openai/gpt-4o-2024-08-06",
      "name": "OpenAI: GPT-4o (2024-08-06)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 1.25,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o-2024-11-20": {
      "id": "openai/gpt-4o-2024-11-20",
      "name": "OpenAI: GPT-4o (2024-11-20)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 1.25,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o-mini": {
      "id": "openai/gpt-4o-mini",
      "name": "OpenAI: GPT-4o-mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o-mini-2024-07-18": {
      "id": "openai/gpt-4o-mini-2024-07-18",
      "name": "OpenAI: GPT-4o-mini (2024-07-18)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o-mini:batch": {
      "id": "openai/gpt-4o-mini:batch",
      "name": "OpenAI: GPT-4o-mini (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.3,
        "cacheRead": 0.0375,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o:batch": {
      "id": "openai/gpt-4o:batch",
      "name": "OpenAI: GPT-4o (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 5,
        "cacheRead": 0.625,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-5": {
      "id": "openai/gpt-5",
      "name": "OpenAI: GPT-5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-mini": {
      "id": "openai/gpt-5-mini",
      "name": "OpenAI: GPT-5 Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-mini:batch": {
      "id": "openai/gpt-5-mini:batch",
      "name": "OpenAI: GPT-5 Mini (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.125,
        "output": 1,
        "cacheRead": 0.0125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-nano": {
      "id": "openai/gpt-5-nano",
      "name": "OpenAI: GPT-5 Nano",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.4,
        "cacheRead": 0.005,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-nano:batch": {
      "id": "openai/gpt-5-nano:batch",
      "name": "OpenAI: GPT-5 Nano (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.025,
        "output": 0.2,
        "cacheRead": 0.0025,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-pro": {
      "id": "openai/gpt-5-pro",
      "name": "OpenAI: GPT-5 Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 120,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-pro:batch": {
      "id": "openai/gpt-5-pro:batch",
      "name": "OpenAI: GPT-5 Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 7.5,
        "output": 60,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1": {
      "id": "openai/gpt-5.1",
      "name": "OpenAI: GPT-5.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1-codex": {
      "id": "openai/gpt-5.1-codex",
      "name": "OpenAI: GPT-5.1-Codex",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.13,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1-codex-max": {
      "id": "openai/gpt-5.1-codex-max",
      "name": "OpenAI: GPT-5.1-Codex-Max",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1-codex-mini": {
      "id": "openai/gpt-5.1-codex-mini",
      "name": "OpenAI: GPT-5.1-Codex-Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1:batch": {
      "id": "openai/gpt-5.1:batch",
      "name": "OpenAI: GPT-5.1 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.625,
        "output": 5,
        "cacheRead": 0.0625,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2": {
      "id": "openai/gpt-5.2",
      "name": "OpenAI: GPT-5.2",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2-chat": {
      "id": "openai/gpt-5.2-chat",
      "name": "OpenAI: GPT-5.2 Chat",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 32000
    },
    "openai/gpt-5.2-codex": {
      "id": "openai/gpt-5.2-codex",
      "name": "OpenAI: GPT-5.2-Codex",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2-pro": {
      "id": "openai/gpt-5.2-pro",
      "name": "OpenAI: GPT-5.2 Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 21,
        "output": 168,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2-pro:batch": {
      "id": "openai/gpt-5.2-pro:batch",
      "name": "OpenAI: GPT-5.2 Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10.5,
        "output": 84,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2:batch": {
      "id": "openai/gpt-5.2:batch",
      "name": "OpenAI: GPT-5.2 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.875,
        "output": 7,
        "cacheRead": 0.0875,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.3-codex": {
      "id": "openai/gpt-5.3-codex",
      "name": "OpenAI: GPT-5.3-Codex",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4": {
      "id": "openai/gpt-5.4",
      "name": "OpenAI: GPT-5.4",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 5,
            "output": 22.5,
            "cacheRead": 0.5,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-mini": {
      "id": "openai/gpt-5.4-mini",
      "name": "OpenAI: GPT-5.4 Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-mini:batch": {
      "id": "openai/gpt-5.4-mini:batch",
      "name": "OpenAI: GPT-5.4 Mini (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.375,
        "output": 2.25,
        "cacheRead": 0.0375,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-nano": {
      "id": "openai/gpt-5.4-nano",
      "name": "OpenAI: GPT-5.4 Nano",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.25,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-nano:batch": {
      "id": "openai/gpt-5.4-nano:batch",
      "name": "OpenAI: GPT-5.4 Nano (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.625,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-pro": {
      "id": "openai/gpt-5.4-pro",
      "name": "OpenAI: GPT-5.4 Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 60,
            "output": 270,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-pro:batch": {
      "id": "openai/gpt-5.4-pro:batch",
      "name": "OpenAI: GPT-5.4 Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 90,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 30,
            "output": 135,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4:batch": {
      "id": "openai/gpt-5.4:batch",
      "name": "OpenAI: GPT-5.4 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 7.5,
        "cacheRead": 0.125,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2.5,
            "output": 11.25,
            "cacheRead": 0.25,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.5": {
      "id": "openai/gpt-5.5",
      "name": "OpenAI: GPT-5.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.5-pro": {
      "id": "openai/gpt-5.5-pro",
      "name": "OpenAI: GPT-5.5 Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 60,
            "output": 270,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.5-pro:batch": {
      "id": "openai/gpt-5.5-pro:batch",
      "name": "OpenAI: GPT-5.5 Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 90,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 30,
            "output": 135,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.5:batch": {
      "id": "openai/gpt-5.5:batch",
      "name": "OpenAI: GPT-5.5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 5,
            "output": 22.5,
            "cacheRead": 0.5,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-luna": {
      "id": "openai/gpt-5.6-luna",
      "name": "OpenAI: GPT-5.6 Luna",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.4,
            "output": 1.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-luna-pro": {
      "id": "openai/gpt-5.6-luna-pro",
      "name": "OpenAI: GPT-5.6 Luna Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.4,
            "output": 1.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-luna-pro:batch": {
      "id": "openai/gpt-5.6-luna-pro:batch",
      "name": "OpenAI: GPT-5.6 Luna Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.6,
        "cacheRead": 0.01,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.9,
            "cacheRead": 0.02,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-luna:batch": {
      "id": "openai/gpt-5.6-luna:batch",
      "name": "OpenAI: GPT-5.6 Luna (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.6,
        "cacheRead": 0.01,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.9,
            "cacheRead": 0.02,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-sol": {
      "id": "openai/gpt-5.6-sol",
      "name": "OpenAI: GPT-5.6 Sol",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-sol-pro": {
      "id": "openai/gpt-5.6-sol-pro",
      "name": "OpenAI: GPT-5.6 Sol Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-sol-pro:batch": {
      "id": "openai/gpt-5.6-sol-pro:batch",
      "name": "OpenAI: GPT-5.6 Sol Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2,
            "output": 7.5,
            "cacheRead": 0.2,
            "cacheWrite": 2.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-sol:batch": {
      "id": "openai/gpt-5.6-sol:batch",
      "name": "OpenAI: GPT-5.6 Sol (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2,
            "output": 7.5,
            "cacheRead": 0.2,
            "cacheWrite": 2.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-terra": {
      "id": "openai/gpt-5.6-terra",
      "name": "OpenAI: GPT-5.6 Terra",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-terra-pro": {
      "id": "openai/gpt-5.6-terra-pro",
      "name": "OpenAI: GPT-5.6 Terra Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-terra-pro:batch": {
      "id": "openai/gpt-5.6-terra-pro:batch",
      "name": "OpenAI: GPT-5.6 Terra Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 6,
        "cacheRead": 0.1,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2,
            "output": 9,
            "cacheRead": 0.2,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-terra:batch": {
      "id": "openai/gpt-5.6-terra:batch",
      "name": "OpenAI: GPT-5.6 Terra (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 6,
        "cacheRead": 0.1,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2,
            "output": 9,
            "cacheRead": 0.2,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5:batch": {
      "id": "openai/gpt-5:batch",
      "name": "OpenAI: GPT-5 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.625,
        "output": 5,
        "cacheRead": 0.0625,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-6-astra": {
      "id": "openai/gpt-6-astra",
      "name": "OpenAI: GPT-6 Astra",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 20,
            "output": 75,
            "cacheRead": 2,
            "cacheWrite": 25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-astra-pro": {
      "id": "openai/gpt-6-astra-pro",
      "name": "OpenAI: GPT-6 Astra Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 20,
            "output": 75,
            "cacheRead": 2,
            "cacheWrite": 25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-astra-pro:batch": {
      "id": "openai/gpt-6-astra-pro:batch",
      "name": "OpenAI: GPT-6 Astra Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 37.5,
            "cacheRead": 1,
            "cacheWrite": 12.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-astra:batch": {
      "id": "openai/gpt-6-astra:batch",
      "name": "OpenAI: GPT-6 Astra (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 37.5,
            "cacheRead": 1,
            "cacheWrite": 12.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-luna": {
      "id": "openai/gpt-6-luna",
      "name": "OpenAI: GPT-6 Luna",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-luna-pro": {
      "id": "openai/gpt-6-luna-pro",
      "name": "OpenAI: GPT-6 Luna Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-luna-pro:batch": {
      "id": "openai/gpt-6-luna-pro:batch",
      "name": "OpenAI: GPT-6 Luna Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.25,
        "cacheRead": 0.005,
        "cacheWrite": 0.0625,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.1,
            "output": 0.375,
            "cacheRead": 0.01,
            "cacheWrite": 0.125
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-luna:batch": {
      "id": "openai/gpt-6-luna:batch",
      "name": "OpenAI: GPT-6 Luna (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.25,
        "cacheRead": 0.005,
        "cacheWrite": 0.0625,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.1,
            "output": 0.375,
            "cacheRead": 0.01,
            "cacheWrite": 0.125
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-sol": {
      "id": "openai/gpt-6-sol",
      "name": "OpenAI: GPT-6 Sol",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-sol-pro": {
      "id": "openai/gpt-6-sol-pro",
      "name": "OpenAI: GPT-6 Sol Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-sol-pro:batch": {
      "id": "openai/gpt-6-sol-pro:batch",
      "name": "OpenAI: GPT-6 Sol Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2,
            "output": 7.5,
            "cacheRead": 0.2,
            "cacheWrite": 2.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-sol:batch": {
      "id": "openai/gpt-6-sol:batch",
      "name": "OpenAI: GPT-6 Sol (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2,
            "output": 7.5,
            "cacheRead": 0.2,
            "cacheWrite": 2.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6.1-sol": {
      "id": "openai/gpt-6.1-sol",
      "name": "OpenAI: GPT-6.1 Sol",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.2,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6.1-sol-pro": {
      "id": "openai/gpt-6.1-sol-pro",
      "name": "OpenAI: GPT-6.1 Sol Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.2,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6.1-sol-pro:batch": {
      "id": "openai/gpt-6.1-sol-pro:batch",
      "name": "OpenAI: GPT-6.1 Sol Pro (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.05,
        "cacheWrite": 1.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2,
            "output": 7.5,
            "cacheRead": 0.1,
            "cacheWrite": 2.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6.1-sol:batch": {
      "id": "openai/gpt-6.1-sol:batch",
      "name": "OpenAI: GPT-6.1 Sol (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.05,
        "cacheWrite": 1.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 2,
            "output": 7.5,
            "cacheRead": 0.1,
            "cacheWrite": 2.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-audio": {
      "id": "openai/gpt-audio",
      "name": "OpenAI: GPT Audio",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-audio-mini": {
      "id": "openai/gpt-audio-mini",
      "name": "OpenAI: GPT Audio Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-chat-latest": {
      "id": "openai/gpt-chat-latest",
      "name": "OpenAI: GPT Chat Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-oss-120b": {
      "id": "openai/gpt-oss-120b",
      "name": "OpenAI: gpt-oss-120b",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.037,
        "output": 0.17,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "openai/gpt-oss-120b:batch": {
      "id": "openai/gpt-oss-120b:batch",
      "name": "OpenAI: gpt-oss-120b (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0296,
        "output": 0.136,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "openai/gpt-oss-20b": {
      "id": "openai/gpt-oss-20b",
      "name": "OpenAI: gpt-oss-20b",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.018,
        "output": 0.09,
        "cacheRead": 0.009,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "openai/gpt-oss-20b:batch": {
      "id": "openai/gpt-oss-20b:batch",
      "name": "OpenAI: gpt-oss-20b (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.024,
        "output": 0.112,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "openai/gpt-oss-safeguard-20b": {
      "id": "openai/gpt-oss-safeguard-20b",
      "name": "OpenAI: gpt-oss-safeguard-20b",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.3,
        "cacheRead": 0.0375,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 65536
    },
    "openai/o1": {
      "id": "openai/o1",
      "name": "OpenAI: o1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 60,
        "cacheRead": 7.5,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3": {
      "id": "openai/o3",
      "name": "OpenAI: o3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3-mini": {
      "id": "openai/o3-mini",
      "name": "OpenAI: o3 Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.55,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3-mini-high": {
      "id": "openai/o3-mini-high",
      "name": "OpenAI: o3 Mini High",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.55,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3-mini:batch": {
      "id": "openai/o3-mini:batch",
      "name": "OpenAI: o3 Mini (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.55,
        "output": 2.2,
        "cacheRead": 0.275,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3-pro": {
      "id": "openai/o3-pro",
      "name": "OpenAI: o3 Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 20,
        "output": 80,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3:batch": {
      "id": "openai/o3:batch",
      "name": "OpenAI: o3 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 4,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o4-mini": {
      "id": "openai/o4-mini",
      "name": "OpenAI: o4 Mini",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.275,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o4-mini-high": {
      "id": "openai/o4-mini-high",
      "name": "OpenAI: o4 Mini High",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.275,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o4-mini:batch": {
      "id": "openai/o4-mini:batch",
      "name": "OpenAI: o4 Mini (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.55,
        "output": 2.2,
        "cacheRead": 0.1375,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openrouter/auto": {
      "id": "openrouter/auto",
      "name": "Auto Router",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 2000000,
      "maxTokens": 4096
    },
    "openrouter/auto-beta": {
      "id": "openrouter/auto-beta",
      "name": "Auto Router (Beta)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 2000000,
      "maxTokens": 4096
    },
    "openrouter/free": {
      "id": "openrouter/free",
      "name": "Free Models Router",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 4096
    },
    "openrouter/fusion": {
      "id": "openrouter/fusion",
      "name": "OpenRouter: Fusion",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 30000
    },
    "perceptron/perceptron-mk1.5": {
      "id": "perceptron/perceptron-mk1.5",
      "name": "Perceptron: Perceptron Mk1.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 1.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 36864,
      "maxTokens": 8192
    },
    "poolside/laguna-s-2.1": {
      "id": "poolside/laguna-s-2.1",
      "name": "Poolside: Laguna S 2.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.09,
        "output": 0.18,
        "cacheRead": 0.009,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "poolside/laguna-s-2.1:free": {
      "id": "poolside/laguna-s-2.1:free",
      "name": "Poolside: Laguna S 2.1 (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "poolside/laguna-xs-2.1": {
      "id": "poolside/laguna-xs-2.1",
      "name": "Poolside: Laguna XS 2.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.12,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "poolside/laguna-xs-2.1:free": {
      "id": "poolside/laguna-xs-2.1:free",
      "name": "Poolside: Laguna XS 2.1 (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "prism-ml/ternary-bonsai-2-27b": {
      "id": "prism-ml/ternary-bonsai-2-27b",
      "name": "PrismML: Ternary Bonsai 2 27B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.5,
        "cacheRead": 0.0375,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "qwen/qwen-2.5-72b-instruct": {
      "id": "qwen/qwen-2.5-72b-instruct",
      "name": "Qwen2.5 72B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.36,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 32768,
      "maxTokens": 16384
    },
    "qwen/qwen-2.5-7b-instruct": {
      "id": "qwen/qwen-2.5-7b-instruct",
      "name": "Qwen: Qwen2.5 7B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 32768,
      "maxTokens": 29491
    },
    "qwen/qwen-plus": {
      "id": "qwen/qwen-plus",
      "name": "Qwen: Qwen-Plus",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.26,
        "output": 0.78,
        "cacheRead": 0.052,
        "cacheWrite": 0.325,
        "tiers": [
          {
            "inputTokensAbove": 256000,
            "input": 0.78,
            "output": 2.34,
            "cacheRead": 0.156,
            "cacheWrite": 0.975
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 32768
    },
    "qwen/qwen3-14b": {
      "id": "qwen/qwen3-14b",
      "name": "Qwen: Qwen3 14B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.12,
        "output": 0.24,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 40960,
      "maxTokens": 16384
    },
    "qwen/qwen3-235b-a22b-2507": {
      "id": "qwen/qwen3-235b-a22b-2507",
      "name": "Qwen: Qwen3 235B A22B Instruct 2507",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.09,
        "output": 0.55,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 16384
    },
    "qwen/qwen3-235b-a22b-thinking-2507": {
      "id": "qwen/qwen3-235b-a22b-thinking-2507",
      "name": "Qwen: Qwen3 235B A22B Thinking 2507",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.45,
        "output": 3.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "qwen/qwen3-30b-a3b": {
      "id": "qwen/qwen3-30b-a3b",
      "name": "Qwen: Qwen3 30B A3B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.12,
        "output": 0.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 40960,
      "maxTokens": 16384
    },
    "qwen/qwen3-30b-a3b-instruct-2507": {
      "id": "qwen/qwen3-30b-a3b-instruct-2507",
      "name": "Qwen: Qwen3 30B A3B Instruct 2507",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3-32b": {
      "id": "qwen/qwen3-32b",
      "name": "Qwen: Qwen3 32B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.08,
        "output": 0.28,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 40960,
      "maxTokens": 16384
    },
    "qwen/qwen3-coder": {
      "id": "qwen/qwen3-coder",
      "name": "Qwen: Qwen3 Coder 480B A35B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "qwen/qwen3-coder-30b-a3b-instruct": {
      "id": "qwen/qwen3-coder-30b-a3b-instruct",
      "name": "Qwen: Qwen3 Coder 30B A3B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.07,
        "output": 0.28,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3-coder-flash": {
      "id": "qwen/qwen3-coder-flash",
      "name": "Qwen: Qwen3 Coder Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.195,
        "output": 0.975,
        "cacheRead": 0.039,
        "cacheWrite": 0.24375,
        "tiers": [
          {
            "inputTokensAbove": 32000,
            "input": 0.325,
            "output": 1.625,
            "cacheRead": 0.065,
            "cacheWrite": 0.40625
          },
          {
            "inputTokensAbove": 128000,
            "input": 0.52,
            "output": 2.6,
            "cacheRead": 0.104,
            "cacheWrite": 0.65
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen/qwen3-coder-next": {
      "id": "qwen/qwen3-coder-next",
      "name": "Qwen: Qwen3 Coder Next",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.12,
        "output": 0.8,
        "cacheRead": 0.07,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3-next-80b-a3b-instruct": {
      "id": "qwen/qwen3-next-80b-a3b-instruct",
      "name": "Qwen: Qwen3 Next 80B A3B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 1.1,
        "cacheRead": 0.07,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3-next-80b-a3b-thinking": {
      "id": "qwen/qwen3-next-80b-a3b-thinking",
      "name": "Qwen: Qwen3 Next 80B A3B Thinking",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3-vl-235b-a22b-instruct": {
      "id": "qwen/qwen3-vl-235b-a22b-instruct",
      "name": "Qwen: Qwen3 VL 235B A22B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.21,
        "output": 1.9,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "qwen/qwen3-vl-30b-a3b-instruct": {
      "id": "qwen/qwen3-vl-30b-a3b-instruct",
      "name": "Qwen: Qwen3 VL 30B A3B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 16384
    },
    "qwen/qwen3-vl-30b-a3b-thinking": {
      "id": "qwen/qwen3-vl-30b-a3b-thinking",
      "name": "Qwen: Qwen3 VL 30B A3B Thinking",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.29,
        "output": 1,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3-vl-8b-instruct": {
      "id": "qwen/qwen3-vl-8b-instruct",
      "name": "Qwen: Qwen3 VL 8B Instruct",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.75,
        "cacheRead": 0.12,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3.5-122b-a10b": {
      "id": "qwen/qwen3.5-122b-a10b",
      "name": "Qwen: Qwen3.5-122B-A10B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.26,
        "output": 2.08,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "qwen/qwen3.5-27b": {
      "id": "qwen/qwen3.5-27b",
      "name": "Qwen: Qwen3.5-27B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.26,
        "output": 2.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 81920
    },
    "qwen/qwen3.5-35b-a3b": {
      "id": "qwen/qwen3.5-35b-a3b",
      "name": "Qwen: Qwen3.5-35B-A3B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.08,
        "output": 0.75,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "qwen/qwen3.5-397b-a17b": {
      "id": "qwen/qwen3.5-397b-a17b",
      "name": "Qwen: Qwen3.5 397B A17B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.55,
        "output": 3.5,
        "cacheRead": 0.225,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3.5-9b": {
      "id": "qwen/qwen3.5-9b",
      "name": "Qwen: Qwen3.5-9B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.15,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32768
    },
    "qwen/qwen3.5-flash-02-23": {
      "id": "qwen/qwen3.5-flash-02-23",
      "name": "Qwen: Qwen3.5-Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.065,
        "output": 0.26,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen/qwen3.5-plus-02-15": {
      "id": "qwen/qwen3.5-plus-02-15",
      "name": "Qwen: Qwen3.5 Plus 2026-02-15",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.26,
        "output": 1.56,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 256000,
            "input": 0.325,
            "output": 1.95,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen/qwen3.5-plus-20260420": {
      "id": "qwen/qwen3.5-plus-20260420",
      "name": "Qwen: Qwen3.5 Plus 2026-04-20",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.8,
        "cacheRead": 0,
        "cacheWrite": 0.375,
        "tiers": [
          {
            "inputTokensAbove": 256000,
            "input": 0.375,
            "output": 2.25,
            "cacheRead": 0,
            "cacheWrite": 0.46875
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen/qwen3.6-27b": {
      "id": "qwen/qwen3.6-27b",
      "name": "Qwen: Qwen3.6 27B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.32,
        "output": 3.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 81920
    },
    "qwen/qwen3.6-35b-a3b": {
      "id": "qwen/qwen3.6-35b-a3b",
      "name": "Qwen: Qwen3.6 35B A3B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.95,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "qwen/qwen3.6-flash": {
      "id": "qwen/qwen3.6-flash",
      "name": "Qwen: Qwen3.6 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1875,
        "output": 1.125,
        "cacheRead": 0,
        "cacheWrite": 0.234375,
        "tiers": [
          {
            "inputTokensAbove": 256000,
            "input": 0.75,
            "output": 3,
            "cacheRead": 0,
            "cacheWrite": 0.9375
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen/qwen3.6-plus": {
      "id": "qwen/qwen3.6-plus",
      "name": "Qwen: Qwen3.6 Plus",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.325,
        "output": 1.95,
        "cacheRead": 0,
        "cacheWrite": 0.40625,
        "tiers": [
          {
            "inputTokensAbove": 256000,
            "input": 1.3,
            "output": 3.9,
            "cacheRead": 0,
            "cacheWrite": 1.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen/qwen3.7-flash": {
      "id": "qwen/qwen3.7-flash",
      "name": "Qwen: Qwen3.7 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.03,
        "output": 0.13,
        "cacheRead": 0.006,
        "cacheWrite": 0.038,
        "tiers": [
          {
            "inputTokensAbove": 32000,
            "input": 0.1,
            "output": 0.4,
            "cacheRead": 0.02,
            "cacheWrite": 0.125
          },
          {
            "inputTokensAbove": 256000,
            "input": 0.2,
            "output": 0.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen/qwen3.7-max": {
      "id": "qwen/qwen3.7-max",
      "name": "Qwen: Qwen3.7 Max",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.475,
        "output": 4.425,
        "cacheRead": 0.295,
        "cacheWrite": 1.84375
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen/qwen3.7-plus": {
      "id": "qwen/qwen3.7-plus",
      "name": "Qwen: Qwen3.7 Plus",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.32,
        "output": 1.28,
        "cacheRead": 0.064,
        "cacheWrite": 0.4,
        "tiers": [
          {
            "inputTokensAbove": 256000,
            "input": 0.96,
            "output": 3.84,
            "cacheRead": 0.192,
            "cacheWrite": 1.2
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen/qwen3.8-2.4t-a95b": {
      "id": "qwen/qwen3.8-2.4t-a95b",
      "name": "Qwen: Qwen3.8 2.4T A95B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "qwen/qwen3.8-27b": {
      "id": "qwen/qwen3.8-27b",
      "name": "Qwen: Qwen3.8 27B",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.04,
        "output": 2.3,
        "cacheRead": 0.0198,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "qwen/qwen3.8-flash": {
      "id": "qwen/qwen3.8-flash",
      "name": "Qwen: Qwen3.8 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.47,
        "cacheRead": 0.016,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen/qwen3.8-max-0902": {
      "id": "qwen/qwen3.8-max-0902",
      "name": "Qwen: Qwen3.8 Max (0902)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen/qwen3.8-max-prime": {
      "id": "qwen/qwen3.8-max-prime",
      "name": "Qwen: Qwen3.8 Max Prime",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 12,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen/qwen3.8-omni-flash": {
      "id": "qwen/qwen3.8-omni-flash",
      "name": "Qwen: Qwen3.8 Omni Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.47,
        "cacheRead": 0.016,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "rekaai/reka-edge": {
      "id": "rekaai/reka-edge",
      "name": "Reka Edge",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.1,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 16384,
      "maxTokens": 14745
    },
    "relace/relace-search": {
      "id": "relace/relace-search",
      "name": "Relace: Relace Search",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 128000
    },
    "sakana/fugu-max": {
      "id": "sakana/fugu-max",
      "name": "Sakana: Fugu Max",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "sakana/fugu-ultra": {
      "id": "sakana/fugu-ultra",
      "name": "Sakana: Fugu Ultra",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "sakana/fugu-ultra-v2": {
      "id": "sakana/fugu-ultra-v2",
      "name": "Sakana: Fugu Ultra v2",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "sakana/sakana-namazu": {
      "id": "sakana/sakana-namazu",
      "name": "Sakana: Sakana Namazu",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "stepfun/step-3.5-flash": {
      "id": "stepfun/step-3.5-flash",
      "name": "StepFun: Step 3.5 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "stepfun/step-3.7-flash": {
      "id": "stepfun/step-3.7-flash",
      "name": "StepFun: Step 3.7 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.15,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 230400
    },
    "stepfun/step-5-preview": {
      "id": "stepfun/step-5-preview",
      "name": "StepFun: Step 5 Preview",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 2.7,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "tencent/hy3": {
      "id": "tencent/hy3",
      "name": "Tencent: Hy3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0825,
        "output": 0.33,
        "cacheRead": 0.020625,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 128000
    },
    "tencent/hy3-preview": {
      "id": "tencent/hy3-preview",
      "name": "Tencent: Hy3 preview",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.18,
        "output": 0.6,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 235929
    },
    "tencent/hy4-preview": {
      "id": "tencent/hy4-preview",
      "name": "Tencent: Hy4 preview",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.7506,
        "output": 2.2509,
        "cacheRead": 0.0378,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 64000
    },
    "thinkingmachines/inkling": {
      "id": "thinkingmachines/inkling",
      "name": "Thinking Machines: Inkling",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 4.05,
        "cacheRead": 0.17,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 471859
    },
    "thinkingmachines/inkling-small": {
      "id": "thinkingmachines/inkling-small",
      "name": "Thinking Machines: Inkling Small",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.45,
        "output": 1.2,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 262144
    },
    "thinkingmachines/inkling-small:free": {
      "id": "thinkingmachines/inkling-small:free",
      "name": "Thinking Machines: Inkling Small (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "thinkingmachines/inkling:free": {
      "id": "thinkingmachines/inkling:free",
      "name": "Thinking Machines: Inkling (free)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "typesafe/jev-router": {
      "id": "typesafe/jev-router",
      "name": "TypeSafe: Jev Router",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 4096
    },
    "unbiased/pareto": {
      "id": "unbiased/pareto",
      "name": "Pareto",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 7.5,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "unbiased/pareto-26.10-preview": {
      "id": "unbiased/pareto-26.10-preview",
      "name": "Pareto 26.10 Preview",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.8,
        "output": 3.2,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "upstage/solar-mini4": {
      "id": "upstage/solar-mini4",
      "name": "Upstage: Solar Mini 4",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.2,
        "cacheRead": 0.005,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 131072
    },
    "upstage/solar-pro-3": {
      "id": "upstage/solar-pro-3",
      "name": "Upstage: Solar Pro 3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "upstage/solar-pro4": {
      "id": "upstage/solar-pro4",
      "name": "Upstage: Solar Pro 4",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.09,
        "output": 0.36,
        "cacheRead": 0.018,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 131072
    },
    "x-ai/grok-4.20": {
      "id": "x-ai/grok-4.20",
      "name": "SpaceXAI: Grok 4.20",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 2000000,
      "maxTokens": 1800000
    },
    "x-ai/grok-4.3": {
      "id": "x-ai/grok-4.3",
      "name": "SpaceXAI: Grok 4.3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 900000
    },
    "x-ai/grok-4.3:batch": {
      "id": "x-ai/grok-4.3:batch",
      "name": "SpaceXAI: Grok 4.3 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 2,
        "cacheRead": 0.16,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2,
            "output": 4,
            "cacheRead": 0.32,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 900000
    },
    "x-ai/grok-4.5": {
      "id": "x-ai/grok-4.5",
      "name": "SpaceXAI: Grok 4.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.3,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 0.6,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 450000
    },
    "x-ai/grok-4.6": {
      "id": "x-ai/grok-4.6",
      "name": "SpaceXAI: Grok 4.6",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 450000
    },
    "x-ai/grok-4.7": {
      "id": "x-ai/grok-4.7",
      "name": "SpaceXAI: Grok 4.7",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 450000
    },
    "x-ai/grok-build-0.1": {
      "id": "x-ai/grok-build-0.1",
      "name": "SpaceXAI: Grok Build 0.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 2,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2,
            "output": 4,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 256000,
      "maxTokens": 230400
    },
    "xiaomi/mimo-v2.5": {
      "id": "xiaomi/mimo-v2.5",
      "name": "Xiaomi: MiMo-V2.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.0028,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "xiaomi/mimo-v2.5-pro": {
      "id": "xiaomi/mimo-v2.5-pro",
      "name": "Xiaomi: MiMo-V2.5-Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.0036,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "xiaomi/mimo-v2.6-flash": {
      "id": "xiaomi/mimo-v2.6-flash",
      "name": "Xiaomi: MiMo-V2.6-Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.0028,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "xiaomi/mimo-v2.6-pro": {
      "id": "xiaomi/mimo-v2.6-pro",
      "name": "Xiaomi: MiMo-V2.6-Pro",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.0036,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "xiaomi/mimo-v2.6-pro-ultraspeed": {
      "id": "xiaomi/mimo-v2.6-pro-ultraspeed",
      "name": "Xiaomi: MiMo-V2.6-Pro-UltraSpeed",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4.35,
        "output": 8.7,
        "cacheRead": 0.036,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "z-ai/glm-4.5": {
      "id": "z-ai/glm-4.5",
      "name": "Z.ai: GLM 4.5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 98304
    },
    "z-ai/glm-4.5-air": {
      "id": "z-ai/glm-4.5-air",
      "name": "Z.ai: GLM 4.5 Air",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.13,
        "output": 0.85,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 98304
    },
    "z-ai/glm-4.5v": {
      "id": "z-ai/glm-4.5v",
      "name": "Z.ai: GLM 4.5V",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 1.8,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 65536,
      "maxTokens": 16384
    },
    "z-ai/glm-4.6": {
      "id": "z-ai/glm-4.6",
      "name": "Z.ai: GLM 4.6",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 2,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 131072
    },
    "z-ai/glm-4.6v": {
      "id": "z-ai/glm-4.6v",
      "name": "Z.ai: GLM 4.6V",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 0.9,
        "cacheRead": 0.055,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 32768
    },
    "z-ai/glm-4.7": {
      "id": "z-ai/glm-4.7",
      "name": "Z.ai: GLM 4.7",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 131072
    },
    "z-ai/glm-4.7-flash": {
      "id": "z-ai/glm-4.7-flash",
      "name": "Z.ai: GLM 4.7 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0605,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 117964
    },
    "z-ai/glm-5": {
      "id": "z-ai/glm-5",
      "name": "Z.ai: GLM 5",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 1.9,
        "cacheRead": 0.119,
        "cacheWrite": 0
      },
      "contextWindow": 198000,
      "maxTokens": 128000
    },
    "z-ai/glm-5-turbo": {
      "id": "z-ai/glm-5-turbo",
      "name": "Z.ai: GLM 5 Turbo",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.2,
        "output": 4,
        "cacheRead": 0.24,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 131072
    },
    "z-ai/glm-5.1": {
      "id": "z-ai/glm-5.1",
      "name": "Z.ai: GLM 5.1",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.966,
        "output": 3.036,
        "cacheRead": 0.1794,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 128000
    },
    "z-ai/glm-5.2": {
      "id": "z-ai/glm-5.2",
      "name": "Z.ai: GLM 5.2",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 7,
        "cacheRead": 0.059,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "z-ai/glm-5.3": {
      "id": "z-ai/glm-5.3",
      "name": "Z.ai: GLM 5.3",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.079,
        "output": 4.8,
        "cacheRead": 0.059,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "z-ai/glm-5.3-flash": {
      "id": "z-ai/glm-5.3-flash",
      "name": "Z.ai: GLM 5.3 Flash",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.0232,
        "output": 1.2,
        "cacheRead": 0.0232,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "z-ai/glm-5.3-flash:batch": {
      "id": "z-ai/glm-5.3-flash:batch",
      "name": "Z.ai: GLM 5.3 Flash (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.2,
        "cacheRead": 0.012,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "z-ai/glm-5.3-flashx": {
      "id": "z-ai/glm-5.3-flashx",
      "name": "Z.ai: GLM 5.3 FlashX",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.37,
        "output": 1.25,
        "cacheRead": 0.09,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "z-ai/glm-5.3-prime": {
      "id": "z-ai/glm-5.3-prime",
      "name": "Z.ai: GLM 5.3 Prime",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.8,
        "output": 8.8,
        "cacheRead": 0.56,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "z-ai/glm-5.3:batch": {
      "id": "z-ai/glm-5.3:batch",
      "name": "Z.ai: GLM 5.3 (batch)",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.45,
        "output": 2,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "z-ai/glm-5v-turbo": {
      "id": "z-ai/glm-5v-turbo",
      "name": "Z.ai: GLM 5V Turbo",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.2,
        "output": 4,
        "cacheRead": 0.24,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 131072
    },
    "~anthropic/claude-fable-latest": {
      "id": "~anthropic/claude-fable-latest",
      "name": "Anthropic: Claude Fable Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 0.25,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "~anthropic/claude-haiku-latest": {
      "id": "~anthropic/claude-haiku-latest",
      "name": "Anthropic: Claude Haiku Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.5,
            "output": 2.5,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "~anthropic/claude-opus-latest": {
      "id": "~anthropic/claude-opus-latest",
      "name": "Anthropic: Claude Opus Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "~anthropic/claude-sonnet-latest": {
      "id": "~anthropic/claude-sonnet-latest",
      "name": "Anthropic: Claude Sonnet Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "~deepseek/deepseek-flash-latest": {
      "id": "~deepseek/deepseek-flash-latest",
      "name": "DeepSeek: DeepSeek Flash Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.0336,
        "output": 1.188,
        "cacheRead": 0.0336,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "~deepseek/deepseek-pro-latest": {
      "id": "~deepseek/deepseek-pro-latest",
      "name": "DeepSeek: DeepSeek Pro Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.24948,
        "output": 0.74844,
        "cacheRead": 0.007938,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 393216
    },
    "~deepseek/deepseek-v4-flash-latest": {
      "id": "~deepseek/deepseek-v4-flash-latest",
      "name": "DeepSeek: DeepSeek V4 Flash Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.0128,
        "output": 0.768,
        "cacheRead": 0.0128,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "~google/gemini-flash-latest": {
      "id": "~google/gemini-flash-latest",
      "name": "Google: Gemini Flash Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0.041667
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "~google/gemini-pro-latest": {
      "id": "~google/gemini-pro-latest",
      "name": "Google: Gemini Pro Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 0.375,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 0.375
          }
        ]
      },
      "contextWindow": 1048576,
      "maxTokens": 65536
    },
    "~moonshotai/kimi-latest": {
      "id": "~moonshotai/kimi-latest",
      "name": "MoonshotAI: Kimi Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.73,
        "output": 10,
        "cacheRead": 0.55,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "~openai/gpt-astra-latest": {
      "id": "~openai/gpt-astra-latest",
      "name": "OpenAI: GPT Astra Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 20,
            "output": 75,
            "cacheRead": 2,
            "cacheWrite": 25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "~openai/gpt-luna-latest": {
      "id": "~openai/gpt-luna-latest",
      "name": "OpenAI: GPT Luna Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "~openai/gpt-mini-latest": {
      "id": "~openai/gpt-mini-latest",
      "name": "OpenAI: GPT Mini Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "~openai/gpt-sol-latest": {
      "id": "~openai/gpt-sol-latest",
      "name": "OpenAI: GPT Sol Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.2,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "~openai/gpt-terra-latest": {
      "id": "~openai/gpt-terra-latest",
      "name": "OpenAI: GPT Terra Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "~x-ai/grok-latest": {
      "id": "~x-ai/grok-latest",
      "name": "xAI: Grok Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 450000
    },
    "~z-ai/glm-flash-latest": {
      "id": "~z-ai/glm-flash-latest",
      "name": "Z.ai: GLM Flash Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.0232,
        "output": 1.2,
        "cacheRead": 0.0232,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    },
    "~z-ai/glm-latest": {
      "id": "~z-ai/glm-latest",
      "name": "Z.ai: GLM Latest",
      "protocol": "openai-completions",
      "provider": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.055,
        "output": 5,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 943718
    }
  },
  "qwen-token-plan": {
    "MiniMax-M2.5": {
      "id": "MiniMax-M2.5",
      "name": "MiniMax-M2.5",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 196608,
      "maxTokens": 32768
    },
    "deepseek-v3.2": {
      "id": "deepseek-v3.2",
      "name": "DeepSeek V3.2",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 65536
    },
    "deepseek-v4-flash": {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-flash-0731": {
      "id": "deepseek-v4-flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro": {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro-0813": {
      "id": "deepseek-v4-pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4.1-flash": {
      "id": "deepseek-v4.1-flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "glm-5": {
      "id": "glm-5",
      "name": "GLM-5",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 16384
    },
    "glm-5.1": {
      "id": "glm-5.1",
      "name": "GLM-5.1",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 128000
    },
    "glm-5.2": {
      "id": "glm-5.2",
      "name": "GLM-5.2",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3": {
      "id": "glm-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "kimi-k2.5": {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 98304
    },
    "kimi-k2.6": {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k2.7-code": {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "qwen3.6-flash": {
      "id": "qwen3.6-flash",
      "name": "Qwen3.6 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.6-plus": {
      "id": "qwen3.6-plus",
      "name": "Qwen3.6 Plus",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.7-max": {
      "id": "qwen3.7-max",
      "name": "Qwen3.7 Max",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.7-plus": {
      "id": "qwen3.7-plus",
      "name": "Qwen3.7 Plus",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.8-flash": {
      "id": "qwen3.8-flash",
      "name": "Qwen3.8 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.8-max": {
      "id": "qwen3.8-max",
      "name": "Qwen3.8 Max",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    }
  },
  "qwen-token-plan-cn": {
    "MiniMax-M2.5": {
      "id": "MiniMax-M2.5",
      "name": "MiniMax-M2.5",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 196608,
      "maxTokens": 32768
    },
    "deepseek-v3.2": {
      "id": "deepseek-v3.2",
      "name": "DeepSeek V3.2",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 65536
    },
    "deepseek-v4-flash": {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-flash-0731": {
      "id": "deepseek-v4-flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro": {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro-0813": {
      "id": "deepseek-v4-pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4.1-flash": {
      "id": "deepseek-v4.1-flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "glm-5": {
      "id": "glm-5",
      "name": "GLM-5",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 16384
    },
    "glm-5.1": {
      "id": "glm-5.1",
      "name": "GLM-5.1",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 202752,
      "maxTokens": 128000
    },
    "glm-5.2": {
      "id": "glm-5.2",
      "name": "GLM-5.2",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3": {
      "id": "glm-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "kimi-k2.5": {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 98304
    },
    "kimi-k2.6": {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "kimi-k2.7-code": {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "qwen3.6-flash": {
      "id": "qwen3.6-flash",
      "name": "Qwen3.6 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.6-plus": {
      "id": "qwen3.6-plus",
      "name": "Qwen3.6 Plus",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.7-max": {
      "id": "qwen3.7-max",
      "name": "Qwen3.7 Max",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.7-plus": {
      "id": "qwen3.7-plus",
      "name": "Qwen3.7 Plus",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.8-flash": {
      "id": "qwen3.8-flash",
      "name": "Qwen3.8 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.8-max": {
      "id": "qwen3.8-max",
      "name": "Qwen3.8 Max",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-cn",
      "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    }
  },
  "qwen-token-plan-individual": {
    "deepseek-v4-flash-0731": {
      "id": "deepseek-v4-flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro": {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek-v4-pro-0813": {
      "id": "deepseek-v4-pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "glm-5.2": {
      "id": "glm-5.2",
      "name": "GLM-5.2",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.6-flash": {
      "id": "qwen3.6-flash",
      "name": "Qwen3.6 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.7-max": {
      "id": "qwen3.7-max",
      "name": "Qwen3.7 Max",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.7-plus": {
      "id": "qwen3.7-plus",
      "name": "Qwen3.7 Plus",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65536
    },
    "qwen3.8-flash": {
      "id": "qwen3.8-flash",
      "name": "Qwen3.8 Flash",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "qwen3.8-max": {
      "id": "qwen3.8-max",
      "name": "Qwen3.8 Max",
      "protocol": "openai-completions",
      "provider": "qwen-token-plan-individual",
      "baseUrl": "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    }
  },
  "together": {
    "MiniMaxAI/MiniMax-M2.7": {
      "id": "MiniMaxAI/MiniMax-M2.7",
      "name": "MiniMax-M2.7",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 196608,
      "maxTokens": 131072
    },
    "MiniMaxAI/MiniMax-M3": {
      "id": "MiniMaxAI/MiniMax-M3",
      "name": "MiniMax-M3",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 250000
    },
    "Qwen/Qwen2.5-7B-Instruct-Turbo": {
      "id": "Qwen/Qwen2.5-7B-Instruct-Turbo",
      "name": "Qwen 2.5 7B Instruct Turbo",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 0.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 32768,
      "maxTokens": 32768
    },
    "Qwen/Qwen3.5-9B": {
      "id": "Qwen/Qwen3.5-9B",
      "name": "Qwen3.5 9B",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.17,
        "output": 0.25,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 65536
    },
    "Qwen/Qwen3.6-Plus": {
      "id": "Qwen/Qwen3.6-Plus",
      "name": "Qwen3.6 Plus",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 500000
    },
    "Qwen/Qwen3.7-Max": {
      "id": "Qwen/Qwen3.7-Max",
      "name": "Qwen3.7 Max",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.25,
        "output": 3.75,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 500000
    },
    "deepseek-ai/DeepSeek-V4-Flash-0731": {
      "id": "deepseek-ai/DeepSeek-V4-Flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 384000
    },
    "deepseek-ai/DeepSeek-V4-Pro-0813": {
      "id": "deepseek-ai/DeepSeek-V4-Pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.32,
        "output": 3.96,
        "cacheRead": 0.13,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 384000
    },
    "deepseek-ai/DeepSeek-V4.1-Flash": {
      "id": "deepseek-ai/DeepSeek-V4.1-Flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.006,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 384000
    },
    "meta-llama/Llama-3.3-70B-Instruct-Turbo": {
      "id": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "name": "Llama 3.3 70B",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.04,
        "output": 1.04,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "moonshotai/Kimi-K3": {
      "id": "moonshotai/Kimi-K3",
      "name": "Kimi K3",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "nvidia/nemotron-3-ultra-550b-a55b": {
      "id": "nvidia/nemotron-3-ultra-550b-a55b",
      "name": "Nemotron 3 Ultra 550B A55B",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 3.6,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 512300,
      "maxTokens": 512300
    },
    "openai/gpt-oss-120b": {
      "id": "openai/gpt-oss-120b",
      "name": "GPT OSS 120B",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "thinkingmachines/Inkling": {
      "id": "thinkingmachines/Inkling",
      "name": "Inkling",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 4.05,
        "cacheRead": 0.17,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 131072
    },
    "zai-org/GLM-5.2": {
      "id": "zai-org/GLM-5.2",
      "name": "GLM-5.2",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1048575,
      "maxTokens": 164000
    },
    "zai-org/GLM-5.3": {
      "id": "zai-org/GLM-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "zai-org/GLM-5.3-Flash": {
      "id": "zai-org/GLM-5.3-Flash",
      "name": "GLM-5.3-Flash",
      "protocol": "openai-completions",
      "provider": "together",
      "baseUrl": "https://api.together.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1048575,
      "maxTokens": 400000
    }
  },
  "vercel-ai-gateway": {
    "alibaba/qwen-3-14b": {
      "id": "alibaba/qwen-3-14b",
      "name": "Qwen3-14B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.12,
        "output": 0.24,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 40960,
      "maxTokens": 16384
    },
    "alibaba/qwen-3-235b": {
      "id": "alibaba/qwen-3-235b",
      "name": "Qwen3 235B A22B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.22,
        "output": 0.88,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 16384
    },
    "alibaba/qwen-3-30b": {
      "id": "alibaba/qwen-3-30b",
      "name": "Qwen3-30B-A3B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.12,
        "output": 0.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 40960,
      "maxTokens": 16384
    },
    "alibaba/qwen-3-32b": {
      "id": "alibaba/qwen-3-32b",
      "name": "Qwen 3 32B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "alibaba/qwen3-coder": {
      "id": "alibaba/qwen3-coder",
      "name": "Qwen3 Coder 480B A35B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.22,
        "output": 1.8,
        "cacheRead": 0.022,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "alibaba/qwen3-coder-30b-a3b": {
      "id": "alibaba/qwen3-coder-30b-a3b",
      "name": "Qwen 3 Coder 30B A3B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 8192
    },
    "alibaba/qwen3-coder-next": {
      "id": "alibaba/qwen3-coder-next",
      "name": "Qwen3 Coder Next",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "alibaba/qwen3-max-thinking": {
      "id": "alibaba/qwen3-max-thinking",
      "name": "Qwen 3 Max Thinking",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.2,
        "output": 6,
        "cacheRead": 0.24,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 32000,
            "input": 2.4,
            "output": 12,
            "cacheRead": 0.48,
            "cacheWrite": 0
          },
          {
            "inputTokensAbove": 128000,
            "input": 3,
            "output": 15,
            "cacheRead": 0.6,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 256000,
      "maxTokens": 65536
    },
    "alibaba/qwen3-next-80b-a3b-instruct": {
      "id": "alibaba/qwen3-next-80b-a3b-instruct",
      "name": "Qwen3 Next 80B A3B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262114,
      "maxTokens": 262114
    },
    "alibaba/qwen3-next-80b-a3b-thinking": {
      "id": "alibaba/qwen3-next-80b-a3b-thinking",
      "name": "Qwen3 Next 80B A3B Thinking",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 1.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "alibaba/qwen3-vl-instruct": {
      "id": "alibaba/qwen3-vl-instruct",
      "name": "Qwen3 VL 235B A22B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.88,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "alibaba/qwen3.5-flash": {
      "id": "alibaba/qwen3.5-flash",
      "name": "Qwen 3.5 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0.01,
        "cacheWrite": 0.125
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "alibaba/qwen3.5-plus": {
      "id": "alibaba/qwen3.5-plus",
      "name": "Qwen 3.5 Plus",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 2.4,
        "cacheRead": 0.04,
        "cacheWrite": 0.5,
        "tiers": [
          {
            "inputTokensAbove": 256000,
            "input": 0.5,
            "output": 3,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "alibaba/qwen3.6-27b": {
      "id": "alibaba/qwen3.6-27b",
      "name": "Qwen 3.6 27B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 3.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "alibaba/qwen3.6-plus": {
      "id": "alibaba/qwen3.6-plus",
      "name": "Qwen 3.6 Plus",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 3,
        "cacheRead": 0.05,
        "cacheWrite": 0.625,
        "tiers": [
          {
            "inputTokensAbove": 255999,
            "input": 2,
            "output": 6,
            "cacheRead": 0.2,
            "cacheWrite": 2.5
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "alibaba/qwen3.7-flash": {
      "id": "alibaba/qwen3.7-flash",
      "name": "Qwen 3.7 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.03,
        "output": 0.13,
        "cacheRead": 0.006,
        "cacheWrite": 0.038,
        "tiers": [
          {
            "inputTokensAbove": 31999,
            "input": 0.1,
            "output": 0.4,
            "cacheRead": 0.02,
            "cacheWrite": 0.125
          },
          {
            "inputTokensAbove": 255999,
            "input": 0.2,
            "output": 0.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 991000,
      "maxTokens": 64000
    },
    "alibaba/qwen3.7-max": {
      "id": "alibaba/qwen3.7-max",
      "name": "Qwen 3.7 Max",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.5,
        "output": 7.5,
        "cacheRead": 0.5,
        "cacheWrite": 3.125
      },
      "contextWindow": 991000,
      "maxTokens": 64000
    },
    "alibaba/qwen3.7-plus": {
      "id": "alibaba/qwen3.7-plus",
      "name": "Qwen 3.7 Plus",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 1.6,
        "cacheRead": 0.08,
        "cacheWrite": 0.5,
        "tiers": [
          {
            "inputTokensAbove": 255999,
            "input": 1.2,
            "output": 4.8,
            "cacheRead": 0.24,
            "cacheWrite": 1.5
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "alibaba/qwen3.8-2.4t-a95b": {
      "id": "alibaba/qwen3.8-2.4t-a95b",
      "name": "Qwen3.8 2.4T A95B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 128000
    },
    "alibaba/qwen3.8-27b": {
      "id": "alibaba/qwen3.8-27b",
      "name": "Qwen3.8 27B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 3,
        "cacheRead": 0.1,
        "cacheWrite": 0.625
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "alibaba/qwen3.8-flash": {
      "id": "alibaba/qwen3.8-flash",
      "name": "Qwen 3.8 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.47,
        "cacheRead": 0.016,
        "cacheWrite": 0.2
      },
      "contextWindow": 991000,
      "maxTokens": 128000
    },
    "alibaba/qwen3.8-max": {
      "id": "alibaba/qwen3.8-max",
      "name": "Qwen 3.8 Max",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 128000
    },
    "alibaba/qwen3.8-max-0902": {
      "id": "alibaba/qwen3.8-max-0902",
      "name": "Qwen3.8 Max 0902",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 2.5
      },
      "contextWindow": 991000,
      "maxTokens": 128000
    },
    "alibaba/qwen3.8-max-prime": {
      "id": "alibaba/qwen3.8-max-prime",
      "name": "Qwen 3.8 Max Prime",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 12,
        "cacheRead": 0.5,
        "cacheWrite": 5
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "alibaba/qwen3.8-omni-flash": {
      "id": "alibaba/qwen3.8-omni-flash",
      "name": "Qwen 3.8 Omni Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.47,
        "cacheRead": 0.016,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "amazon/nova-2-lite": {
      "id": "amazon/nova-2-lite",
      "name": "Nova 2 Lite",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 2.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "amazon/nova-lite": {
      "id": "amazon/nova-lite",
      "name": "Nova Lite",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.24,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 300000,
      "maxTokens": 8192
    },
    "amazon/nova-micro": {
      "id": "amazon/nova-micro",
      "name": "Nova Micro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.035,
        "output": 0.14,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "amazon/nova-pro": {
      "id": "amazon/nova-pro",
      "name": "Nova Pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.8,
        "output": 3.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 300000,
      "maxTokens": 8192
    },
    "anthropic/claude-fable-5": {
      "id": "anthropic/claude-fable-5",
      "name": "Claude Fable 5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-fable-5.1": {
      "id": "anthropic/claude-fable-5.1",
      "name": "Claude Fable 5.1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 0.25,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-haiku-4.5": {
      "id": "anthropic/claude-haiku-4.5",
      "name": "Claude Haiku 4.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "anthropic/claude-haiku-5.5": {
      "id": "anthropic/claude-haiku-5.5",
      "name": "Claude Haiku 5.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 100000,
            "input": 0.5,
            "output": 2.5,
            "cacheRead": 0.05,
            "cacheWrite": 0.625
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.5": {
      "id": "anthropic/claude-opus-4.5",
      "name": "Claude Opus 4.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 200000,
      "maxTokens": 64000
    },
    "anthropic/claude-opus-4.6": {
      "id": "anthropic/claude-opus-4.6",
      "name": "Claude Opus 4.6",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.7": {
      "id": "anthropic/claude-opus-4.7",
      "name": "Claude Opus 4.7",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.8": {
      "id": "anthropic/claude-opus-4.8",
      "name": "Claude Opus 4.8",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-4.8-fast": {
      "id": "anthropic/claude-opus-4.8-fast",
      "name": "Claude Opus 4.8 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-5": {
      "id": "anthropic/claude-opus-5",
      "name": "Claude Opus 5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-5-fast": {
      "id": "anthropic/claude-opus-5-fast",
      "name": "Claude Opus 5 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-5.5": {
      "id": "anthropic/claude-opus-5.5",
      "name": "Claude Opus 5.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-opus-5.5-fast": {
      "id": "anthropic/claude-opus-5.5-fast",
      "name": "Claude Opus 5.5 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 8,
        "output": 40,
        "cacheRead": 0.4,
        "cacheWrite": 10
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-4": {
      "id": "anthropic/claude-sonnet-4",
      "name": "Claude Sonnet 4",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 6,
            "output": 22.5,
            "cacheRead": 0.6,
            "cacheWrite": 7.5
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "anthropic/claude-sonnet-4.5": {
      "id": "anthropic/claude-sonnet-4.5",
      "name": "Claude Sonnet 4.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 6,
            "output": 22.5,
            "cacheRead": 0.6,
            "cacheWrite": 7.5
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "anthropic/claude-sonnet-4.6": {
      "id": "anthropic/claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 3.75
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-5": {
      "id": "anthropic/claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "anthropic/claude-sonnet-5.5": {
      "id": "anthropic/claude-sonnet-5.5",
      "name": "Claude Sonnet 5.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "arcee-ai/trinity-large-thinking": {
      "id": "arcee-ai/trinity-large-thinking",
      "name": "Trinity Large Thinking",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.8,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262100,
      "maxTokens": 80000
    },
    "bytedance/seed-1.6": {
      "id": "bytedance/seed-1.6",
      "name": "Seed 1.6",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.05,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 128000,
            "input": 0.5,
            "output": 4,
            "cacheRead": 0.05,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 256000,
      "maxTokens": 32000
    },
    "bytedance/seed-1.8": {
      "id": "bytedance/seed-1.8",
      "name": "Bytedance Seed 1.8",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.05,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 128000,
            "input": 0.5,
            "output": 4,
            "cacheRead": 0.05,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 256000,
      "maxTokens": 64000
    },
    "bytedance/seed-2.1-turbo": {
      "id": "bytedance/seed-2.1-turbo",
      "name": "Seed 2.1 Turbo",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 2.5,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "callstack/apex": {
      "id": "callstack/apex",
      "name": "Apex",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 3,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "cohere/command-a": {
      "id": "cohere/command-a",
      "name": "Command A",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 8000
    },
    "deepseek/deepseek-r1": {
      "id": "deepseek/deepseek-r1",
      "name": "DeepSeek-R1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.35,
        "output": 5.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "deepseek/deepseek-v3.1": {
      "id": "deepseek/deepseek-v3.1",
      "name": "DeepSeek V3.1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.95,
        "cacheRead": 0.13,
        "cacheWrite": 0
      },
      "contextWindow": 163840,
      "maxTokens": 128000
    },
    "deepseek/deepseek-v3.2": {
      "id": "deepseek/deepseek-v3.2",
      "name": "DeepSeek V3.2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.62,
        "output": 1.85,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8000
    },
    "deepseek/deepseek-v3.2-thinking": {
      "id": "deepseek/deepseek-v3.2-thinking",
      "name": "DeepSeek V3.2 Thinking",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.62,
        "output": 1.85,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8000
    },
    "deepseek/deepseek-v4-flash": {
      "id": "deepseek/deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.13,
        "output": 0.26,
        "cacheRead": 0.028,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek/deepseek-v4-flash-0731": {
      "id": "deepseek/deepseek-v4-flash-0731",
      "name": "DeepSeek V4 Flash 0731",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.076,
        "output": 0.153,
        "cacheRead": 0.014,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek/deepseek-v4-flash-vision-exp": {
      "id": "deepseek/deepseek-v4-flash-vision-exp",
      "name": "DeepSeek V4 Flash Vision Exp",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2156,
        "output": 0.6468,
        "cacheRead": 0.0068,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "deepseek/deepseek-v4-pro": {
      "id": "deepseek/deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.66,
        "output": 1.98,
        "cacheRead": 0.022,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek/deepseek-v4-pro-0813": {
      "id": "deepseek/deepseek-v4-pro-0813",
      "name": "DeepSeek V4 Pro 0813",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.66,
        "output": 1.98,
        "cacheRead": 0.066,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 384000
    },
    "deepseek/deepseek-v4.1-flash": {
      "id": "deepseek/deepseek-v4.1-flash",
      "name": "DeepSeek V4.1 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.007,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 32768
    },
    "deepseek/deepseek-v4.1-flash-fast": {
      "id": "deepseek/deepseek-v4.1-flash-fast",
      "name": "DeepSeek V4.1 Flash Fast",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.014,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 32768
    },
    "fireworks/ember-1": {
      "id": "fireworks/ember-1",
      "name": "Ember-1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "google/gemini-2.5-flash": {
      "id": "google/gemini-2.5-flash",
      "name": "Gemini 2.5 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 2.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65535
    },
    "google/gemini-2.5-flash-lite": {
      "id": "google/gemini-2.5-flash-lite",
      "name": "Gemini 2.5 Flash Lite",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 65535
    },
    "google/gemini-2.5-pro": {
      "id": "google/gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 15,
            "cacheRead": 0.25,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1048576,
      "maxTokens": 65535
    },
    "google/gemini-3-flash": {
      "id": "google/gemini-3-flash",
      "name": "Gemini 3 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 3,
        "cacheRead": 0.05,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 0.5,
            "output": 3,
            "cacheRead": 0.05,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 65000
    },
    "google/gemini-3.1-flash-lite": {
      "id": "google/gemini-3.1-flash-lite",
      "name": "Gemini 3.1 Flash Lite",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 1.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65000
    },
    "google/gemini-3.1-pro-preview": {
      "id": "google/gemini-3.1-pro-preview",
      "name": "Gemini 3.1 Pro Preview",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "google/gemini-3.5-flash": {
      "id": "google/gemini-3.5-flash",
      "name": "Gemini 3.5 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 9,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "google/gemini-3.5-flash-lite": {
      "id": "google/gemini-3.5-flash-lite",
      "name": "Gemini 3.5 Flash Lite",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 2.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65000
    },
    "google/gemini-3.6-flash": {
      "id": "google/gemini-3.6-flash",
      "name": "Gemini 3.6 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 64000
    },
    "google/gemini-3.7-flash": {
      "id": "google/gemini-3.7-flash",
      "name": "Gemini 3.7 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65535
    },
    "google/gemini-3.8-flash": {
      "id": "google/gemini-3.8-flash",
      "name": "Gemini 3.8 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 3.75,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65535
    },
    "google/gemma-4-26b-a4b-it": {
      "id": "google/gemma-4-26b-a4b-it",
      "name": "Google Gemma 4 26B A4B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "google/gemma-4-31b-it": {
      "id": "google/gemma-4-31b-it",
      "name": "Gemma 4 31B IT",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "inception/mercury-2": {
      "id": "inception/mercury-2",
      "name": "Mercury 2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 0.75,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 128000
    },
    "inception/mercury-2.5": {
      "id": "inception/mercury-2.5",
      "name": "Mercury 2.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.04,
        "output": 0.15,
        "cacheRead": 0.004,
        "cacheWrite": 0
      },
      "contextWindow": 260000,
      "maxTokens": 65536
    },
    "inception/mercury-coder-small": {
      "id": "inception/mercury-coder-small",
      "name": "Mercury Coder Small Beta",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.25,
        "output": 1,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 32000,
      "maxTokens": 16384
    },
    "inclusionai/ling-3.0-flash": {
      "id": "inclusionai/ling-3.0-flash",
      "name": "Ling 3.0 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.021,
        "output": 0.063,
        "cacheRead": 0.0042,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32000
    },
    "inclusionai/ling-3.0-flash-fin": {
      "id": "inclusionai/ling-3.0-flash-fin",
      "name": "Ling 3.0 Flash Fin",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.22,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32000
    },
    "inclusionai/ling-3.0-flash-sante": {
      "id": "inclusionai/ling-3.0-flash-sante",
      "name": "Ling 3.0 Flash Sante",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.22,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32000
    },
    "inclusionai/ling-3.0-flash-vl": {
      "id": "inclusionai/ling-3.0-flash-vl",
      "name": "Ling 3.0 Flash VL",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.075,
        "output": 0.22,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32000
    },
    "inclusionai/ling-3.1-flash": {
      "id": "inclusionai/ling-3.1-flash",
      "name": "Ling 3.1 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "inclusionai/ling-3.1-flash-free": {
      "id": "inclusionai/ling-3.1-flash-free",
      "name": "Ling 3.1 Flash (Free)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "interfaze/interfaze-beta": {
      "id": "interfaze/interfaze-beta",
      "name": "Interfaze Beta",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 3.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 32000
    },
    "meituan/longcat-2.5-preview": {
      "id": "meituan/longcat-2.5-preview",
      "name": "LongCat 2.5 Preview",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.006,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "meta/llama-3.1-70b": {
      "id": "meta/llama-3.1-70b",
      "name": "Llama 3.1 70B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.72,
        "output": 0.72,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "meta/llama-3.1-8b": {
      "id": "meta/llama-3.1-8b",
      "name": "Llama 3.1 8B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.22,
        "output": 0.22,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "meta/llama-3.3-70b": {
      "id": "meta/llama-3.3-70b",
      "name": "Llama 3.3 70B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.72,
        "output": 0.72,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "meta/llama-4-maverick": {
      "id": "meta/llama-4-maverick",
      "name": "Llama 4 Maverick 17B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.24,
        "output": 0.97,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "meta/llama-4-scout": {
      "id": "meta/llama-4-scout",
      "name": "Llama 4 Scout 17B Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.17,
        "output": 0.66,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 8192
    },
    "meta/muse-glimmer-30b": {
      "id": "meta/muse-glimmer-30b",
      "name": "Muse Glimmer 30B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.35,
        "output": 1.5,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "meta/muse-spark-1.1": {
      "id": "meta/muse-spark-1.1",
      "name": "Muse Spark 1.1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "meta/muse-spark-1.2": {
      "id": "meta/muse-spark-1.2",
      "name": "Muse Spark 1.2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "meta/muse-spark-1.2-contributor": {
      "id": "meta/muse-spark-1.2-contributor",
      "name": "Muse Spark 1.2 Contributor",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0.002,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "meta/muse-spark-1.3": {
      "id": "meta/muse-spark-1.3",
      "name": "Muse Spark 1.3",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 4.25,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "meta/muse-spark-1.3-contributor": {
      "id": "meta/muse-spark-1.3-contributor",
      "name": "Muse Spark 1.3 Contributor",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.2,
        "cacheRead": 0.002,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "meta/muse-wonder-1.0": {
      "id": "meta/muse-wonder-1.0",
      "name": "Muse Wonder",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 1048576
    },
    "minimax/minimax-m2": {
      "id": "minimax/minimax-m2",
      "name": "MiniMax M2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.03,
        "cacheWrite": 0.375
      },
      "contextWindow": 205000,
      "maxTokens": 205000
    },
    "minimax/minimax-m2.1": {
      "id": "minimax/minimax-m2.1",
      "name": "MiniMax M2.1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.03,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "minimax/minimax-m2.1-lightning": {
      "id": "minimax/minimax-m2.1-lightning",
      "name": "MiniMax M2.1 Lightning",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 2.4,
        "cacheRead": 0.03,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "minimax/minimax-m2.5": {
      "id": "minimax/minimax-m2.5",
      "name": "MiniMax M2.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.03,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131000
    },
    "minimax/minimax-m2.5-highspeed": {
      "id": "minimax/minimax-m2.5-highspeed",
      "name": "MiniMax M2.5 High Speed",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.03,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131000
    },
    "minimax/minimax-m2.7": {
      "id": "minimax/minimax-m2.7",
      "name": "MiniMax M2.7",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131000
    },
    "minimax/minimax-m2.7-highspeed": {
      "id": "minimax/minimax-m2.7-highspeed",
      "name": "MiniMax M2.7 High Speed",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.06,
        "cacheWrite": 0.375
      },
      "contextWindow": 204800,
      "maxTokens": 131100
    },
    "minimax/minimax-m3": {
      "id": "minimax/minimax-m3",
      "name": "MiniMax M3",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 1.2,
        "cacheRead": 0.06,
        "cacheWrite": 0
      },
      "contextWindow": 512000,
      "maxTokens": 512000
    },
    "mistral/codestral": {
      "id": "mistral/codestral",
      "name": "Mistral Codestral",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 0.9,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4000
    },
    "mistral/ministral-14b": {
      "id": "mistral/ministral-14b",
      "name": "Ministral 14B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.2,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "mistral/ministral-3b": {
      "id": "mistral/ministral-3b",
      "name": "Ministral 3B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.1,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 4000
    },
    "mistral/ministral-8b": {
      "id": "mistral/ministral-8b",
      "name": "Ministral 8B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.15,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 4000
    },
    "mistral/mistral-large-3": {
      "id": "mistral/mistral-large-3",
      "name": "Mistral Large 3",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.5,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "mistral/mistral-large-4": {
      "id": "mistral/mistral-large-4",
      "name": "Mistral Large 4",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.68,
        "output": 2.09,
        "cacheRead": 0.07,
        "cacheWrite": 0
      },
      "contextWindow": 524288,
      "maxTokens": 262144
    },
    "mistral/mistral-medium-3.5": {
      "id": "mistral/mistral-medium-3.5",
      "name": "Mistral Medium Latest",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 7.5,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 256000
    },
    "mistral/mistral-nemo": {
      "id": "mistral/mistral-nemo",
      "name": "Mistral Nemo 12B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.029,
        "output": 0.03,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "mistral/mistral-small": {
      "id": "mistral/mistral-small",
      "name": "Mistral Small",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.015,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 4000
    },
    "mixedbread/toast-1": {
      "id": "mixedbread/toast-1",
      "name": "Toast 1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.3,
        "output": 0.72,
        "cacheRead": 0.036,
        "cacheWrite": 0
      },
      "contextWindow": 131000,
      "maxTokens": 4000
    },
    "moonshotai/kimi-k2": {
      "id": "moonshotai/kimi-k2",
      "name": "Kimi K2 Instruct",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.57,
        "output": 2.3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "moonshotai/kimi-k2.5": {
      "id": "moonshotai/kimi-k2.5",
      "name": "Kimi K2.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 3,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "moonshotai/kimi-k2.6": {
      "id": "moonshotai/kimi-k2.6",
      "name": "Kimi K2.6",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 262000,
      "maxTokens": 262000
    },
    "moonshotai/kimi-k2.7-code": {
      "id": "moonshotai/kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.19,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32768
    },
    "moonshotai/kimi-k2.7-code-highspeed": {
      "id": "moonshotai/kimi-k2.7-code-highspeed",
      "name": "Kimi K2.7 Code High Speed",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.9,
        "output": 8,
        "cacheRead": 0.38,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 32768
    },
    "moonshotai/kimi-k3": {
      "id": "moonshotai/kimi-k3",
      "name": "Kimi K3",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3,
        "output": 15,
        "cacheRead": 0.3,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "moonshotai/kimi-k3-fast": {
      "id": "moonshotai/kimi-k3-fast",
      "name": "Kimi K3 Fast",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4.5,
        "output": 22.5,
        "cacheRead": 0.45,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "nvidia/nemotron-3-nano-30b-a3b": {
      "id": "nvidia/nemotron-3-nano-30b-a3b",
      "name": "Nemotron 3 Nano 30B A3B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.2,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "nvidia/nemotron-3-super-120b-a12b": {
      "id": "nvidia/nemotron-3-super-120b-a12b",
      "name": "NVIDIA Nemotron 3 Super 120B A12B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.65,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32000
    },
    "nvidia/nemotron-3-ultra-550b-a55b": {
      "id": "nvidia/nemotron-3-ultra-550b-a55b",
      "name": "Nemotron 3 Ultra",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.4,
        "cacheRead": 0.12,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 65000
    },
    "nvidia/nemotron-3.5-lightning": {
      "id": "nvidia/nemotron-3.5-lightning",
      "name": "Nemotron 3.5 Lightning 30B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.2,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 131072
    },
    "nvidia/nemotron-nano-12b-v2-vl": {
      "id": "nvidia/nemotron-nano-12b-v2-vl",
      "name": "Nvidia Nemotron Nano 12B V2 VL",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "nvidia/nemotron-nano-9b-v2": {
      "id": "nvidia/nemotron-nano-9b-v2",
      "name": "Nvidia Nemotron Nano 9B V2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.23,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "openai/gpt-3.5-turbo": {
      "id": "openai/gpt-3.5-turbo",
      "name": "GPT-3.5 Turbo",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.5,
        "output": 1.5,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 16385,
      "maxTokens": 4096
    },
    "openai/gpt-4-turbo": {
      "id": "openai/gpt-4-turbo",
      "name": "GPT-4 Turbo",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 30,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 4096
    },
    "openai/gpt-4.1": {
      "id": "openai/gpt-4.1",
      "name": "GPT-4.1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-fast": {
      "id": "openai/gpt-4.1-fast",
      "name": "GPT-4.1 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3.5,
        "output": 14,
        "cacheRead": 0.875,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-mini": {
      "id": "openai/gpt-4.1-mini",
      "name": "GPT-4.1 mini",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 1.6,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-mini-fast": {
      "id": "openai/gpt-4.1-mini-fast",
      "name": "GPT-4.1 mini (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.7,
        "output": 2.8,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-nano": {
      "id": "openai/gpt-4.1-nano",
      "name": "GPT-4.1 nano",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4.1-nano-fast": {
      "id": "openai/gpt-4.1-nano-fast",
      "name": "GPT-4.1 nano (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.8,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 1047576,
      "maxTokens": 32768
    },
    "openai/gpt-4o": {
      "id": "openai/gpt-4o",
      "name": "GPT-4o",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 10,
        "cacheRead": 1.25,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o-fast": {
      "id": "openai/gpt-4o-fast",
      "name": "GPT-4o (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4.25,
        "output": 17,
        "cacheRead": 2.125,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o-mini": {
      "id": "openai/gpt-4o-mini",
      "name": "GPT-4o mini",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-4o-mini-fast": {
      "id": "openai/gpt-4o-mini-fast",
      "name": "GPT-4o mini (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 1,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16384
    },
    "openai/gpt-5": {
      "id": "openai/gpt-5",
      "name": "GPT-5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-codex": {
      "id": "openai/gpt-5-codex",
      "name": "GPT-5-Codex",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.13,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-fast": {
      "id": "openai/gpt-5-fast",
      "name": "GPT-5 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 20,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-mini": {
      "id": "openai/gpt-5-mini",
      "name": "GPT-5 mini",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.025,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-mini-fast": {
      "id": "openai/gpt-5-mini-fast",
      "name": "GPT-5 mini (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.45,
        "output": 3.6,
        "cacheRead": 0.045,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-nano": {
      "id": "openai/gpt-5-nano",
      "name": "GPT-5 nano",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.05,
        "output": 0.4,
        "cacheRead": 0.005,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5-pro": {
      "id": "openai/gpt-5-pro",
      "name": "GPT-5 pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 120,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 272000
    },
    "openai/gpt-5.1-codex": {
      "id": "openai/gpt-5.1-codex",
      "name": "GPT-5.1-Codex",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.13,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1-codex-max": {
      "id": "openai/gpt-5.1-codex-max",
      "name": "GPT 5.1 Codex Max",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1-codex-mini": {
      "id": "openai/gpt-5.1-codex-mini",
      "name": "GPT 5.1 Codex Mini",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.25,
        "output": 2,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1-thinking": {
      "id": "openai/gpt-5.1-thinking",
      "name": "GPT 5.1 Thinking",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 10,
        "cacheRead": 0.125,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.1-thinking-fast": {
      "id": "openai/gpt-5.1-thinking-fast",
      "name": "GPT 5.1 Thinking (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 20,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2": {
      "id": "openai/gpt-5.2",
      "name": "GPT 5.2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2-codex": {
      "id": "openai/gpt-5.2-codex",
      "name": "GPT 5.2 Codex",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2-fast": {
      "id": "openai/gpt-5.2-fast",
      "name": "GPT 5.2 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3.5,
        "output": 28,
        "cacheRead": 0.35,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.2-pro": {
      "id": "openai/gpt-5.2-pro",
      "name": "GPT 5.2 ",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 21,
        "output": 168,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.3-codex": {
      "id": "openai/gpt-5.3-codex",
      "name": "GPT 5.3 Codex",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.75,
        "output": 14,
        "cacheRead": 0.175,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.3-codex-fast": {
      "id": "openai/gpt-5.3-codex-fast",
      "name": "GPT 5.3 Codex (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3.5,
        "output": 28,
        "cacheRead": 0.35,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4": {
      "id": "openai/gpt-5.4",
      "name": "GPT 5.4",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 5,
            "output": 22.5,
            "cacheRead": 0.5,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-fast": {
      "id": "openai/gpt-5.4-fast",
      "name": "GPT 5.4 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-mini": {
      "id": "openai/gpt-5.4-mini",
      "name": "GPT 5.4 Mini",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-mini-fast": {
      "id": "openai/gpt-5.4-mini-fast",
      "name": "GPT 5.4 Mini (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.5,
        "output": 9,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-nano": {
      "id": "openai/gpt-5.4-nano",
      "name": "GPT 5.4 Nano",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.25,
        "cacheRead": 0.02,
        "cacheWrite": 0
      },
      "contextWindow": 400000,
      "maxTokens": 128000
    },
    "openai/gpt-5.4-pro": {
      "id": "openai/gpt-5.4-pro",
      "name": "GPT 5.4 Pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 60,
            "output": 270,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.5": {
      "id": "openai/gpt-5.5",
      "name": "GPT 5.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "openai/gpt-5.5-fast": {
      "id": "openai/gpt-5.5-fast",
      "name": "GPT 5.5 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 12.5,
        "output": 75,
        "cacheRead": 1.25,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "openai/gpt-5.5-pro": {
      "id": "openai/gpt-5.5-pro",
      "name": "GPT 5.5 Pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 30,
        "output": 180,
        "cacheRead": 0,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 60,
            "output": 270,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-luna": {
      "id": "openai/gpt-5.6-luna",
      "name": "GPT 5.6 Luna",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.2,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 0.4,
            "output": 1.8,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-luna-fast": {
      "id": "openai/gpt-5.6-luna-fast",
      "name": "GPT 5.6 Luna (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.4,
        "output": 2.4,
        "cacheRead": 0.04,
        "cacheWrite": 0.5,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 0.8,
            "output": 3.6,
            "cacheRead": 0.08,
            "cacheWrite": 1
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-sol": {
      "id": "openai/gpt-5.6-sol",
      "name": "GPT 5.6 Sol",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.4,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 8,
            "output": 30,
            "cacheRead": 0.8,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-sol-fast": {
      "id": "openai/gpt-5.6-sol-fast",
      "name": "GPT 5.6 Sol (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 8,
        "output": 40,
        "cacheRead": 0.8,
        "cacheWrite": 10,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 16,
            "output": 60,
            "cacheRead": 1.6,
            "cacheWrite": 20
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-terra": {
      "id": "openai/gpt-5.6-terra",
      "name": "GPT 5.6 Terra",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 12,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 4,
            "output": 18,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-5.6-terra-fast": {
      "id": "openai/gpt-5.6-terra-fast",
      "name": "GPT 5.6 Terra (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 24,
        "cacheRead": 0.4,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 271999,
            "input": 8,
            "output": 36,
            "cacheRead": 0.8,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-astra": {
      "id": "openai/gpt-6-astra",
      "name": "GPT-6 Astra",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 20,
            "output": 75,
            "cacheRead": 2,
            "cacheWrite": 25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-astra-fast": {
      "id": "openai/gpt-6-astra-fast",
      "name": "GPT-6 Astra (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 20,
        "output": 100,
        "cacheRead": 2,
        "cacheWrite": 25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 40,
            "output": 150,
            "cacheRead": 4,
            "cacheWrite": 50
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-luna": {
      "id": "openai/gpt-6-luna",
      "name": "GPT-6 Luna",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.01,
        "cacheWrite": 0.125,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.2,
            "output": 0.75,
            "cacheRead": 0.02,
            "cacheWrite": 0.25
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-luna-fast": {
      "id": "openai/gpt-6-luna-fast",
      "name": "GPT-6 Luna (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1,
        "cacheRead": 0.02,
        "cacheWrite": 0.25,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 0.4,
            "output": 1.5,
            "cacheRead": 0.04,
            "cacheWrite": 0.5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-sol": {
      "id": "openai/gpt-6-sol",
      "name": "GPT-6 Sol",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.4,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6-sol-fast": {
      "id": "openai/gpt-6-sol-fast",
      "name": "GPT-6 Sol (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.4,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 8,
            "output": 30,
            "cacheRead": 0.8,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6.1-sol": {
      "id": "openai/gpt-6.1-sol",
      "name": "GPT-6.1 Sol",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 10,
        "cacheRead": 0.1,
        "cacheWrite": 2.5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 4,
            "output": 15,
            "cacheRead": 0.2,
            "cacheWrite": 5
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-6.1-sol-fast": {
      "id": "openai/gpt-6.1-sol-fast",
      "name": "GPT-6.1 Sol (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.2,
        "cacheWrite": 5,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 8,
            "output": 30,
            "cacheRead": 0.4,
            "cacheWrite": 10
          }
        ]
      },
      "contextWindow": 1050000,
      "maxTokens": 128000
    },
    "openai/gpt-oss-120b": {
      "id": "openai/gpt-oss-120b",
      "name": "GPT OSS 120B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.1,
        "output": 0.5,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "openai/gpt-oss-20b": {
      "id": "openai/gpt-oss-20b",
      "name": "GPT OSS 20B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.03,
        "output": 0.14,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 131072,
      "maxTokens": 8192
    },
    "openai/gpt-oss-safeguard-120b": {
      "id": "openai/gpt-oss-safeguard-120b",
      "name": "GPT OSS Safeguard 120B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16000
    },
    "openai/gpt-oss-safeguard-20b": {
      "id": "openai/gpt-oss-safeguard-20b",
      "name": "GPT OSS Safeguard 20B",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.07,
        "output": 0.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 16000
    },
    "openai/o1": {
      "id": "openai/o1",
      "name": "o1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 15,
        "output": 60,
        "cacheRead": 7.5,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3": {
      "id": "openai/o3",
      "name": "o3",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3-fast": {
      "id": "openai/o3-fast",
      "name": "o3 (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 3.5,
        "output": 14,
        "cacheRead": 0.875,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3-mini": {
      "id": "openai/o3-mini",
      "name": "o3-mini",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.55,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o3-pro": {
      "id": "openai/o3-pro",
      "name": "o3 Pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 20,
        "output": 80,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o4-mini": {
      "id": "openai/o4-mini",
      "name": "o4-mini",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.1,
        "output": 4.4,
        "cacheRead": 0.275,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "openai/o4-mini-fast": {
      "id": "openai/o4-mini-fast",
      "name": "o4-mini (Fast)",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 8,
        "cacheRead": 0.5,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 100000
    },
    "poolside/laguna-s-2.1": {
      "id": "poolside/laguna-s-2.1",
      "name": "Laguna S 2.1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.09,
        "output": 0.18,
        "cacheRead": 0.009,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "poolside/laguna-s-2.1-free": {
      "id": "poolside/laguna-s-2.1-free",
      "name": "Laguna S 2.1 Free",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 32768
    },
    "quiverai/arrow-2": {
      "id": "quiverai/arrow-2",
      "name": "Arrow 2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4,
        "output": 20,
        "cacheRead": 0.4,
        "cacheWrite": 5
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "quiverai/arrow-2-telos": {
      "id": "quiverai/arrow-2-telos",
      "name": "Arrow 2 Telos",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 6,
        "output": 30,
        "cacheRead": 0.6,
        "cacheWrite": 7.5
      },
      "contextWindow": 131072,
      "maxTokens": 131072
    },
    "sakana/fugu-max": {
      "id": "sakana/fugu-max",
      "name": "Fugu Max",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.25,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "sakana/fugu-ultra": {
      "id": "sakana/fugu-ultra",
      "name": "Fugu Ultra",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "sakana/fugu-ultra-v2": {
      "id": "sakana/fugu-ultra-v2",
      "name": "Fugu Ultra v2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 5,
        "output": 30,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 272000,
            "input": 10,
            "output": 45,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "sakana/namazu": {
      "id": "sakana/namazu",
      "name": "Sakana Namazu",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.95,
        "output": 4,
        "cacheRead": 0.15,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "spacexai/grok-4.1-fast-non-reasoning": {
      "id": "spacexai/grok-4.1-fast-non-reasoning",
      "name": "Grok 4.1 Fast Non-Reasoning",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.5,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "spacexai/grok-4.1-fast-reasoning": {
      "id": "spacexai/grok-4.1-fast-reasoning",
      "name": "Grok 4.1 Fast Reasoning",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 0.5,
        "cacheRead": 0.05,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "spacexai/grok-4.20-multi-agent": {
      "id": "spacexai/grok-4.20-multi-agent",
      "name": "Grok 4.20 Multi-Agent",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 2000000,
      "maxTokens": 2000000
    },
    "spacexai/grok-4.20-multi-agent-beta": {
      "id": "spacexai/grok-4.20-multi-agent-beta",
      "name": "Grok 4.20 Multi Agent Beta",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 2000000,
      "maxTokens": 2000000
    },
    "spacexai/grok-4.20-non-reasoning": {
      "id": "spacexai/grok-4.20-non-reasoning",
      "name": "Grok 4.20 Non-Reasoning",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 2000000,
      "maxTokens": 2000000
    },
    "spacexai/grok-4.20-non-reasoning-beta": {
      "id": "spacexai/grok-4.20-non-reasoning-beta",
      "name": "Grok 4.20 Beta Non-Reasoning",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": false,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 2000000,
      "maxTokens": 2000000
    },
    "spacexai/grok-4.20-reasoning": {
      "id": "spacexai/grok-4.20-reasoning",
      "name": "Grok 4.20 Reasoning",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 2000000,
      "maxTokens": 2000000
    },
    "spacexai/grok-4.20-reasoning-beta": {
      "id": "spacexai/grok-4.20-reasoning-beta",
      "name": "Grok 4.20 Beta Reasoning",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 2000000,
      "maxTokens": 2000000
    },
    "spacexai/grok-4.3": {
      "id": "spacexai/grok-4.3",
      "name": "Grok 4.3",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "spacexai/grok-4.5": {
      "id": "spacexai/grok-4.5",
      "name": "Grok 4.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.3,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 0.6,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "spacexai/grok-4.6": {
      "id": "spacexai/grok-4.6",
      "name": "Grok 4.6",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "spacexai/grok-4.7": {
      "id": "spacexai/grok-4.7",
      "name": "Grok 4.7",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "spacexai/grok-build-0.1": {
      "id": "spacexai/grok-build-0.1",
      "name": "Grok Build 0.1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 2,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2,
            "output": 4,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "stealth/glyph-cluster": {
      "id": "stealth/glyph-cluster",
      "name": "Glyph Cluster",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "stepfun/step-3.7-flash": {
      "id": "stepfun/step-3.7-flash",
      "name": "Step 3.7 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.15,
        "cacheRead": 0.04,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "tencent/hy3": {
      "id": "tencent/hy3",
      "name": "Hy3",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.58,
        "cacheRead": 0.035,
        "cacheWrite": 0
      },
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    "tencent/hy4-preview": {
      "id": "tencent/hy4-preview",
      "name": "Tencent Hy4 Preview",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.834,
        "output": 2.501,
        "cacheRead": 0.042,
        "cacheWrite": 0
      },
      "contextWindow": 1024000,
      "maxTokens": 64000
    },
    "thinkingmachines/inkling": {
      "id": "thinkingmachines/inkling",
      "name": "Inkling",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1,
        "output": 4.05,
        "cacheRead": 0.17,
        "cacheWrite": 0
      },
      "contextWindow": 256000,
      "maxTokens": 256000
    },
    "thinkingmachines/inkling-small": {
      "id": "thinkingmachines/inkling-small",
      "name": "Inkling Small",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.45,
        "output": 1.2,
        "cacheRead": 0.1,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "xiaomi/mimo-v2.5": {
      "id": "xiaomi/mimo-v2.5",
      "name": "MiMo M2.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.0028,
        "cacheWrite": 0
      },
      "contextWindow": 1050000,
      "maxTokens": 131100
    },
    "xiaomi/mimo-v2.5-pro": {
      "id": "xiaomi/mimo-v2.5-pro",
      "name": "MiMo V2.5 Pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.0036,
        "cacheWrite": 0
      },
      "contextWindow": 1050000,
      "maxTokens": 131000
    },
    "xiaomi/mimo-v2.6-flash": {
      "id": "xiaomi/mimo-v2.6-flash",
      "name": "MiMo V2.6 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.0028,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "xiaomi/mimo-v2.6-pro": {
      "id": "xiaomi/mimo-v2.6-pro",
      "name": "MiMo V2.6 Pro",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.0036,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "xiaomi/mimo-v2.6-pro-ultraspeed": {
      "id": "xiaomi/mimo-v2.6-pro-ultraspeed",
      "name": "MiMo V2.6 Pro UltraSpeed",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4.35,
        "output": 8.7,
        "cacheRead": 0.036,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "zai/glm-4.5": {
      "id": "zai/glm-4.5",
      "name": "GLM 4.5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 96000
    },
    "zai/glm-4.5-air": {
      "id": "zai/glm-4.5-air",
      "name": "GLM 4.5 Air",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.2,
        "output": 1.1,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 96000
    },
    "zai/glm-4.5v": {
      "id": "zai/glm-4.5v",
      "name": "GLM 4.5V",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.6,
        "output": 1.8,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 66000,
      "maxTokens": 16000
    },
    "zai/glm-4.6": {
      "id": "zai/glm-4.6",
      "name": "GLM 4.6",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 96000
    },
    "zai/glm-4.7": {
      "id": "zai/glm-4.7",
      "name": "GLM 4.7",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 120000
    },
    "zai/glm-4.7-flash": {
      "id": "zai/glm-4.7-flash",
      "name": "GLM 4.7 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.07,
        "output": 0.4,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 131000
    },
    "zai/glm-4.7-flashx": {
      "id": "zai/glm-4.7-flashx",
      "name": "GLM 4.7 FlashX",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.06,
        "output": 0.4,
        "cacheRead": 0.01,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 128000
    },
    "zai/glm-5": {
      "id": "zai/glm-5",
      "name": "GLM 5",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1,
        "output": 3.2,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 202800,
      "maxTokens": 131100
    },
    "zai/glm-5-turbo": {
      "id": "zai/glm-5-turbo",
      "name": "GLM 5 Turbo",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.2,
        "output": 4,
        "cacheRead": 0.24,
        "cacheWrite": 0
      },
      "contextWindow": 202800,
      "maxTokens": 131100
    },
    "zai/glm-5.1": {
      "id": "zai/glm-5.1",
      "name": "GLM 5.1",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 202800,
      "maxTokens": 64000
    },
    "zai/glm-5.2": {
      "id": "zai/glm-5.2",
      "name": "GLM 5.2",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.8,
        "output": 2.55,
        "cacheRead": 0.16,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "zai/glm-5.2-fast": {
      "id": "zai/glm-5.2-fast",
      "name": "GLM 5.2 Fast",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.8,
        "output": 8.8,
        "cacheRead": 0.56,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 128000
    },
    "zai/glm-5.3": {
      "id": "zai/glm-5.3",
      "name": "GLM 5.3",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.14,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 1000000
    },
    "zai/glm-5.3-fast": {
      "id": "zai/glm-5.3-fast",
      "name": "GLM 5.3 Fast",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 2.1,
        "output": 6.6,
        "cacheRead": 0.21,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 262144
    },
    "zai/glm-5.3-flash": {
      "id": "zai/glm-5.3-flash",
      "name": "GLM 5.3 Flash",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131000
    },
    "zai/glm-5.3-flashx": {
      "id": "zai/glm-5.3-flashx",
      "name": "GLM 5.3 FlashX",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.37,
        "output": 1.25,
        "cacheRead": 0.075,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "zai/glm-5v-turbo": {
      "id": "zai/glm-5v-turbo",
      "name": "GLM 5V Turbo",
      "protocol": "anthropic-messages",
      "provider": "vercel-ai-gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.2,
        "output": 4,
        "cacheRead": 0.24,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 128000
    }
  },
  "xai": {
    "grok-4.3": {
      "id": "grok-4.3",
      "name": "Grok 4.3",
      "protocol": "openai-responses",
      "provider": "xai",
      "baseUrl": "https://api.x.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 1.25,
        "output": 2.5,
        "cacheRead": 0.2,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 2.5,
            "output": 5,
            "cacheRead": 0.4,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 1000000,
      "maxTokens": 30000
    },
    "grok-4.5": {
      "id": "grok-4.5",
      "name": "Grok 4.5",
      "protocol": "openai-responses",
      "provider": "xai",
      "baseUrl": "https://api.x.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.3,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 0.6,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "grok-4.6": {
      "id": "grok-4.6",
      "name": "Grok 4.6",
      "protocol": "openai-responses",
      "provider": "xai",
      "baseUrl": "https://api.x.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    },
    "grok-4.7": {
      "id": "grok-4.7",
      "name": "Grok 4.7",
      "protocol": "openai-responses",
      "provider": "xai",
      "baseUrl": "https://api.x.ai/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 2,
        "output": 6,
        "cacheRead": 0.5,
        "cacheWrite": 0,
        "tiers": [
          {
            "inputTokensAbove": 200000,
            "input": 4,
            "output": 12,
            "cacheRead": 1,
            "cacheWrite": 0
          }
        ]
      },
      "contextWindow": 500000,
      "maxTokens": 500000
    }
  },
  "xiaomi": {
    "mimo-v2.5": {
      "id": "mimo-v2.5",
      "name": "MiMo-V2.5",
      "protocol": "openai-completions",
      "provider": "xiaomi",
      "baseUrl": "https://api.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.0028,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.5-pro": {
      "id": "mimo-v2.5-pro",
      "name": "MiMo-V2.5-Pro",
      "protocol": "openai-completions",
      "provider": "xiaomi",
      "baseUrl": "https://api.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.0036,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.5-pro-ultraspeed": {
      "id": "mimo-v2.5-pro-ultraspeed",
      "name": "MiMo-V2.5-Pro-UltraSpeed",
      "protocol": "openai-completions",
      "provider": "xiaomi",
      "baseUrl": "https://api.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.305,
        "output": 2.61,
        "cacheRead": 0.0108,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-flash": {
      "id": "mimo-v2.6-flash",
      "name": "MiMo-V2.6-Flash",
      "protocol": "openai-completions",
      "provider": "xiaomi",
      "baseUrl": "https://api.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.14,
        "output": 0.28,
        "cacheRead": 0.0028,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-pro": {
      "id": "mimo-v2.6-pro",
      "name": "MiMo-V2.6-Pro",
      "protocol": "openai-completions",
      "provider": "xiaomi",
      "baseUrl": "https://api.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.435,
        "output": 0.87,
        "cacheRead": 0.0036,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-pro-ultraspeed": {
      "id": "mimo-v2.6-pro-ultraspeed",
      "name": "MiMo-V2.6-Pro-UltraSpeed",
      "protocol": "openai-completions",
      "provider": "xiaomi",
      "baseUrl": "https://api.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 4.35,
        "output": 8.7,
        "cacheRead": 0.036,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    }
  },
  "xiaomi-token-plan-ams": {
    "mimo-v2.5": {
      "id": "mimo-v2.5",
      "name": "MiMo-V2.5",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-ams",
      "baseUrl": "https://token-plan-ams.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.5-pro": {
      "id": "mimo-v2.5-pro",
      "name": "MiMo-V2.5-Pro",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-ams",
      "baseUrl": "https://token-plan-ams.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-flash": {
      "id": "mimo-v2.6-flash",
      "name": "MiMo-V2.6-Flash",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-ams",
      "baseUrl": "https://token-plan-ams.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-pro": {
      "id": "mimo-v2.6-pro",
      "name": "MiMo-V2.6-Pro",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-ams",
      "baseUrl": "https://token-plan-ams.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    }
  },
  "xiaomi-token-plan-cn": {
    "mimo-v2.5": {
      "id": "mimo-v2.5",
      "name": "MiMo-V2.5",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-cn",
      "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.5-pro": {
      "id": "mimo-v2.5-pro",
      "name": "MiMo-V2.5-Pro",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-cn",
      "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-flash": {
      "id": "mimo-v2.6-flash",
      "name": "MiMo-V2.6-Flash",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-cn",
      "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-pro": {
      "id": "mimo-v2.6-pro",
      "name": "MiMo-V2.6-Pro",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-cn",
      "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    }
  },
  "xiaomi-token-plan-sgp": {
    "mimo-v2.5": {
      "id": "mimo-v2.5",
      "name": "MiMo-V2.5",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-sgp",
      "baseUrl": "https://token-plan-sgp.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.5-pro": {
      "id": "mimo-v2.5-pro",
      "name": "MiMo-V2.5-Pro",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-sgp",
      "baseUrl": "https://token-plan-sgp.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-flash": {
      "id": "mimo-v2.6-flash",
      "name": "MiMo-V2.6-Flash",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-sgp",
      "baseUrl": "https://token-plan-sgp.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    },
    "mimo-v2.6-pro": {
      "id": "mimo-v2.6-pro",
      "name": "MiMo-V2.6-Pro",
      "protocol": "openai-completions",
      "provider": "xiaomi-token-plan-sgp",
      "baseUrl": "https://token-plan-sgp.xiaomimimo.com/v1",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1048576,
      "maxTokens": 131072
    }
  },
  "zai": {
    "glm-4.7": {
      "id": "glm-4.7",
      "name": "GLM-4.7",
      "protocol": "openai-completions",
      "provider": "zai",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0.6,
        "output": 2.2,
        "cacheRead": 0.11,
        "cacheWrite": 0
      },
      "contextWindow": 204800,
      "maxTokens": 131072
    },
    "glm-5-turbo": {
      "id": "glm-5-turbo",
      "name": "GLM-5-Turbo",
      "protocol": "openai-completions",
      "provider": "zai",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.2,
        "output": 4,
        "cacheRead": 0.24,
        "cacheWrite": 0
      },
      "contextWindow": 200000,
      "maxTokens": 131072
    },
    "glm-5.2": {
      "id": "glm-5.2",
      "name": "GLM-5.2",
      "protocol": "openai-completions",
      "provider": "zai",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.2-highspeed": {
      "id": "glm-5.2-highspeed",
      "name": "GLM-5.2 Highspeed",
      "protocol": "openai-completions",
      "provider": "zai",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3": {
      "id": "glm-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "zai",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3-flash": {
      "id": "glm-5.3-flash",
      "name": "GLM-5.3-Flash",
      "protocol": "openai-completions",
      "provider": "zai",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3-highspeed": {
      "id": "glm-5.3-highspeed",
      "name": "GLM-5.3 Highspeed",
      "protocol": "openai-completions",
      "provider": "zai",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    }
  },
  "zai-coding-cn": {
    "glm-4.6v": {
      "id": "glm-4.6v",
      "name": "GLM-4.6V",
      "protocol": "openai-completions",
      "provider": "zai-coding-cn",
      "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.3,
        "output": 0.9,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 128000,
      "maxTokens": 32768
    },
    "glm-5.3": {
      "id": "glm-5.3",
      "name": "GLM-5.3",
      "protocol": "openai-completions",
      "provider": "zai-coding-cn",
      "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 1.4,
        "output": 4.4,
        "cacheRead": 0.26,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3-flash": {
      "id": "glm-5.3-flash",
      "name": "GLM-5.3-Flash",
      "protocol": "openai-completions",
      "provider": "zai-coding-cn",
      "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text",
        "image"
      ],
      "cost": {
        "input": 0.15,
        "output": 0.5,
        "cacheRead": 0.03,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    },
    "glm-5.3-highspeed": {
      "id": "glm-5.3-highspeed",
      "name": "GLM-5.3 Highspeed",
      "protocol": "openai-completions",
      "provider": "zai-coding-cn",
      "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
      "reasoning": true,
      "input": [
        "text"
      ],
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      "contextWindow": 1000000,
      "maxTokens": 131072
    }
  }
};
