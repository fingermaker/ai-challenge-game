/**
 * AI 请求并发限流队列
 *
 * 防止高并发 AI 请求导致服务器 OOM 崩溃。
 * 12组同时使用时最多 36 个并发 AI 请求，单个请求含 1-5MB base64 图片。
 * 本模块将并发数限制在 MAX_CONCURRENT，超出则进入等待队列。
 */

const MAX_CONCURRENT = 4;        // 最大并发数（匹配 4 核 CPU）
const QUEUE_MAX_SIZE = 20;       // 队列上限，超出则拒绝（防止内存无限堆积）
const REQUEST_TIMEOUT_MS = 60000; // 单请求超时 60s（AI 生成图片较慢）

let activeCount = 0;
const queue = [];

/**
 * 将 async 函数 fn 纳入限流控制执行。
 * @param {Function} fn - 返回 Promise 的异步函数（AI 请求逻辑）
 * @returns {Promise} fn 的返回值
 */
function runWithQueue(fn) {
  return new Promise((resolve, reject) => {
    if (queue.length >= QUEUE_MAX_SIZE) {
      return reject(new Error('AI服务繁忙，请稍后重试'));
    }

    const task = { fn, resolve, reject };

    if (activeCount < MAX_CONCURRENT) {
      executeTask(task);
    } else {
      queue.push(task);
    }
  });
}

function executeTask(task) {
  activeCount++;

  // Bug fix: guard against double-call of finishTask.
  // Without this, if the timeout fires first (calling finishTask once), then
  // task.fn() eventually settles and .finally(finishTask) fires a second time,
  // causing activeCount to go negative and breaking the concurrency limit.
  let finished = false;

  function safeFinish() {
    if (finished) return;
    finished = true;
    finishTask();
  }

  // 超时保护：防止单个 AI 请求永久挂起占用并发槽位
  const timeoutId = setTimeout(() => {
    task.reject(new Error('AI请求超时，请重试'));
    safeFinish();
  }, REQUEST_TIMEOUT_MS);

  task.fn()
    .then(result => {
      clearTimeout(timeoutId);
      task.resolve(result);
    })
    .catch(err => {
      clearTimeout(timeoutId);
      task.reject(err);
    })
    .finally(safeFinish);
}

function finishTask() {
  activeCount--;
  if (queue.length > 0 && activeCount < MAX_CONCURRENT) {
    const next = queue.shift();
    executeTask(next);
  }
}

// 仅用于测试和监控
function getStats() {
  return { activeCount, queueLength: queue.length, MAX_CONCURRENT, QUEUE_MAX_SIZE };
}

module.exports = { runWithQueue, getStats };
