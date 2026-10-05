/* ==========================================================
   report.js — 고객센터 팀장이 받아 볼 보고서 엑셀 만들기 (4단계)
   - 숫자 집계와 요약 문장은 AI가 아니라 규칙으로 만듦 (숫자가 틀릴 일이 없게)
   - 내용은 개인정보를 가린 글만 넣음. 원문이 필요하면 번호로 쇼핑몰 관리자 화면에서 찾음
   - 엑셀 꾸미기(색, 틀 고정, 필터)는 ExcelJS 사용
   ========================================================== */
(function (root) {
  const URGENT = "즉시 대응";
  const TYPES = ["사이즈·핏", "품질·불량", "상품 정보 차이", "배송", "교환·반품 처리 현황", "세탁·관리 문의", "가격·혜택", "칭찬", "기타"];
  const REQUESTS = ["교환", "반품·환불", "답변 요청", "없음"];
  const COMPLAINTS = ["사이즈·핏", "품질·불량", "상품 정보 차이", "배송"];   // 상품 때문에 생기는 불만

  const countBy = (list, fn) => list.reduce((m, x) => { const k = fn(x); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const bar = (n, max) => (max ? "█".repeat(Math.max(1, Math.round((n / max) * 20))) : "");

  // ---------- 집계 (화면과 상관없는 순수 계산이라 따로 시험 가능) ----------
  function buildReport(result) {
    const rows = result.rows.filter((r) => r.ai && r.ai.type);
    const dates = rows.map((r) => r.date.slice(0, 10)).filter(Boolean).sort();
    const urgent = rows.filter((r) => r.ai.urgency === URGENT).sort((a, b) => b.date.localeCompare(a.date));
    const check = result.rows.filter((r) => r.ai && r.ai.status === "확인필요");
    const negative = rows.filter((r) => r.ai.sentiment === "부정").length;
    const byType = countBy(rows, (r) => r.ai.type);
    const byRequest = countBy(rows, (r) => r.ai.request);
    const byKind = countBy(rows, (r) => r.kind);

    // 상품별: 상품 때문에 생기는 불만이 많은 순
    const products = {};
    rows.forEach((r) => {
      const p = (products[r.product] ||= { name: r.product, total: 0, negative: 0, urgent: 0, types: {} });
      p.total++;
      if (r.ai.sentiment === "부정") p.negative++;
      if (r.ai.urgency === URGENT) p.urgent++;
      p.types[r.ai.type] = (p.types[r.ai.type] || 0) + 1;
    });
    const productList = Object.values(products).map((p) => {
      const complaints = COMPLAINTS.reduce((s, t) => s + (p.types[t] || 0), 0);
      const top = COMPLAINTS.map((t) => [t, p.types[t] || 0]).sort((a, b) => b[1] - a[1])[0];
      return { ...p, complaints, top: top[1] ? `${top[0]} ${top[1]}건` : "없음" };
    }).sort((a, b) => b.complaints - a.complaints || b.total - a.total);

    // 요약 문장: 집계된 숫자만으로 만듦
    const topType = Object.entries(byType).filter(([t]) => t !== "칭찬").sort((a, b) => b[1] - a[1])[0];
    const worst = productList[0];
    const sentences = [
      `${dates[0] || ""} ~ ${dates[dates.length - 1] || ""} 리뷰·문의 ${rows.length}건 중 즉시 대응이 필요한 글은 ${urgent.length}건이에요.`,
      topType ? `칭찬을 빼면 가장 많은 유형은 ${topType[0]}(${topType[1]}건)이고, 부정적인 글은 전체의 ${pct(negative, rows.length)}%예요.` : "",
      worst && worst.complaints ? `불만이 가장 많은 상품은 ${worst.name}(불만 ${worst.complaints}건, 그중 ${worst.top})이에요.` : "",
      check.length ? `AI 판단을 사람이 확인해야 하는 글이 ${check.length}건 있어요. '확인필요' 시트를 봐 주세요.` : "AI 판단을 따로 확인해야 하는 글은 없어요.",
    ].filter(Boolean);

    return { rows, dates, urgent, check, negative, byType, byRequest, byKind, productList, sentences };
  }

  // ---------- 엑셀 그리기 ----------
  const C = { ink: "FF1C2330", chalk: "FF2C5AA0", tint: "FFE3EBF7", head: "FFEDEFF2", red: "FFB42335", redTint: "FFFBE9EB", line: "FFD5DBE3" };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  function styleHeader(row) {
    row.font = { bold: true, color: { argb: C.ink } };
    row.eachCell((c) => { c.fill = fill(C.head); c.border = { bottom: { style: "thin", color: { argb: C.line } } }; });
  }

  function table(ws, columns, data, { freeze = true, filter = true, wrap = [] } = {}) {
    ws.columns = columns.map(([header, key, width]) => ({ header, key, width }));
    styleHeader(ws.getRow(1));
    data.forEach((d) => ws.addRow(d));
    if (freeze) ws.views = [{ state: "frozen", ySplit: 1 }];
    if (filter && data.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    wrap.forEach((key) => { ws.getColumn(key).alignment = { wrapText: true, vertical: "top" }; });
    ws.eachRow((row, i) => { if (i > 1) row.alignment = { ...(row.alignment || {}), vertical: "top" }; });
  }

  const resultRow = (r) => ({
    no: r.no, date: r.date, kind: r.kind, product: r.product, option: r.option, star: r.star ?? "",
    urgency: r.ai?.urgency || "", type: r.ai?.type || "", also: (r.ai?.also || []).join(", "),
    request: r.ai?.request || "", sentiment: r.ai?.sentiment || "", summary: r.ai?.summary || "",
    evidence: r.ai?.evidence || "", text: r.text, status: r.ai?.status || "", reasons: (r.ai?.reasons || []).join(" / "),
  });

  async function downloadReport(result, sourceName) {
    const R = buildReport(result);
    if (!R.rows.length) throw new Error("AI 분류 결과가 없어요. 먼저 AI 분류를 해 주세요.");
    const wb = new ExcelJS.Workbook();
    wb.creator = "무숙녀 고객센터 리뷰·문의 정리";

    // 1) 요약
    const s = wb.addWorksheet("요약", { views: [{ showGridLines: false }] });
    s.getColumn(1).width = 22; s.getColumn(2).width = 12; s.getColumn(3).width = 34;
    s.addRow(["무숙녀 리뷰·문의 보고서"]).font = { bold: true, size: 16, color: { argb: C.ink } };
    s.addRow([`기간 ${R.dates[0]} ~ ${R.dates[R.dates.length - 1]}  /  만든 날 ${new Date().toISOString().slice(0, 10)}`]).font = { color: { argb: "FF566170" } };
    s.addRow([]);
    R.sentences.forEach((t) => { const row = s.addRow([t]); s.mergeCells(row.number, 1, row.number, 6); row.alignment = { wrapText: true }; row.height = 30; });
    s.addRow([]);
    const kpi = [["전체", R.rows.length], ["리뷰", R.byKind["리뷰"] || 0], ["문의", R.byKind["문의"] || 0],
                 ["즉시 대응", R.urgent.length], ["확인필요", R.check.length], ["부정 비율", `${pct(R.negative, R.rows.length)}%`]];
    kpi.forEach(([k, v]) => {
      const row = s.addRow([k, v]);
      row.getCell(1).font = { color: { argb: "FF566170" } };
      row.getCell(2).font = { bold: true, color: { argb: k === "즉시 대응" ? C.red : C.ink } };
    });
    s.addRow([]);
    const h1 = s.addRow(["유형", "건수", ""]); styleHeader(h1);
    const maxT = Math.max(...Object.values(R.byType));
    TYPES.forEach((t) => { const n = R.byType[t] || 0; const row = s.addRow([t, n, bar(n, maxT)]); row.getCell(3).font = { color: { argb: C.chalk } }; });
    s.addRow([]);
    const h2 = s.addRow(["요청 사항", "건수", ""]); styleHeader(h2);
    const maxR = Math.max(...Object.values(R.byRequest));
    REQUESTS.forEach((t) => { const n = R.byRequest[t] || 0; const row = s.addRow([t, n, bar(n, maxR)]); row.getCell(3).font = { color: { argb: C.chalk } }; });

    // 2) 즉시 대응: 오늘 먼저 볼 글
    const u = wb.addWorksheet("즉시 대응");
    table(u, [["번호", "no", 9], ["작성일시", "date", 17], ["구분", "kind", 7], ["상품명", "product", 24], ["옵션", "option", 14],
              ["주 유형", "type", 14], ["요청", "request", 11], ["요약", "summary", 30], ["근거 문구", "evidence", 34], ["내용 (개인정보 가림)", "text", 60]],
          R.urgent.map(resultRow), { wrap: ["summary", "evidence", "text"] });
    u.eachRow((row, i) => { if (i > 1) row.getCell(1).fill = fill(C.redTint); });

    // 3) 상품별
    const p = wb.addWorksheet("상품별");
    table(p, [["상품명", "name", 26], ["전체", "total", 7], ["불만", "complaints", 7], ["가장 많은 불만", "top", 20], ["즉시 대응", "urgent", 9], ["부정", "negative", 7],
              ...COMPLAINTS.map((t) => [t, t, 12]), ["칭찬", "칭찬", 8]],
          R.productList.map((x) => ({ ...x, ...Object.fromEntries([...COMPLAINTS, "칭찬"].map((t) => [t, x.types[t] || 0])) })));
    p.eachRow((row, i) => { if (i > 1 && row.getCell(5).value > 0) row.getCell(5).font = { bold: true, color: { argb: C.red } }; });

    // 4) 전체 결과
    const all = wb.addWorksheet("전체 결과");
    const allCols = [["번호", "no", 9], ["작성일시", "date", 17], ["구분", "kind", 7], ["상품명", "product", 24], ["옵션", "option", 14], ["별점", "star", 6],
                     ["긴급도", "urgency", 10], ["주 유형", "type", 14], ["함께 언급된 유형", "also", 16], ["요청", "request", 11], ["감정", "sentiment", 7],
                     ["요약", "summary", 30], ["근거 문구", "evidence", 34], ["내용 (개인정보 가림)", "text", 60], ["확인", "status", 9]];
    table(all, allCols, result.rows.map(resultRow), { wrap: ["summary", "evidence", "text"] });
    all.eachRow((row, i) => { if (i > 1 && row.getCell(7).value === URGENT) row.getCell(7).font = { bold: true, color: { argb: C.red } }; });

    // 5) 확인필요
    const c = wb.addWorksheet("확인필요");
    table(c, [["번호", "no", 9], ["상품명", "product", 24], ["AI가 고른 유형", "type", 14], ["긴급도", "urgency", 10], ["확인 사유", "reasons", 40], ["내용 (개인정보 가림)", "text", 60]],
          R.check.map(resultRow), { wrap: ["reasons", "text"] });

    // 6) 정리 기록
    const L = result.log;
    const g = wb.addWorksheet("정리 기록");
    table(g, [["항목", "k", 32], ["건수", "v", 10]], [
      { k: "읽은 줄", v: L.read }, { k: "열 이름 위의 제목 줄과 빈 줄", v: L.skippedTop }, { k: "빈 줄", v: L.blank.length },
      { k: "중복", v: L.dup.length }, { k: "날짜 형식 통일", v: L.dateFixed }, { k: "별점 정리", v: L.starFixed },
      { k: "개인정보를 가린 글", v: L.masked.length }, { k: "정리된 글", v: L.kept }, { k: "AI가 분류한 글", v: R.rows.length },
    ], { filter: false });

    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `무숙녀_리뷰문의_보고서_${R.dates[0]}_${R.dates[R.dates.length - 1]}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return R;
  }

  const api = { buildReport, downloadReport };
  root.RA = root.RA || {};
  Object.assign(root.RA, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
