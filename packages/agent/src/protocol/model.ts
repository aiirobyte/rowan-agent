export type ModelRef = {
  provider: string;
  name: string;
};

export type ModelCallUsage = {
  inputMessages: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
