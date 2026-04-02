const els = {
  clipboardExtractBtn: document.getElementById("clipboardExtractBtn"),
  copyBtn: document.getElementById("copyBtn"),
  resetBtn: document.getElementById("resetBtn"),
  status: document.getElementById("status"),
  lineCount: document.getElementById("lineCount"),
  imageCount: document.getElementById("imageCount"),
  preview: document.getElementById("preview"),
  imagePreview: document.getElementById("imagePreview")
};

function setStatus(text, tone = "normal") {
  els.status.textContent = text || "";
  els.status.style.color =
    tone === "error" ? "#b91c1c" : tone === "ok" ? "#065f46" : "#374151";
}

async function getActiveTab() {
  return new Promise((resolve, reject) => {
    // 侧边栏里获取真正的网页 tab，需要更宽泛的查询，排除扩展页面
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let tab = (tabs || []).find(t => t.url && !t.url.startsWith('chrome-extension://'));
      if (tab) return resolve(tab);
      
      // 如果当前窗口找不到，尝试 lastFocusedWindow
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs2) => {
        let tab2 = (tabs2 || []).find(t => t.url && !t.url.startsWith('chrome-extension://'));
        if (tab2) return resolve(tab2);
        
        // 兜底：获取所有标签页里的活跃飞书页面
        chrome.tabs.query({}, (allTabs) => {
          let tab3 = (allTabs || []).find(t => 
            t.active && t.url && (t.url.includes('feishu.cn') || t.url.includes('larksuite.com') || t.url.includes('larkoffice.com'))
          );
          if (tab3) return resolve(tab3);
          reject(new Error("未找到飞书文档标签页"));
        });
      });
    });
  });
}



function setPreview(lines) {
  els.preview.replaceChildren();
  const show = (lines || []).slice(0, 8);
  for (const line of show) {
    const li = document.createElement("li");
    li.textContent = line;
    els.preview.appendChild(li);
  }
  if ((lines || []).length > show.length) {
    const li = document.createElement("li");
    li.textContent = `… 还有 ${lines.length - show.length} 条`;
    els.preview.appendChild(li);
  }
}

function storageSyncGet(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(defaults, (items) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(items);
    });
  });
}

function storageSyncSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function buildRows(extract) {
  return globalThis.CopyPasteExporter.rowsFromExtract(extract || {});
}

async function copyAsTable(extract) {
  const { languages } = await storageSyncGet({ languages: ["en-US"] });
  const langs = Array.isArray(languages) ? languages.filter(Boolean) : ["en-US"];
  // 总是重新 build rows，这里直接调用 rowsFromExtract，将使用基于 OCR 的智能匹配
  const rows = buildRows(extract);
  const html = globalThis.CopyPasteExporter.htmlTableFromRows(rows, langs);
  const tsv = globalThis.CopyPasteExporter.tsvFromRows(rows, langs);

  if (globalThis.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([tsv], { type: "text/plain" })
      })
    ]);
    return { rows: rows.length, languages: langs };
  }

  await navigator.clipboard.writeText(tsv);
  return { rows: rows.length, languages: langs };
}

async function loadLastExtract() {
  return new Promise((resolve, reject) => {
    chrome.storage.session.get({ lastExtract: null }, (items) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(items.lastExtract || null);
    });
  });
}

