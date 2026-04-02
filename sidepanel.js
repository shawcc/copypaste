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
  imagePreview: document.getElementById("imagePreview"),
  quizOverlay: document.getElementById("quizOverlay"),
  quizTitle: document.getElementById("quizTitle"),
  quizDesc: document.getElementById("quizDesc"),
  quizQuestion: document.getElementById("quizQuestion"),
  quizOptions: document.getElementById("quizOptions"),
  quizSubmitBtn: document.getElementById("quizSubmitBtn"),
  quizStatus: document.getElementById("quizStatus")
};

// --- 防滥用答题逻辑 ---
const QUIZ_QUESTIONS = [
  {
    q: "在 Meego 多语言原则中，“多语言”指的是什么？",
    opts: ["A. 支持用户输入多种语言", "B. 按用户偏好语种展示对应文案的能力", "C. 仅支持中英双语切换", "D. 系统内所有文案必须人工翻译"],
    ans: 1
  },
  {
    q: "关于“原文”和“译文”，以下哪项说法正确？",
    opts: ["A. 原文可以为空，译文不能为空", "B. 原文和译文都必须齐备", "C. 原文是用户/系统写入的最原本文案，不能为空；译文是在不同语种下的翻译文案，可以为空", "D. 译文就是品牌语种下的默认文案"],
    ans: 2
  },
  {
    q: "以下哪项最准确描述了“品牌语种”？",
    opts: ["A. 用户个人设置中的语言偏好", "B. 多语言开关中启用的语种", "C. 产品面向市场的默认品牌语言，例如飞书项目为中文，Meegle 为 EN", "D. 当前页面展示时优先使用的译文语种"],
    ans: 2
  },
  {
    q: "对于“系统文案”，以下哪项是正确的？",
    opts: ["A. 有原文概念，且管理员可修改", "B. 无原文概念，不可修改，不支持在多语言大表中配置", "C. 只能展示中文", "D. 默认按品牌语种展示，不受用户偏好语种影响"],
    ans: 1
  },
  {
    q: "关于“空间配置文案”，以下哪项说法正确？",
    opts: ["A. 默认不支持多语言", "B. 默认支持多语言，如需逃逸需要填写“逃逸说明”", "C. 配置侧和用户侧都始终展示译文", "D. 原文不是必填项"],
    ans: 1
  },
  {
    q: "对于“用户文案（非配置侧文案）”，当前阶段默认策略是什么？",
    opts: ["A. 默认支持多语言，并必须在多语言大表配置", "B. 默认不支持多语言，如有明确需求可支持用户侧翻译", "C. 只能按品牌语种展示", "D. 必须提供中英日三语译文"],
    ans: 1
  },
  {
    q: "关于搜索场景的多语言规则，以下哪项正确？",
    opts: ["A. 配置侧和用户侧都只支持原文匹配", "B. 配置侧仅支持译文匹配，用户侧仅支持原文匹配", "C. 配置侧支持原文/任一译文匹配；用户侧仅支持用户偏好语种对应译文匹配", "D. 配置侧和用户侧都支持原文/任一译文匹配"],
    ans: 2
  },
  {
    q: "以下哪项最符合“目标导向”？",
    opts: ["A. 先做功能，价值以后再补", "B. 每个需求都能说明与产品目标和长期价值的关系", "C. 客户提的需求默认最高优先级", "D. 只要能上线，是否和目标相关不重要"],
    ans: 1
  },
  {
    q: "以下哪项最符合“关注结果”？",
    opts: ["A. 功能上线后即可视为需求结束", "B. 上线后只要完成规定动作即可", "C. 上线后主动宣推、关注渗透率、追问反馈，并快速形成优化计划", "D. 上线后问题交给运营处理，PM 不必持续跟进"],
    ans: 2
  },
  {
    q: "根据“高标准”原则，以下哪项做法是正确的？",
    opts: ["A. 复杂功能上线前不必做 demo，只要 PRD 写清楚即可", "B. 明知状态/类型无法聚合，也可以先带问题上线", "C. 在动手做方案前，先想清楚功能的理想终态和分阶段路径", "D. 线上问题如果不是 bug，可以先放一放"],
    ans: 2
  }
];

let currentQuizIndex = -1;
let quizState = { unlocked: false, attempts: 0, lockTime: 0 };

async function initQuiz() {
  const data = await new Promise(r => chrome.storage.local.get(['cpQuizState'], r));
  if (data.cpQuizState) quizState = data.cpQuizState;

  const now = Date.now();
  // 检查是否在锁定状态 (10分钟)
  if (quizState.attempts >= 3 && quizState.lockTime > 0) {
    if (now - quizState.lockTime < 10 * 60 * 1000) {
      showQuizLock();
      return false;
    } else {
      // 锁定过期，重置
      quizState.attempts = 0;
      quizState.lockTime = 0;
      await saveQuizState();
    }
  }

  if (quizState.unlocked) {
    els.quizOverlay.style.display = 'none';
    return true;
  }

  // 否则展示答题
  showRandomQuiz();
  return false;
}

