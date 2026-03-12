'use strict';
/**
 * sdk/mcp-client.js
 * ─────────────────────────────────────────────────────────────
 * PMIS MCP Client SDK（Node.js）
 *
 * 提供簡單的 JavaScript API，封裝 MCP SSE 通訊協定，
 * 讓外部系統無需了解 MCP 底層即可整合 PMIS。
 *
 * 使用範例：
 * ```js
 * const MCPClient = require('./sdk/mcp-client');
 *
 * const pmis = new MCPClient({
 *   serverUrl: 'http://localhost:3100',
 *   apiKey:    'pmis_xxx',
 * });
 *
 * await pmis.connect();
 * const result = await pmis.callTool('list_projects', {});
 * const data   = pmis.parseResult(result);
 * await pmis.disconnect();
 * ```
 *
 * 依賴：@modelcontextprotocol/sdk eventsource
 */

const { Client }                 = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport }     = require('@modelcontextprotocol/sdk/client/sse.js');

// Node.js < 18 沒有內建 EventSource，需要 polyfill
if (typeof globalThis.EventSource === 'undefined') {
  try {
    const { EventSource } = require('eventsource');
    globalThis.EventSource = EventSource;
  } catch (_) {
    console.warn('[MCPClient] 警告：eventsource 套件未安裝，SSE 連線可能失敗。執行：npm install eventsource');
  }
}

// ════════════════════════════════════════════════════════════
// MCPClient 類別
// ════════════════════════════════════════════════════════════

class MCPClient {
  /**
   * @param {Object} opts
   * @param {string}  opts.serverUrl  MCP 伺服器 URL（例：http://localhost:3100）
   * @param {string}  opts.apiKey     PMIS API Key（pmis_xxx 格式）
   * @param {number}  [opts.timeout]  工具呼叫逾時（ms，預設 30000）
   * @param {boolean} [opts.debug]    啟用除錯日誌
   */
  constructor({ serverUrl, apiKey, timeout = 30_000, debug = false }) {
    if (!serverUrl) throw new Error('MCPClient: serverUrl 必填');
    if (!apiKey)    throw new Error('MCPClient: apiKey 必填');

    this._serverUrl = serverUrl.replace(/\/$/, '');
    this._apiKey    = apiKey;
    this._timeout   = timeout;
    this._debug     = debug;
    this._client    = null;
    this._transport = null;
    this._connected = false;
  }

  // ── 連線 ───────────────────────────────────────────────

  /**
   * 建立 MCP SSE 連線
   */
  async connect() {
    if (this._connected) return this;

    const sseUrl = new URL(`${this._serverUrl}/mcp/sse`);

    this._transport = new SSEClientTransport(sseUrl, {
      requestInit: {
        headers: { 'X-API-Key': this._apiKey },
      },
    });

    this._client = new Client(
      { name: 'pmis-sdk-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await this._client.connect(this._transport);
    this._connected = true;
    this._log('✅ MCP 連線成功');
    return this;
  }

  /**
   * 關閉連線
   */
  async disconnect() {
    if (!this._connected) return;
    try {
      await this._transport?.close?.();
    } catch (_) {}
    this._connected = false;
    this._log('🔌 MCP 連線已關閉');
  }

  // ── 工具呼叫 ────────────────────────────────────────────

  /**
   * 呼叫 MCP Tool
   * @param {string} name    工具名稱
   * @param {Object} args    參數
   * @returns {Object}       MCP 回應（含 content 陣列）
   */
  async callTool(name, args = {}) {
    this._ensureConnected();
    this._log(`→ callTool: ${name}`, args);

    const result = await Promise.race([
      this._client.callTool({ name, arguments: args }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`工具 ${name} 呼叫逾時（${this._timeout}ms）`)), this._timeout)
      ),
    ]);

