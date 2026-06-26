// src/config.ts
export const config = {
  // ── 原有配置（不动）─────────────────────────────────────
  // 如果原项目有 server、chroma 等配置，保留在这里

  // ── Ollama / LangChain 配置（已禁用，改用 llama.cpp）────────────
  // ollama: {
  //   baseUrl: 'http://localhost:11434',
  //   chatModel: 'qwen3.5:0.8b',
  //   embedModel: 'mxbai-embed-large',
  //   temperature: 0.3,
  // },

  // ── Llama.cpp 配置 ──────────────────────────────────────
  // 使用本地 llama-server.exe 启动的 HTTP 服务（OpenAI 兼容 API）
  llamaCpp: {
    // Llama-3.2 对话模型 — llama-server 启动在 8081
    baseUrl: 'http://localhost:8081/v1',
    chatModel: 'D:/softIT/llama.cpp/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    // Embedding 模型 — 独立的 llama-server 启动在 8082
    embedBaseUrl: 'http://localhost:8082/v1',
    embedModel: 'D:/softIT/llama.cpp/mxbai-embed-large-v1.Q5_K_M.gguf',
    temperature: 0.3,
  },
};
