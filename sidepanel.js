const els = {
  modeSelect: document.getElementById("modeSelect"),
  featureType: document.getElementById("featureType"),
  featureOptions: document.getElementById("featureOptions"),
  featureFilter: document.getElementById("featureFilter"),
  clipboardExtractBtn: document.getElementById("clipboardExtractBtn"),
  copyBtn: document.getElementById("copyBtn"),
  resetBtn: document.getElementById("resetBtn"),
  status: document.getElementById("status"),
  lineCount: document.getElementById("lineCount"),
  imageCount: document.getElementById("imageCount"),
  preview: document.getElementById("preview"),
  imagePreview: document.getElementById("imagePreview")
};

// --- 特征选择器逻辑 ---
const FEATURE_DATA = {
  fontColor: [
    { label: "A", value: "all", color: "#1f2329" },
    { label: "A", value: "gray", color: "#8f959e" },
    { label: "A", value: "red", color: "#d83931" },
    { label: "A", value: "orange", color: "#de7802" },
    { label: "A", value: "yellow", color: "#dc9b04" },
    { label: "A", value: "green", color: "#2ea121" },
    { label: "A", value: "blue", color: "#245bce" },
    { label: "A", value: "purple", color: "#6425d0" }
  ],
  bgColor: [
    { label: " ", value: "all", bg: "transparent" },
    // 浅色背景组
    { label: " ", value: "light_gray", bg: "#f2f3f5" },
    { label: " ", value: "light_red", bg: "#ffece8" },
    { label: " ", value: "light_orange", bg: "#fff3e8" },
    { label: " ", value: "light_yellow", bg: "#ffffcc" },
    { label: " ", value: "light_green", bg: "#e8ffea" },
    { label: " ", value: "light_blue", bg: "#e8f3ff" },
    { label: " ", value: "light_purple", bg: "#f5e8ff" },
    // 深色背景组
    { label: " ", value: "gray", bg: "#dee0e3" },
    { label: " ", value: "red", bg: "#f56c6c" },
    { label: " ", value: "orange", bg: "#ff9900" },
    { label: " ", value: "yellow", bg: "#ffcc00" },
    { label: " ", value: "green", bg: "#00b42a" },
    { label: " ", value: "blue", bg: "#165dff" },
    { label: " ", value: "purple", bg: "#722ed1" }
  ],
  specialStyle: [
    { label: "全选", value: "all" },
    { label: "粗体", value: "bold" },
    { label: "斜体", value: "italic" },
    { label: "下划线", value: "underline" },
    { label: "代码", value: "code" },
    { label: "“引号”", value: "quote" }
  ]
};

let currentFeatureType = "fontColor";
let currentFeatureValue = "all";

function renderFeatureOptions() {
  if (!els.featureOptions) return;
  els.featureOptions.innerHTML = "";
  const options = FEATURE_DATA[currentFeatureType];
  
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = currentFeatureType === "specialStyle" ? "feature-btn" : "feature-color-btn";
    if (opt.value === currentFeatureValue) btn.classList.add("active");
    
    btn.textContent = opt.label;
      // 处理复原按钮的特殊样式（带有对角线）
      if (opt.value === "all") {
        if (currentFeatureType === "bgColor") {
          btn.style.background = "linear-gradient(to top right, #fff 48%, #999 48%, #999 52%, #fff 52%)";
        }
      } else {
        if (currentFeatureType === "fontColor") {
          btn.style.color = opt.color;
        }
        if (currentFeatureType === "bgColor") {
          btn.style.backgroundColor = opt.bg;
        }
      }
    
    btn.onclick = () => {
      currentFeatureValue = opt.value;
      renderFeatureOptions();
      if (globalExtract) applyExtractToUI(globalExtract);
    };
    els.featureOptions.appendChild(btn);
  });
}

els.featureType?.addEventListener("change", (e) => {
  currentFeatureType = e.target.value;
  currentFeatureValue = "all";
  renderFeatureOptions();
  if (globalExtract) applyExtractToUI(globalExtract);
});

