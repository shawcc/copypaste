(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CopyPasteExporter = factory();
})(globalThis, function () {
  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("\n", " ");
  }

  function pad3(n) {
    return String(n).padStart(3, "0");
  }

  function guessUiLines(lines) {
    return lines.filter(s => {
      if (!s) return false;
      if (s.length > 100) return false; // 太长的一般不是UI文案，放宽到100字符
      if (/^https?:\/\//i.test(s)) return false; // 网址
      if (/^(?:背景|目标|范围|说明|备注|结论|实现|设计|流程|交互|逻辑|规则|前提|限制|版本|记录)\b/.test(s)) return false;
      if (/^[-—]+$/.test(s)) return false; // 分割线
      return true;
    });
  }

  function getSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    
    // 移除空白字符后比较
    const clean1 = s1.replace(/\s+/g, '');
    const clean2 = s2.replace(/\s+/g, '');
    if (!clean1 || !clean2) return 0;
    if (clean1 === clean2) return 1;
    if (clean1.includes(clean2)) return clean2.length / clean1.length;
    if (clean2.includes(clean1)) return clean1.length / clean2.length;
    
    // Levenshtein 距离算法
    const m = clean1.length;
    const n = clean2.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = clean1[i - 1] === clean2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // 删除
          dp[i][j - 1] + 1,      // 插入
          dp[i - 1][j - 1] + cost // 替换
        );
      }
    }
    
    const maxLen = Math.max(m, n);
    return (maxLen - dp[m][n]) / maxLen;
  }

  function rowsFromExtract(extract, mode, displayLines, compactMode = false) {
    const images = Array.isArray(extract?.images) ? extract.images : [];
    const rows = [];
    
    if (mode === "text_first") {
      const uiLines = displayLines || [];
      const seenImages = new Set();
      
      for (let i = 0; i < uiLines.length; i++) {
        const uiLine = uiLines[i];
        let bestImg = null;
        let bestScore = 0;
        let bestOcrSegment = "";

        for (const img of images) {
          const ocrTextRaw = img.ocrText || "";
          const ocrSegments = ocrTextRaw.split(/\n+/).map(s => s.trim()).filter(Boolean);
          
          for (const seg of ocrSegments) {
            const score = getSimilarity(uiLine, seg);
            if (score > bestScore && score > 0.3) {
              bestScore = score;
              bestImg = img;
              bestOcrSegment = seg;
            }
          }
        }

        const imgsToOutput = (bestImg && !seenImages.has(bestImg)) ? [bestImg] : [];
        if (bestImg) seenImages.add(bestImg);

        rows.push({
          text: uiLine,
          images: imgsToOutput,
          ocrText: bestOcrSegment || ""
        });
      }
      return rows;
    }

    // mode === "image_first" 或默认
    // 如果没有图片，把文档里的文案全部列出来
    if (!images || images.length === 0) {
      if (compactMode) {
        // 如果是精简模式且没有图片，则没有值得贴的，或者直接返回空
        return [];
      }
      return (displayLines || []).map(text => ({ text, images: [], ocrText: "" }));
    }

    // 复制一份 PRD 里提取到的所有文案，作为匹配池
    let remainingPrdLines = [...(displayLines || [])];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const ocrTextRaw = img.ocrText || "";
      
      // 根据换行符拆分成多条文案
      const ocrLines = ocrTextRaw.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);

      // 如果这张图没识别出东西，或者 API 失败
      if (ocrLines.length === 0) {
        if (!compactMode) {
          rows.push({ text: "", images: [img], ocrText: ocrTextRaw });
        }
        continue;
      }

      let matchedAnyLine = false;
      let imageAttached = false;

      // 遍历这张图识别出的每一条 OCR 文案
      for (let j = 0; j < ocrLines.length; j++) {
        const ocrLine = ocrLines[j];
        
        let bestIdx = -1;
        let bestScore = 0;
        
        const isPending = ocrLine.includes("等待OCR") || ocrLine.includes("识别中") || ocrLine.includes("API失败") || ocrLine.includes("API请求异常") || ocrLine.includes("无图片数据");
        
        if (!isPending) {
          // 在文档文案池里找最相似的一句
          for (let k = 0; k < remainingPrdLines.length; k++) {
            const score = getSimilarity(ocrLine, remainingPrdLines[k]);
            // 设置一个稍微合理的相似度阈值，大于 0.3 即算匹配（降低误杀且提高准确度）
            if (score > bestScore && score > 0.3) {
              bestScore = score;
              bestIdx = k;
            }
          }
        }
        
        let matchedText = "";
        if (bestIdx !== -1) {
          matchedText = remainingPrdLines[bestIdx];
          // 匹配上的文案就从池子里删掉，避免一句话被多张图重复匹配
          remainingPrdLines.splice(bestIdx, 1);
        }

        if (compactMode && bestIdx === -1 && !isPending) {
          // 精简模式下，如果该 OCR 句子既没有匹配到文档正文，又不是等待状态，则过滤掉该行
          continue;
        }

        matchedAnyLine = true;
        rows.push({
          // 只有在相似的情况下才填入 PM 写的文案，否则留空让 PM 自己决定
          text: matchedText,
          // 只在当前图片第一次被添加行时塞入截图
          images: !imageAttached ? [img] : [],
          ocrText: ocrLine
        });
        imageAttached = true;
      }

      // 如果精简模式下，该图片所有 OCR 文字都没有匹配到文档内容，至少保留一行显示图片
      if (!matchedAnyLine) {
        rows.push({
          text: "",
          images: [img],
          ocrText: "（无匹配文案）"
        });
      }
    }
    
    return rows;
  }

  function htmlTableFromRows(rows, languages, format = "doc") {
    const cols = ["序号", "Key", "页面截图", "备注", "类型", "CN (PM)", "OCR 参考"];
    const head = `<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;

    // format 为 doc (飞书文档表格) 时开启切割逻辑 (每250行切分以绕过 2000 个单元格上限)
    // format 为 sheet (飞书电子表格/多维表格) 时，不需要切割且只使用单个 table 输出，以防止多个表格换行错位
    const chunkLimit = format === "doc" ? 250 : rows.length;
    let finalHtml = `<meta charset="utf-8">`;
    
    for (let i = 0; i < rows.length; i += chunkLimit) {
      const chunk = rows.slice(i, i + chunkLimit);
      const body = chunk
        .map((r, chunkIdx) => {
          const index = i + chunkIdx + 1;
          const key = "";
          const imgCell =
            r.images && r.images.length
              ? r.images
                  .map((imgObj) => {
                    const finalSrc = imgObj.base64 || imgObj.src || imgObj;
                    const cleanUrl = typeof finalSrc === 'string' ? escapeAttr(finalSrc).replace(/&amp;/g, '&') : finalSrc;
                    return `<img src="${cleanUrl}" />`;
                  })
                  .join("")
              : "";
          const remark = "";
          const type = "";
          const cnText = r.text || "";
          const ocrText = r.ocrText || "等待OCR...";

          const cells = [
            `<td>${index}</td>`,
            `<td>${key}</td>`,
            `<td>${imgCell}</td>`,
            `<td>${remark}</td>`,
            `<td>${type}</td>`,
            `<td>${escapeHtml(cnText)}</td>`,
            `<td>${escapeHtml(ocrText)}</td>`
          ];
          return `<tr>${cells.join("")}</tr>`;
        })
        .join("");
        
      if (format === "doc") {
        finalHtml += `<table style="margin-bottom: 20px;"><thead>${head}</thead><tbody>${body}</tbody></table>`;
      } else {
        finalHtml += `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
      }
    }

    return finalHtml;
  }

  function tsvFromRows(rows, languages) {
    const cols = ["序号", "Key", "页面截图", "备注", "类型", "CN (PM)", "OCR 参考"];
    const lines = [cols.join("\t")];
    rows.forEach((r, idx) => {
      const index = idx + 1;
      const key = "";
      let imgUrl = "";
      if (r.images && r.images.length) {
        const imgObj = r.images[0];
        const finalSrc = imgObj.base64 || imgObj.src || imgObj;
        const cleanUrl = typeof finalSrc === 'string' ? finalSrc.replace(/&amp;/g, '&') : finalSrc;
        // TSV里尽量留原始链接，太长的base64会崩
        imgUrl = imgObj.src || cleanUrl;
      }
      const remark = "";
      const type = "";
      const cnText = r.text || "";
      const ocrText = r.ocrText || "等待OCR...";
      lines.push([index, key, imgUrl, remark, type, cnText, ocrText].map((x) => String(x ?? "")).join("\t"));
    });
    return lines.join("\n");
  }

  return { rowsFromExtract, htmlTableFromRows, tsvFromRows, guessUiLines };
});

