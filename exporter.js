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
      if (s.length > 50) return false; // 太长的一般不是UI文案
      if (/^https?:\/\//i.test(s)) return false; // 网址
      if (/^[0-9]+[\.、]\s/.test(s)) return false; // 列表 1. xxx
      if (/^[-*•]\s/.test(s)) return false; // 列表 - xxx
      if (/[。；！]$/.test(s)) return false; // 句号结尾的一般是描述段落
      if (/^(?:模块|方案|背景|目标|范围|说明|备注|结论|实现|设计|流程|交互|逻辑|规则|前提|限制|版本|记录|字段|状态|付费管理)\b/.test(s)) return false;
      if (/^[-—]+$/.test(s)) return false; // 分割线
      return true;
    });
  }

  function getSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    if (s1.includes(s2)) return s2.length / s1.length;
    if (s2.includes(s1)) return s1.length / s2.length;
    
    // 简单的字符交集比例，应对稍微有点错字或缺字的情况
    const set1 = new Set(s1.split(''));
    const set2 = new Set(s2.split(''));
    let intersection = 0;
    for (const char of set1) {
      if (set2.has(char)) intersection++;
    }
    return intersection / Math.max(set1.size, set2.size);
  }

  function rowsFromExtract(extract, mode, displayLines) {
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
    // 如果没有图片，把文档里的文案全部列出来（用特征过滤一下，免得太多废话）
    if (!images || images.length === 0) {
      return (displayLines || []).map(text => ({ text, images: [], ocrText: "" }));
    }

    // 复制一份 PRD 里提取到的所有文案，作为匹配池
    let remainingPrdLines = [...(displayLines || [])];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const ocrTextRaw = img.ocrText || "";
      
      // 根据换行符拆分成多条文案
      const ocrLines = ocrTextRaw.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);

      // 如果这张图没识别出东西，或者 API 失败，就当成一条空行放进去
      if (ocrLines.length === 0) {
        rows.push({ text: "", images: [img], ocrText: ocrTextRaw });
        continue;
      }

      // 遍历这张图识别出的每一条 OCR 文案
      for (let j = 0; j < ocrLines.length; j++) {
        const ocrLine = ocrLines[j];
        
        let bestIdx = -1;
        let bestScore = 0;
        
        // 在文档文案池里找最相似的一句
        for (let k = 0; k < remainingPrdLines.length; k++) {
          const score = getSimilarity(ocrLine, remainingPrdLines[k]);
          // 设置一个相似度阈值，大于 0.3 才算及格（比如有一部分字对得上）
          if (score > bestScore && score > 0.3) {
            bestScore = score;
            bestIdx = k;
          }
        }
        
        let matchedText = "";
        if (bestIdx !== -1) {
          matchedText = remainingPrdLines[bestIdx];
          // 匹配上的文案就从池子里删掉，避免一句话被多张图重复匹配
          remainingPrdLines.splice(bestIdx, 1);
        }

        rows.push({
          // 只有在相似的情况下才填入 PM 写的文案，否则留空让 PM 自己决定
          text: matchedText,
          // 只在当前图片的第一条文案里塞入截图，后续的同属一张图的留空
          images: j === 0 ? [img] : [],
          ocrText: ocrLine
        });
      }
    }
    
    return rows;
  }

  function htmlTableFromRows(rows, languages) {
    const cols = ["序号", "Key", "页面截图", "备注", "类型", "CN (PM)", "OCR 参考"];
    const head = `<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;

    const body = rows
      .map((r, idx) => {
        const index = idx + 1;
        const key = "";
        const imgCell =
          r.images && r.images.length
            ? r.images
                .map((imgObj) => {
                  // 如果存在 base64，优先使用 base64，因为原图可能带有鉴权参数导致飞书重新抓取失败。
                  // 如果飞书丢弃了 base64 图片，可以先将其回退为安全的外部链接或原始链接。
                  const finalSrc = imgObj.base64 || imgObj.src || imgObj;
                  const cleanUrl = typeof finalSrc === 'string' ? escapeAttr(finalSrc).replace(/&amp;/g, '&') : finalSrc;
                  // 飞书多维表格（Bitable）和普通表格对于简单 img 标签的兼容性最好
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

    // 退回最简单干净的表格结构，这是各种表格系统（普通表格/多维表格/Excel）兼容性最好的格式
    return `<meta charset="utf-8"><table><thead>${head}</thead><tbody>${body}</tbody></table>`;
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