// 解析富文本，提取格式特征
function parseRichText(html, text) {
  if (!html) return text.split(/\n+/).map(t => ({ text: t.trim() })).filter(t => t.text);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const results = [];
  const blocks = doc.querySelectorAll('p, div, td, li, h1, h2, h3, h4, h5, h6');
  
  const seen = new Set();
  blocks.forEach(block => {
    const hasBlockChild = Array.from(block.children).some(c => 
      ['P', 'DIV', 'TD', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'TR', 'TBODY'].includes(c.tagName)
    );
    if (hasBlockChild) return;
    
    const blockText = block.textContent.trim();
    if (!blockText || seen.has(blockText)) return;
    seen.add(blockText);
    
    const styles = { color: [], bg: [], bold: false, italic: false, underline: false, code: false, quote: /["“”]/.test(blockText) };
    
    const subEls = [block, ...block.querySelectorAll('*')];
    subEls.forEach(el => {
      const st = el.style;
      if (st.color) styles.color.push(st.color);
      if (st.backgroundColor) styles.bg.push(st.backgroundColor);
      
      const tag = el.tagName.toLowerCase();
      if (tag === 'b' || tag === 'strong' || st.fontWeight === 'bold' || parseInt(st.fontWeight) >= 600) styles.bold = true;
      if (tag === 'i' || tag === 'em' || st.fontStyle === 'italic') styles.italic = true;
      if (tag === 'u' || (st.textDecoration && st.textDecoration.includes('underline'))) styles.underline = true;
      if (tag === 'code' || el.classList.contains('code')) styles.code = true;
    });
    
    results.push({
      text: blockText,
      colors: styles.color,
      bgs: styles.bg,
      bold: styles.bold,
      italic: styles.italic,
      underline: styles.underline,
      code: styles.code,
      quote: styles.quote
    });
  });
  
  if (results.length === 0) {
    return text.split(/\n+/).map(t => ({ text: t.trim() })).filter(t => t.text);
  }
  return results;
}

// 飞书预设颜色常量表 (基于飞书调色板精确映射)
const FEISHU_COLORS = {
  font: {
    'rgb(31, 35, 41)': 'all',
    'rgb(143, 149, 158)': 'gray',
    'rgb(216, 57, 49)': 'red',
    'rgb(222, 120, 2)': 'orange',
    'rgb(220, 155, 4)': 'yellow',
    'rgb(46, 161, 33)': 'green',
    'rgb(36, 91, 206)': 'blue',
    'rgb(100, 37, 208)': 'purple'
  },
  bg: {
    'rgba(0, 0, 0, 0)': 'all',
    'transparent': 'all',
    // 浅色背景组
    'rgb(242, 243, 245)': 'light_gray',
    'rgb(255, 236, 232)': 'light_red',
    'rgb(255, 243, 232)': 'light_orange',
    'rgb(255, 255, 204)': 'light_yellow',
    'rgb(232, 255, 234)': 'light_green',
    'rgb(232, 243, 255)': 'light_blue',
    'rgb(245, 232, 255)': 'light_purple',
    // 深色背景组
    'rgb(222, 224, 227)': 'gray',
    'rgb(245, 108, 108)': 'red',
    'rgb(255, 153, 0)': 'orange',
    'rgb(255, 204, 0)': 'yellow',
    'rgb(0, 180, 42)': 'green',
    'rgb(22, 93, 255)': 'blue',
    'rgb(114, 46, 209)': 'purple'
  }
};

// 颜色归类辅助
function categorizeColor(rgbStr, isBg = false) {
  if (!rgbStr) return 'all';
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return 'all';
  const r = match[1];
  const g = match[2];
  const b = match[3];
  const rgbKey = `rgb(${r}, ${g}, ${b})`;
  
  if (isBg) {
    return FEISHU_COLORS.bg[rgbKey] || 'all';
  } else {
    return FEISHU_COLORS.font[rgbKey] || 'all';
  }
}

function filterByFeature(richLines) {
  if (currentFeatureValue === "all") return richLines;
  
  return richLines.filter(r => {
    if (!r) return false;
    if (currentFeatureType === "specialStyle") {
      if (currentFeatureValue === "bold") return r.bold;
      if (currentFeatureValue === "italic") return r.italic;
      if (currentFeatureValue === "underline") return r.underline;
      if (currentFeatureValue === "code") return r.code;
      if (currentFeatureValue === "quote") return r.quote;
    }
    if (currentFeatureType === "fontColor") {
      return r.colors && r.colors.some(c => categorizeColor(c, false) === currentFeatureValue);
    }
    if (currentFeatureType === "bgColor") {
      return r.bgs && r.bgs.some(c => categorizeColor(c, true) === currentFeatureValue);
    }
    return true;
  });
}
// --- 结束特征选择器逻辑 ---

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
  const mode = els.modeSelect ? els.modeSelect.value : "image_first";
  
  let displayLines = [];
  if (mode === "text_first") {
    if (extract.richLines && extract.richLines.length > 0) {
      displayLines = filterByFeature(extract.richLines).map(r => r.text);
    } else {
      const rawLines = Array.isArray(extract?.lines) ? extract.lines : [];
      displayLines = globalThis.CopyPasteExporter.guessUiLines ? globalThis.CopyPasteExporter.guessUiLines(rawLines) : rawLines;
    }
  } else {
    const rawLines = Array.isArray(extract?.lines) ? extract.lines : [];
    displayLines = globalThis.CopyPasteExporter.guessUiLines ? globalThis.CopyPasteExporter.guessUiLines(rawLines) : rawLines;
  }
  
  return globalThis.CopyPasteExporter.rowsFromExtract(extract || {}, mode, displayLines);
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

function applyExtractToUI(extract, modeOverride) {
  globalExtract = extract;
  const mode = modeOverride || (els.modeSelect ? els.modeSelect.value : "image_first");
  
  let displayLines = [];
  if (mode === "text_first") {
    if (extract.richLines && extract.richLines.length > 0) {
      displayLines = filterByFeature(extract.richLines).map(r => r.text);
    } else {
      const rawLines = Array.isArray(extract?.lines) ? extract.lines : [];
      displayLines = globalThis.CopyPasteExporter.guessUiLines ? globalThis.CopyPasteExporter.guessUiLines(rawLines) : rawLines;
    }
  } else {
    const rawLines = Array.isArray(extract?.lines) ? extract.lines : [];
    displayLines = globalThis.CopyPasteExporter.guessUiLines ? globalThis.CopyPasteExporter.guessUiLines(rawLines) : rawLines;
  }
  
  const images = Array.isArray(extract?.images) ? extract.images : [];
  els.lineCount.textContent = String(displayLines.length);
  els.imageCount.textContent = String(images.length);
  setPreview(displayLines);
  
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

  els.copyBtn.disabled = displayLines.length === 0 && images.length === 0;
}

async function init() {
  const { mode } = await storageSyncGet({ mode: "image_first" });
  if (els.modeSelect) {
    els.modeSelect.value = mode || "image_first";
    if (els.featureFilter) {
      els.featureFilter.style.display = (mode === "text_first") ? "block" : "none";
    }
  }
  
  const last = await loadLastExtract();
  if (last) applyExtractToUI(last, mode || "image_first");
  
  // 渲染一次默认特征按钮
  renderFeatureOptions();
}

els.modeSelect?.addEventListener("change", async () => {
  const mode = els.modeSelect.value;
  if (els.featureFilter) {
    els.featureFilter.style.display = mode === "text_first" ? "block" : "none";
  }
  await storageSyncSet({ mode });
  if (globalExtract) {
    applyExtractToUI(globalExtract, mode);
  }
});

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
    // 新增：提取富文本特征 (支持模式2)
      const richLines = parseRichText(htmlContent, textContent);

      const extractMode = els.modeSelect ? els.modeSelect.value : "image_first";
      const res = await chrome.runtime.sendMessage({
        type: "CP_PROCESS_CLIPBOARD",
        payload: { html: htmlContent, text: textContent, mode: extractMode, richLines }
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
        for (let i = 0; i < extract.images.length; i++) {
           const img = extract.images[i];
           if (!img.ocrText || img.ocrText === "等待OCR...") {
              setStatus(`正在用大模型识别图片 ${i + 1} / ${extract.images.length} ...`, "normal");
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