async function saveLastExtract(extract) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set({ lastExtract: extract }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

let globalExtract = null;

function applyExtractToUI(extract) {
  globalExtract = extract;
  const rows = Array.isArray(extract?.rows) ? extract.rows : [];
  const lines = rows.length ? rows.map((r) => r.text) : Array.isArray(extract?.lines) ? extract.lines : [];
  const images = Array.isArray(extract?.images) ? extract.images : [];
  els.lineCount.textContent = String(lines.length);
  els.imageCount.textContent = String(images.length);
  setPreview(lines);
  
  // 渲染图片预览
  if (els.imagePreview) {
    els.imagePreview.replaceChildren();
    for (const img of images) {
      const src = typeof img === 'string' ? img : img.src;
      if (!src) continue;
      const el = document.createElement('img');
      el.src = src;
      el.title = typeof img === 'string' ? '' : (img.alt || '');
      els.imagePreview.appendChild(el);
    }
  }

  els.copyBtn.disabled = lines.length === 0 && images.length === 0;
}

async function init() {
  const last = await loadLastExtract();
  if (last) applyExtractToUI(last);
}

// Remove unused functions
// (extractSelection, toggleScrollExtract, refreshScrollState have been removed)

els.clipboardExtractBtn?.addEventListener("click", async () => {
  setStatus("正在读取剪贴板…");
  els.clipboardExtractBtn.disabled = true;
  try {
    // 1. 读取剪贴板内容
    const items = await navigator.clipboard.read();
    let htmlContent = "";
    let textContent = "";
    
    for (const item of items) {
      if (item.types.includes("text/html")) {
        const blob = await item.getType("text/html");
        htmlContent = await blob.text();
      }
      if (item.types.includes("text/plain")) {
        const blob = await item.getType("text/plain");
        textContent = await blob.text();
      }
    }

    if (!htmlContent && !textContent) {
      throw new Error("剪贴板为空，请先在飞书里框选并按 Command+C 复制");
    }

    // 2. 将提取任务发给 background 处理（利用现有的合并逻辑）
    const extractMode = "ui";
  const res = await chrome.runtime.sendMessage({
    type: "CP_PROCESS_CLIPBOARD",
    payload: { html: htmlContent, text: textContent, mode: extractMode }
  });

    if (!res || !res.ok) {
      throw new Error(res?.error || "处理剪贴板数据失败");
    }

    applyExtractToUI(res.data);
    setStatus("剪贴板提取成功！", "ok");
  } catch (e) {
    setStatus(String(e && e.message ? e.message : e), "error");
  } finally {
    els.clipboardExtractBtn.disabled = false;
  }
});



els.copyBtn.addEventListener("click", async () => {
  setStatus("复制中… (如果包含 OCR 可能需要几秒钟)");
  els.copyBtn.disabled = true;
  try {
    const extract = globalExtract || await loadLastExtract();
    if (!extract) throw new Error("没有可复制的数据，请先提取选中内容");

      // 提前把所有提取出来的图片转为 Base64（不管需不需要 OCR），以保证复制出来的都是安全格式
      setStatus("正在预处理图片格式，请稍候...");
      for (const img of extract.images) {
        if (!img.base64 && typeof img !== 'string' && img.src) {
           try {
             const fetchRes = await chrome.runtime.sendMessage({ type: "CP_FETCH_IMAGE", url: img.src });
             if (fetchRes && fetchRes.ok && fetchRes.dataUrl) {
               img.base64 = fetchRes.dataUrl;
             }
           } catch(e) {
             console.log("获取 base64 失败", e);
           }
        }
      }

      // 检查是否有配置高级大模型 OCR 接口，如果没有，使用内置的兜底配置
      const settings = await new Promise(resolve => {
        chrome.storage.sync.get(["ocrApiUrl", "ocrApiModel", "ocrApiKey"], resolve);
      });
      
      // 指向你在 Vercel 上部署的安全代理接口
      const defaultApiUrl = "https://copypaste-tau.vercel.app/api/ocr";
      
      const apiUrl = settings.ocrApiUrl || defaultApiUrl;
      const apiModel = settings.ocrApiModel || ""; // 如果用户填了就用用户的，否则留空让代理层去读环境变量
      const apiKey = settings.ocrApiKey || ""; // 同上
      
      // 只要有了 apiUrl，就说明配置好了（使用我们的安全代理）
      const hasLlmConfig = !!apiUrl;

      // 如果启用了 OCR，我们在复制前把图片送去识别
      if ((hasLlmConfig || typeof Tesseract !== 'undefined') && extract.images && extract.images.length > 0) {
        setStatus(`正在进行图片 OCR 识别 (${hasLlmConfig ? '大模型云端识别' : '本地模型首次需下载'})...`);
        for (const img of extract.images) {
           if (!img.ocrText || img.ocrText === "等待OCR...") {
              try {
                 const fetchRes = { ok: true, dataUrl: img.base64 };
                 if (!fetchRes.dataUrl) {
                    img.ocrText = "无图片数据";
                    continue;
                 }
                 
                 if (hasLlmConfig) {
                    // 走高级大模型接口
                    try {
                      const res = await chrome.runtime.sendMessage({
                        type: "CP_OCR_LLM",
                        payload: {
                          base64Image: fetchRes.dataUrl,
                          apiUrl: apiUrl,
                          apiModel: apiModel,
                          apiKey: apiKey
                        }
                      });
                      if (res && res.ok && res.text) {
                         img.ocrText = res.text;
                      } else {
                         img.ocrText = `API失败: ${res?.error || "未知"}`;
                      }
                    } catch(apiErr) {
                      img.ocrText = "API请求异常";
                    }
                 } else {
                    // 走本地 Tesseract 兜底
                    const ocrPromise = Tesseract.recognize(fetchRes.dataUrl, 'chi_sim+eng');
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('本地OCR超时')), 20000));
                    
                    const result = await Promise.race([ocrPromise, timeoutPromise]);
                    img.ocrText = result && result.data && result.data.text ? result.data.text : "识别为空";
                 }
              } catch(e) {
                 console.error("OCR 失败", e);
                 img.ocrText = typeof e.message === 'string' ? `失败: ${e.message.substring(0,10)}` : "OCR出错";
              }
           }
        }
      }

    const res = await copyAsTable(extract);
    setStatus(`已复制：${res.rows} 条，请直接去飞书粘贴`, "ok");
  } catch (e) {
    setStatus(String(e && e.message ? e.message : e), "error");
  } finally {
    els.copyBtn.disabled = false;
  }
});

els.resetBtn?.addEventListener("click", async () => {
  try {
    await saveLastExtract(null);
    applyExtractToUI(null);
    setStatus("已重置清空", "ok");
  } catch (e) {
    setStatus(String(e && e.message ? e.message : e), "error");
  }
});

init();

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.lastExtract && changes.lastExtract.newValue) {
    applyExtractToUI(changes.lastExtract.newValue);
    setStatus("已提取最新内容", "ok");
  }
});
