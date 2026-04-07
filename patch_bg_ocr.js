let isOcrRunning = false;
let isOcrCancelled = false;

async function runBackgroundOCR(extract) {
  if (isOcrRunning || !extract || !extract.images || extract.images.length === 0) return;
  isOcrRunning = true;
  isOcrCancelled = false;
  
  els.cancelOcrBtn.style.display = "inline-block";
  els.cancelOcrBtn.disabled = false;
  
  const apiUrl = "https://copypaste-tau.vercel.app/api/ocr";
  
  try {
    let hasPending = false;
    for (let i = 0; i < extract.images.length; i++) {
      if (!extract.images[i].ocrText || extract.images[i].ocrText === "等待OCR...") {
        hasPending = true; break;
      }
    }
    if (!hasPending) {
      isOcrRunning = false;
      els.cancelOcrBtn.style.display = "none";
      return;
    }

    for (let i = 0; i < extract.images.length; i++) {
      if (isOcrCancelled) break;
      const img = extract.images[i];
      
      if (!img.ocrText || img.ocrText === "等待OCR...") {
         setStatus(`后台识别图片 ${i + 1} / ${extract.images.length} ... (随时可点第二步复制)`, "normal");
         
         if (!img.base64 && typeof img !== 'string' && img.src) {
            try {
              const fetchRes = await chrome.runtime.sendMessage({ type: "CP_FETCH_IMAGE", url: img.src });
              if (fetchRes && fetchRes.ok && fetchRes.dataUrl) img.base64 = fetchRes.dataUrl;
            } catch(e) {}
         }
         
         if (!img.base64) {
            img.ocrText = "无图片数据";
         } else {
            try {
              const compressedBase64 = await compressImageForOCR(img.base64, 1500);
              const res = await chrome.runtime.sendMessage({
                type: "CP_OCR_LLM",
                payload: { base64Image: compressedBase64, apiUrl, apiModel: "", apiKey: "" }
              });
              if (isOcrCancelled) break;
              
              if (res && res.ok && res.text) img.ocrText = res.text;
              else img.ocrText = `API失败`;
            } catch(e) {
              if (isOcrCancelled) break;
              img.ocrText = "请求异常";
            }
         }
         
         if (!isOcrCancelled) {
           // Re-render UI to show progress
           applyExtractToUI(extract, els.modeSelect.value);
           await chrome.storage.session.set({ lastExtract: extract });
         }
      }
    }
    if (!isOcrCancelled) setStatus("所有图片 OCR 识别完成！", "ok");
    else setStatus("已中止后台 OCR 识别。", "error");
  } catch (e) {
    setStatus(String(e && e.message ? e.message : e), "error");
  } finally {
    isOcrRunning = false;
    els.cancelOcrBtn.style.display = "none";
  }
}
