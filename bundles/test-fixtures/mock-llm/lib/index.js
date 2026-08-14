// Mock LLM 适配器（冒烟测试用）：零依赖实现 LlmAdapter 契约，注册 'mock' provider 路由。
// 不 import @deepseek-ai/dsh-llm——link: 安装的 bundle 源码目录无法解析宿主依赖；
// 接口按 dsh-llm/lib/types 的 LlmAdapter 契约实现即可（运行时按鸭子类型调用）。
class MockAdapter {
  providerInfo(provider) { return { id: provider, name: 'Mock LLM（agenthub 冒烟）' }; }
  providerRetryPolicy() { return undefined; }
  async listModels() { return [{ provider: 'mock', id: 'mock-1', name: 'Mock-1' }]; }
  async resolveModel(provider, model) { return { provider, id: model, name: 'Mock ' + model }; }
  async *stream() {
    const text = 'MOCK-OK: agent loop executed with the finance composition.';
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 12 } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

function mockLlm(ctx) {
  ctx.llm.registerAdapter(['mock'], new MockAdapter());
}
mockLlm.inject = ['llm'];
export default mockLlm;
