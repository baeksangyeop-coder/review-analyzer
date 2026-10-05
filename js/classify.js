/* ==========================================================
   classify.js — 정리된 글을 20건씩 서버 함수로 보내 AI 분류 받기
   - 가린 글(text)만 보냄. 원문(original)과 작성자는 보내지 않음
   - 묶음 사이를 쉬어서 무료 한도를 넘지 않게 하고, 한도에 걸리면 기다렸다가 다시 보냄
   - 중간에 멈추면 거기까지 받은 결과는 그대로 남음
   ========================================================== */
(function (root) {
  const wait = (ms, signal) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("멈춤", "AbortError")); }, { once: true });
  });

  async function sendBatch(batch, signal) {
    const { endpoint, publishableKey, maxRetry } = root.RA.CONFIG.ai;
    const items = batch.map((r) => ({ id: String(r.line), kind: r.kind, star: r.star, text: r.text }));
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: publishableKey },
        body: JSON.stringify({ items }),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      // 한도에 걸렸거나(429) Gemini가 붐빌 때(503)는 기다렸다가 다시 보냄
      // 하루 한도를 다 쓴 경우는 기다려도 소용없으니 바로 알림
      if (data.code === "DAILY_LIMIT") { const e = new Error(data.message); e.daily = true; throw e; }
      if ((res.status === 429 || res.status === 503) && attempt < maxRetry) {
        await wait((data.retryAfter || 30) * 1000, signal);
        continue;
      }
      if (!res.ok) throw new Error(data.message || `서버 오류 (${res.status})`);
      return data;
    }
  }

  // rows: 정리된 글 목록. onProgress(끝낸 건수, 전체 건수, 안내 문구)
  // 묶음 두 개를 동시에 보내서 시간을 줄임 (무료 한도를 넘지 않게 각 줄마다 쉬는 시간은 그대로)
  async function classify(rows, { onProgress, signal } = {}) {
    const { batchSize, gapMs, parallel = 2 } = root.RA.CONFIG.ai;
    const usage = { prompt: 0, output: 0, calls: 0 };
    const models = new Set();
    const started = Date.now();
    const batches = [];
    for (let i = 0; i < rows.length; i += batchSize) batches.push(rows.slice(i, i + batchSize));
    let next = 0, done = 0;

    async function worker() {
      while (next < batches.length) {
        const batch = batches[next++];
        onProgress && onProgress(done, rows.length, `${done} / ${rows.length}건 분류함 (묶음 ${next}/${batches.length} 보내는 중…)`);
        const data = await sendBatch(batch, signal);
        models.add(data.model);
        usage.prompt += data.usage?.prompt || 0;
        usage.output += data.usage?.output || 0;
        usage.calls += data.usage?.calls || 0;
        const byId = new Map((data.results || []).map((x) => [x.id, x]));
        batch.forEach((r) => { r.ai = byId.get(String(r.line)) || { status: "확인필요", reasons: ["결과를 받지 못함"] }; });
        done += batch.length;
        onProgress && onProgress(done, rows.length, "");
        if (next < batches.length) await wait(gapMs, signal);
      }
    }
    // 하나가 실패하면 나머지도 멈추게 Promise.all 사용
    await Promise.all(Array.from({ length: Math.min(parallel, batches.length) }, worker));
    return { model: [...models].join(", "), usage, seconds: Math.round((Date.now() - started) / 1000) };
  }

  root.RA = root.RA || {};
  root.RA.classify = classify;
})(window);
