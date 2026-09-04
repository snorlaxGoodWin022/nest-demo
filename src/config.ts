// src/.ts
export const config = {
  // ── 原有配置（不动）─────────────────────────────────────
  // 如果原项目有 server、chroma 等配置，保留在这里

  // ── Ollama / LangChain 配置（已禁用，改用 llama.cpp）────────────
  ollama: {
    host: 'http://localhost:11434',
    chatModel: 'qwen3.5:0.8b',
    embedModel: 'mxbai-embed-large',
    temperature: 0.3,
  },

  // ── Llama.cpp 配置 ──────────────────────────────────────
  // 使用本地 llama-server.exe 启动的 HTTP 服务（OpenAI 兼容 API）
  llamaCpp: {
    // Llama-3.2 对话模型 — llama-server 启动在 8081
    baseUrl: 'http://localhost:8081/v1',
    //对话模型
    chatModel: 'D:/softIT/llama.cpp/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    // Embedding 模型 — 独立的 llama-server 启动在 8082
    embedBaseUrl: 'http://localhost:8082/v1',
    //向量化模型
    embedModel: 'D:/softIT/llama.cpp/mxbai-embed-large-v1.Q5_K_M.gguf',
    temperature: 0.3,
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: '', // 如果有密码就填
    db: 0,
    keyPrefix: 'chat:session:', // 所有 key 自动加前缀
    ttl: 3600 * 24 * 7, // 7天过期（秒）
  },
  langGraph: {
    model: process.env.LANGGRAPH_MODEL || 'qwen3.5:0.8b',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    apiKey: 'ollama', // Ollama 不校验 apiKey，随便填个占位符即可
    temperature: 0.7,
  },
};
