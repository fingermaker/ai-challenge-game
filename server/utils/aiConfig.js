/**
 * AI 配置管理模块
 * 
 * 从数据库读取 AI API 配置，支持通过后台管理面板动态修改。
 * 默认使用阿里百炼（DashScope）：
 *   - 文本/视觉理解：qwen3.6-plus（OpenAI 兼容接口）
 *   - 图像生成：qwen-image-2.0-pro（DashScope 异步接口）
 */

const { getConfig, setConfig } = require('../db');

// 默认配置（阿里百炼 DashScope）
const DEFAULTS = {
  api_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  api_key: '',
  ai_model: 'qwen3.6-plus',
  ai_model_image: 'wanx2.1-t2i-turbo',
};

/**
 * 初始化 AI 配置（首次运行时写入默认值）
 * 应在 db.initDB() 之后调用
 */
function initAIConfig() {
  for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
    const existing = getConfig(key);
    if (existing === null || existing === undefined) {
      setConfig(key, defaultVal);
    }
  }
}

/**
 * 获取当前 AI 配置
 */
function getAIConfig() {
  return {
    apiBaseUrl: getConfig('api_base_url') || DEFAULTS.api_base_url,
    apiKey: getConfig('api_key') || DEFAULTS.api_key,
    aiModel: getConfig('ai_model') || DEFAULTS.ai_model,
    aiModelImage: getConfig('ai_model_image') || DEFAULTS.ai_model_image,
  };
}

/**
 * 更新 AI 配置
 * @param {Object} config - 要更新的配置项
 */
function updateAIConfig(config) {
  const allowedKeys = ['api_base_url', 'api_key', 'ai_model', 'ai_model_image'];
  for (const [key, value] of Object.entries(config)) {
    if (allowedKeys.includes(key) && value !== undefined) {
      setConfig(key, value);
    }
  }
}

module.exports = { initAIConfig, getAIConfig, updateAIConfig, DEFAULTS };