function showQuizLock() {
  els.quizOverlay.style.display = 'flex';
  els.quizTitle.textContent = "已锁定";
  els.quizTitle.style.color = "#dc2626";
  els.quizDesc.textContent = "连续答错3次，请等待10分钟后再试。";
  els.quizQuestion.textContent = "";
  els.quizOptions.innerHTML = "";
  els.quizSubmitBtn.style.display = "none";
  els.quizStatus.textContent = "";
}

function showRandomQuiz() {
  els.quizOverlay.style.display = 'flex';
  currentQuizIndex = Math.floor(Math.random() * QUIZ_QUESTIONS.length);
  const q = QUIZ_QUESTIONS[currentQuizIndex];
  
  els.quizQuestion.textContent = q.q;
  els.quizOptions.innerHTML = "";
  
  q.opts.forEach((optText, i) => {
    const label = document.createElement("label");
    label.className = "quiz-opt-label";
    
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "quizOpt";
    radio.value = i;
    radio.onchange = () => { els.quizSubmitBtn.disabled = false; };
    
    label.appendChild(radio);
    label.appendChild(document.createTextNode(optText));
    els.quizOptions.appendChild(label);
  });
  
  els.quizSubmitBtn.disabled = true;
  els.quizStatus.textContent = `当前机会：${3 - quizState.attempts}/3`;
}

async function saveQuizState() {
  return new Promise(r => chrome.storage.local.set({ cpQuizState: quizState }, r));
}

els.quizSubmitBtn?.addEventListener("click", async () => {
  const selected = document.querySelector('input[name="quizOpt"]:checked');
  if (!selected) return;
  
  const ansIndex = parseInt(selected.value, 10);
  const q = QUIZ_QUESTIONS[currentQuizIndex];
  
  if (ansIndex === q.ans) {
    // 答对
    quizState.unlocked = true;
    quizState.attempts = 0;
    quizState.lockTime = 0;
    await saveQuizState();
    els.quizOverlay.style.display = 'none';
    setStatus("验证通过，可以开始使用了！", "ok");
  } else {
    // 答错
    quizState.attempts++;
    if (quizState.attempts >= 3) {
      quizState.lockTime = Date.now();
      await saveQuizState();
      showQuizLock();
    } else {
      await saveQuizState();
      els.quizStatus.textContent = `回答错误！剩余机会：${3 - quizState.attempts}/3`;
      els.quizStatus.style.color = "#dc2626";
    }
  }
});
// --- 结束防滥用答题逻辑 ---

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
      if (opt.value !== "all" && currentFeatureType === "fontColor") {
        btn.style.color = opt.color;
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
    'rgb(100, 37, 208)': 'purple',
    // 兼容带有 rgba 透明度的飞书颜色情况或细微的色值偏移
    'rgba(36, 91, 206, 1)': 'blue',
    'rgb(51, 112, 255)': 'blue', // 新版飞书蓝
    'rgb(20, 86, 240)': 'blue',  // 新版飞书深蓝
    'rgb(22, 93, 255)': 'blue',
    'rgb(31, 35, 41)': 'all'
  }
};

// 颜色归类辅助 (回退至效果最好的 HSL 算法)
function categorizeColor(colorStr) {
  if (!colorStr) return 'all';
  
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return 'all';
  
  let r = parseInt(match[1]);
  let g = parseInt(match[2]);
  let b = parseInt(match[3]);
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

  if (a < 1) {
    r = Math.round((1 - a) * 255 + a * r);
    g = Math.round((1 - a) * 255 + a * g);
    b = Math.round((1 - a) * 255 + a * b);
  }

  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;

  if (max !== min) {
    if (max === rNorm) h = (gNorm - bNorm) / (max - min) + (gNorm < bNorm ? 6 : 0);
    else if (max === gNorm) h = (bNorm - rNorm) / (max - min) + 2;
    else h = (rNorm - gNorm) / (max - min) + 4;
    h *= 60;
  }
  
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  
  // 灰度判断 (饱和度极低或三色相近)
  if (s < 0.15 || (Math.abs(r-g)<15 && Math.abs(g-b)<15 && Math.abs(r-b)<15)) {
    if (r > 240 && g > 240 && b > 240) return 'all'; // 太亮接近白
    if (r < 40 && g < 40 && b < 40) return 'all';   // 太暗接近黑
    return 'gray';
  }

  // 根据色相划定范围
  if (h < 15 || h >= 330) return 'red';
  if (h >= 15 && h < 38) return 'orange';
  if (h >= 38 && h < 75) return 'yellow';
  if (h >= 75 && h < 165) return 'green';
  if (h >= 165 && h < 250) return 'blue';
  if (h >= 250 && h < 330) return 'purple';

  return 'all';
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
      return r.colors && r.colors.some(c => categorizeColor(c) === currentFeatureValue);
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
  const passed = await initQuiz();
  if (!passed) {
    // wait for quiz to pass, though other parts of UI can initialize
  }

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

      // 总是使用部署在 Vercel 上的安全代理接口
      const apiUrl = "https://copypaste-tau.vercel.app/api/ocr";
      const apiModel = ""; 
      const apiKey = ""; 
      
      const hasLlmConfig = true;

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