    this._log(`← callTool: ${name}`, result);
    return result;
  }

  /**
   * 列出可用工具
   * @returns {Array} 工具清單
   */
  async listTools() {
    this._ensureConnected();
    const result = await this._client.listTools();
    return result.tools || [];
  }

  // ── Resource 讀取 ───────────────────────────────────────

  /**
   * 讀取 MCP Resource
   * @param {string} uri  Resource URI（例：project://5, report://weekly）
   * @returns {Object}    MCP Resource 回應（含 contents 陣列）
   */
  async readResource(uri) {
    this._ensureConnected();
    this._log(`→ readResource: ${uri}`);
    const result = await this._client.readResource({ uri });
    this._log(`← readResource: ${uri}`, result);
    return result;
  }

  /**
   * 列出可用 Resources
   * @returns {Array}
   */
  async listResources() {
    this._ensureConnected();
    const result = await this._client.listResources();
    return result.resources || [];
  }

  // ── Prompt 取得 ─────────────────────────────────────────

  /**
   * 取得 MCP Prompt
   * @param {string} name  Prompt 名稱
   * @param {Object} args  Prompt 參數
   * @returns {Object}
   */
  async getPrompt(name, args = {}) {
    this._ensureConnected();
    const result = await this._client.getPrompt({ name, arguments: args });
    return result;
  }

  /**
   * 列出可用 Prompts
   */
  async listPrompts() {
    this._ensureConnected();
    const result = await this._client.listPrompts();
    return result.prompts || [];
  }

  // ── 便利方法（解析結果）───────────────────────────────

  /**
   * 解析 callTool 回傳的 JSON 內容
   * @param {Object} toolResult  callTool 的回傳值
   * @returns {*}               解析後的 JavaScript 物件
   */
  parseResult(toolResult) {
    const text = toolResult?.content?.[0]?.text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  /**
   * 解析 readResource 回傳的 JSON 內容
   * @param {Object} resourceResult  readResource 的回傳值
   * @returns {*}
   */
  parseResource(resourceResult) {
    const text = resourceResult?.contents?.[0]?.text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  // ── 高階便利方法 ────────────────────────────────────────

  /** 快速列出專案 */
  async getProjects(opts = {}) {
    const result = await this.callTool('list_projects', opts);
    return this.parseResult(result) || [];
  }

  /** 快速取得任務 */
  async getTask(taskId) {
    const result = await this.callTool('get_task_details', { taskId });
    return this.parseResult(result);
  }

  /** 快速建立任務 */
  async createTask(opts) {
    const result = await this.callTool('create_task', opts);
    return this.parseResult(result);
  }

  /** 快速更新任務狀態 */
  async updateTaskStatus(taskId, status, comment) {
    const result = await this.callTool('update_task_status', { taskId, status, comment });
    return this.parseResult(result);
  }

  /** 快速新增評論 */
  async addComment(taskId, content) {
    const result = await this.callTool('add_task_comment', { taskId, content });
    return this.parseResult(result);
  }

  /** 快速取得每周報告 */
  async getWeeklyReport() {
    const result = await this.readResource('report://weekly');
    return this.parseResource(result);
  }

  /** 快速取得逾期報告 */
  async getOverdueReport() {
    const result = await this.readResource('report://overdue');
    return this.parseResource(result);
  }

  /** 快速取得用戶工作負載 */
  async getUserWorkload(userId) {
    const result = await this.readResource(`user://${userId}/workload`);
    return this.parseResource(result);
  }

  /** 快速執行 RPA 流程 */
  async executeRpaFlow(flowId, params = {}, webhookUrl) {
    const result = await this.callTool('rpa_execute_flow', { flowId, params, webhookUrl });
    return this.parseResult(result);
  }

  // ── Discovery（不需 MCP 連線）───────────────────────────

  /**
   * 取得 MCP Discovery 文件（不需 API Key）
   * @returns {Object}
   */
  async getDiscovery() {
    const fetch = (typeof globalThis.fetch !== 'undefined')
      ? globalThis.fetch
      : require('node-fetch');

    const res  = await fetch(`${this._serverUrl}/mcp/discovery`);
    return res.json();
  }

  // ── 內部 ─────────────────────────────────────────────────

  _ensureConnected() {
    if (!this._connected) {
      throw new Error('MCPClient 尚未連線，請先呼叫 connect()');
    }
  }

  _log(msg, data) {
    if (!this._debug) return;
    if (data !== undefined) {
      console.log(`[MCPClient] ${msg}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[MCPClient] ${msg}`);
    }
  }
}

// ════════════════════════════════════════════════════════════
// 工廠方法（自動連線後回傳 client）
// ════════════════════════════════════════════════════════════

/**
 * 建立並連線 MCPClient（一行版本）
 * @param {Object} opts - 同 constructor 參數
 * @returns {Promise<MCPClient>}
 *
 * @example
 * const pmis = await MCPClient.create({ serverUrl: '...', apiKey: '...' });
 * const projects = await pmis.getProjects();
 */
MCPClient.create = async (opts) => {
  const client = new MCPClient(opts);
  await client.connect();
  return client;
};

module.exports = MCPClient;
