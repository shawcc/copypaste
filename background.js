const MENU_EXTRACT = "cp_extract_selection";
const MENU_SCROLL_START = "cp_scroll_start";
const MENU_SCROLL_STOP = "cp_scroll_stop";

function ensureDefaults() {
  chrome.storage.sync.get({ languages: ["en-US"] }, (existing) => {
    const langs = existing && Array.isArray(existing.languages) ? existing.languages : [];
    if (langs.length > 0) return;
    chrome.storage.sync.set({ languages: ["en-US"] });
  });
}

function ensureMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_EXTRACT,
      title: "CopyPaste：提取选区",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: MENU_SCROLL_START,
      title: "CopyPaste：开始滚动提取",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: MENU_SCROLL_STOP,
      title: "CopyPaste：停止滚动提取",
      contexts: ["page"]
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
  ensureMenus();
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
});

chrome.runtime.onStartup?.addListener(() => {
  ensureMenus();
});

function injectThenSend(tabId, message) {
  const inject = () =>
    new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        { target: { tabId, allFrames: true }, files: ["content_script.js"] },
        () => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve();
        }
      );
    });

  const send = () =>
    new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (res) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(res);
      });
    });

  return send().catch(async () => {
    await inject();
    return send();
  });
}

async function extractToSession(tabId) {
  const res = await injectThenSend(tabId, { type: "CP_EXTRACT_SELECTION" });
  if (!res || !res.ok) throw new Error(res?.error || "提取失败");

  await new Promise((resolve, reject) => {
    chrome.storage.local.set({ lastExtract: res }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });

  chrome.action.setBadgeText({ tabId, text: "OK" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
}

async function startScrollToSession(tabId) {
  await injectThenSend(tabId, { type: "CP_SCROLL_EXTRACT_START" });
  chrome.storage.local.set({ scrollState: { running: true } });
  chrome.action.setBadgeText({ tabId, text: "RUN" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
}

async function stopScroll(tabId) {
  await injectThenSend(tabId, { type: "CP_SCROLL_EXTRACT_STOP" });
  chrome.storage.local.set({ scrollState: { running: false } });
  chrome.action.setBadgeText({ tabId, text: "" });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_EXTRACT) {
    extractToSession(tab.id).catch(() => {
      chrome.action.setBadgeText({ tabId: tab.id, text: "ERR" });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b91c1c" });
    });
    return;
  }
  if (info.menuItemId === MENU_SCROLL_START) {
    startScrollToSession(tab.id).catch(() => {
      chrome.action.setBadgeText({ tabId: tab.id, text: "ERR" });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b91c1c" });
    });
    return;
  }
  if (info.menuItemId === MENU_SCROLL_STOP) {
    stopScroll(tab.id).catch(() => {
      chrome.action.setBadgeText({ tabId: tab.id, text: "ERR" });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b91c1c" });
    });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "cp_extract_selection") return;
  if (!tab?.id) return;
  extractToSession(tab.id).catch(() => {
    chrome.action.setBadgeText({ tabId: tab.id, text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b91c1c" });
  });
});

let tabImageCache = {};

// 监听并拦截所有的网络请求，抓出里面藏着的图片链接
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const url = details.url;
    
    // 拦截飞书特有的图片流接口和常规图片
    if (url.includes('space/api/box/stream/download') || 
        url.includes('internal-api-drive-stream') ||
        details.type === 'image') {
        
        // 过滤头像和图标
        if (url.includes('avatar') || url.includes('icon') || url.includes('emoji')) return;

        if (!tabImageCache[details.tabId]) {
          tabImageCache[details.tabId] = new Set();
        }
        tabImageCache[details.tabId].add(url);
    }
  },
  { urls: ["*://*.feishu.cn/*", "*://*.larksuite.com/*", "*://*.larkoffice.com/*"] }
);

// 清理关闭的标签页缓存
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabImageCache[tabId];
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "GET_CACHED_IMAGES") {
    const tabId = sender.tab ? sender.tab.id : msg.tabId;
    const urls = tabImageCache[tabId] ? Array.from(tabImageCache[tabId]) : [];
    sendResponse({ urls });
    return true;
  }

  if (msg.type === "CP_SCROLL_EXTRACT_UPDATE") {
    chrome.storage.local.set(
      { lastExtract: msg.payload, scrollState: msg.state },
      () => sendResponse({ ok: true })
    );
    return true;
  }
  if (msg.type === "CP_SCROLL_EXTRACT_DONE") {
    chrome.storage.local.set(
      { lastExtract: msg.payload, scrollState: { running: false } },
      () => sendResponse({ ok: true })
    );
    return true;
  }

  if (msg.type === "CP_PROCESS_CLIPBOARD") {
    handleClipboardExtract(msg.payload).then(data => {
      sendResponse({ ok: true, data });
    }).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  if (msg.type === "CP_FETCH_IMAGE") {
    // 飞书图片的 URL 可能有重定向或鉴权，这里直接加上 fetch 的凭证并忽略 cors 报错
    fetch(msg.url, { credentials: 'omit', mode: 'no-cors' })
      .then(res => {
        return res.blob();
      })
      .then(blob => {
        if (blob.size === 0) throw new Error("Empty image blob");
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ ok: true, dataUrl: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch(err => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (msg.type === "CP_OCR_LLM") {
    // 去 storage 里读一下原来保存的自定义配置，如果有就传过去，没有就是 undefined
    chrome.storage.local.get({ apiUrl: "", apiModel: "", apiKey: "" }, (items) => {
      handleLLMOCR({
        base64Image: msg.payload.base64Image,
        apiUrl: msg.payload.apiUrl || items.apiUrl || "https://copypaste-tau.vercel.app/api/ocr",
        apiModel: msg.payload.apiModel || items.apiModel,
        apiKey: msg.payload.apiKey || items.apiKey
      }).then(res => {
        sendResponse({ ok: true, text: res });
      }).catch(err => {
        sendResponse({ ok: false, error: err.message });
      });
    });
    return true;
  }
});

async function handleLLMOCR({ base64Image, apiUrl, apiModel, apiKey }) {
  // 去除 data:image/png;base64, 前缀
  const base64Data = base64Image.split(',')[1] || base64Image;
  
  // 如果请求的是我们的 Vercel 代理接口
  if (apiUrl.includes('vercel.app')) {
    const payload = {
      base64Image: base64Data,
      customApiUrl: "",
      customApiModel: apiModel, // 可能为空，留空则让 Vercel 去读它的环境变量
      customApiKey: apiKey      // 同上
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      // 增强容错，如果后端代理挂了，把错误信息透传出去
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Upstream API Error 400: ${errText}`);
      } else if (response.status >= 500) {
        throw new Error(`Upstream API Error 500: ${errText}`);
      }
      throw new Error(`API Error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.text) {
      return data.text;
    }
    throw new Error(data.error || "Invalid API response format");
  }

  // 否则，走标准的直接请求大模型 API (用于用户自定义配置的情况)
  const payload = {
    model: apiModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "请提取这张图片中的所有文案文字，只需要返回提取到的纯文本，不需要任何其他描述或格式化标记。如果图片中没有文字，请回复'无文字'。" },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
        ]
      }
    ]
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (data.choices && data.choices.length > 0 && data.choices[0].message) {
    return data.choices[0].message.content;
  }
  throw new Error("Invalid API response format");
}

// 处理剪贴板 HTML/Text 数据
async function handleClipboardExtract({ html, text, mode, richLines }) {
  // 1. 解析纯文本
  const rawText = text || "";
  const lines = rawText.split(/\n+/g).map(s => s.trim()).filter(Boolean);
  
  // 简单模拟 guessUiLines (因为 background 无法访问 DOM)
  const uiLines = lines.filter(s => {
    if (s.length > 120) return false;
    if (/^https?:\/\//i.test(s)) return false;
    if (/^(?:模块|方案|背景|目标|范围|说明|备注|结论|实现|设计|流程)\b/.test(s)) return false;
    return true;
  });

  // 2. 解析 HTML 中的图片
  const images = [];
  if (html) {
    const seen = new Set();
    
    // 粗暴的正则匹配找出所有 img 标签，提取 src 和 data-src
    const imgTagRegex = /<img([^>]+)>/gi;
    let match;
    while ((match = imgTagRegex.exec(html)) !== null) {
      const imgAttrs = match[1];
      
      // 优先取 data-src，因为在飞书复制的 HTML 中 data-src 往往是真实原图，src 可能是低清缩略图或占位图
      let srcMatch = imgAttrs.match(/data-src=["']([^"']+)["']/i);
      if (!srcMatch) {
        srcMatch = imgAttrs.match(/src=["']([^"']+)["']/i);
      }
      
      if (!srcMatch) continue;
      let src = srcMatch[1];
      
      // 飞书有时在 src 里放占位符
      if (src.includes('base64,PHN2Zy')) continue; 
      
      // 如果 src 是相对路径，拼上当前网页的 origin
      if (src.startsWith('/')) {
        try {
          const fakeOrigin = "https://feishu.cn"; // 或者从某个地方获取真正的 origin
          src = new URL(src, fakeOrigin).href;
        } catch(e) {}
      }
      
      // 去重：飞书剪贴板有时会带相同的 token 但参数略微不同的 URL，通过提取核心 token 来去重
      let dedupeKey = src;
      try {
        const urlObj = new URL(src);
        if (urlObj.pathname) {
          // 获取路径最后一部分作为 token，例如 /space/api/box/stream/download/xxx -> xxx
          const parts = urlObj.pathname.split('/');
          const token = parts.pop() || parts.pop(); // 防止最后有斜杠
          if (token && token.length > 10) {
            dedupeKey = token;
          } else {
            // 如果路径没有长 token，我们直接去掉 query 参数作为去重 key
            dedupeKey = urlObj.origin + urlObj.pathname;
          }
        }
      } catch (e) {
        // 如果不是合法 URL，保留原样
      }
      
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        images.push({ src, alt: "剪贴板图片" });
      }
    }
  }

  const result = {
    ok: true,
    lines,
    uiLines,
    images
  };

  // 模拟之前的内容合并逻辑，把它存入 local storage
  const stored = await chrome.storage.local.get("lastExtract");
  let merged = stored.lastExtract || { lines: [], uiLines: [], images: [], richLines: [] };
  
  merged.lines = merged.lines.concat(lines);
  merged.uiLines = merged.uiLines.concat(uiLines);
  merged.images = merged.images.concat(images);
  merged.richLines = (merged.richLines || []).concat(richLines || []);

  await chrome.storage.local.set({ lastExtract: merged });

  return merged;
}
