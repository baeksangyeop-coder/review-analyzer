/* ==========================================================
   clean.js — 엑셀에서 읽은 표(줄의 목록)를 정리
   1) 열 이름 줄 찾기 → 2) 열 맞추기 → 3) 빈 줄, 중복 빼기
   4) 날짜와 별점 형식 통일 → 5) 개인정보 가리기
   모든 단계에서 무엇을 뺐고 바꿨는지 기록을 남김 (조용히 버리지 않음)
   ========================================================== */
(function (root) {
  const CONFIG = root.RA ? root.RA.CONFIG : require("./config.js");

  // 열 이름 비교용: 띄어쓰기와 문장 부호를 지우고 소문자로 ('No.' = 'no', '리뷰 내용' = '리뷰내용')
  const norm = (v) => String(v == null ? "" : v).replace(/[\s.·_:()\-]+/g, "").toLowerCase();

  // 1) 열 이름 줄 찾기: 위에서 20줄 안에서, 아는 열 이름이 가장 많이 들어 있는 줄
  function findHeader(rows) {
    let best = { index: -1, hits: 0 };
    rows.slice(0, 20).forEach((row, i) => {
      const cells = row.map(norm);
      const hits = Object.values(CONFIG.columns)
        .filter((names) => names.some((n) => cells.includes(norm(n)))).length;
      if (hits > best.hits) best = { index: i, hits };
    });
    return best.hits >= 2 ? best.index : -1;
  }

  // 2) 열 맞추기: 표준 이름 → 몇 번째 칸인지
  function mapColumns(headerRow) {
    const cells = headerRow.map(norm);
    const map = {};
    for (const [key, names] of Object.entries(CONFIG.columns)) {
      const idx = cells.findIndex((c) => names.some((n) => norm(n) === c));
      if (idx >= 0) map[key] = idx;
    }
    return map;
  }

  // 날짜: 2026.10.03 14:22 / 2026/10/03 → 2026-10-03 14:22
  function fixDate(v) {
    const s = String(v || "").trim();
    const p = (n) => String(n).padStart(2, "0");
    // 엑셀 날짜 칸은 10/3/26 14:22 (월/일/연) 처럼 읽힐 때가 있음
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (us) {
      const y = us[3].length === 2 ? "20" + us[3] : us[3];
      const out = `${y}-${p(us[1])}-${p(us[2])}` + (us[4] ? ` ${p(us[4])}:${us[5]}` : "");
      return { value: out, changed: true };
    }
    const m = s.match(/^(\d{4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) return { value: s, changed: false };
    const out = `${m[1]}-${p(m[2])}-${p(m[3])}` + (m[4] ? ` ${p(m[4])}:${m[5]}` : "");
    return { value: out, changed: out !== s };
  }

  // 별점: "5점", "★★★★☆", "4.0" → 숫자. 읽을 수 없으면 빈칸
  function fixStar(v) {
    const s = String(v == null ? "" : v).trim();
    if (s === "") return { value: null, changed: false };
    if (/^[★☆]+$/.test(s)) return { value: (s.match(/★/g) || []).length, changed: true };
    const m = s.match(/^(\d(?:\.\d)?)\s*점?$/);
    if (m) { const n = Math.round(Number(m[1])); return { value: n, changed: String(n) !== s }; }
    return { value: null, changed: true, bad: true };
  }

  // 5) 개인정보 가리기: 가린 자리에 [전화번호] 같은 표시를 남김
  function mask(text) {
    let out = String(text || "");
    const found = [];
    for (const rule of CONFIG.masks) {
      out = out.replace(rule.pattern, (...args) => {
        const whole = args[0];
        if (rule.nameBeforePhone) {
          if (CONFIG.notNames.some((w) => whole.endsWith(w) || whole === w) || CONFIG.notNameEndings.test(whole)) return whole;
          found.push(rule.label); return `[${rule.label}]`;
        }
        if (rule.keep) { found.push(rule.label); return args[1] + `[${rule.label}]`; }
        found.push(rule.label); return `[${rule.label}]`;
      });
    }
    return { text: out, found };
  }

  // 열 이름 줄을 못 찾았을 때 '직접 고르기' 화면이 처음 보여 줄 줄: 칸이 가장 많이 채워진 줄
  function guessHeader(rows) {
    let best = { index: 0, filled: 0 };
    rows.slice(0, 20).forEach((row, i) => {
      const filled = row.filter((c) => String(c == null ? "" : c).trim() !== "").length;
      if (filled > best.filled) best = { index: i, filled };
    });
    return best.index;
  }

  // 자동으로 알아보지 못하면 이 오류를 던짐 → 화면이 열 고르기를 보여 줌
  function needMapping(message, rows, headerIndex, map) {
    const e = new Error(message);
    e.code = "NEED_MAPPING";
    e.headerIndex = headerIndex;
    e.map = map || {};
    return e;
  }

  // manual: { headerIndex, map } 을 주면 자동 찾기 대신 사람이 고른 열로 정리
  function clean(rows, manual) {
    const log = { read: rows.length, skippedTop: 0, blank: [], dup: [], dateFixed: 0, starFixed: 0, starBad: [], masked: [] };

    let h, map;
    if (manual) {
      h = manual.headerIndex;
      map = manual.map;
      if (map.text === undefined) throw needMapping("글 내용이 들어 있는 열을 골라 주세요.", rows, h, map);
    } else {
      h = findHeader(rows);
      if (h < 0) throw needMapping("열 이름 줄을 자동으로 찾지 못했어요. 열 이름이 있는 줄과 글 내용 열을 직접 골라 주세요.", rows, guessHeader(rows), {});
      map = mapColumns(rows[h]);
      if (map.text === undefined) throw needMapping("글 내용이 들어 있는 열을 자동으로 찾지 못했어요. 직접 골라 주세요.", rows, h, map);
    }
    log.skippedTop = h;   // 열 이름 줄 위에 있던 제목 줄, 빈 줄
    log.columns = map;
    log.headerIndex = h;
    log.headerRow = rows[h].map((c) => String(c == null ? "" : c).trim());
    log.manual = Boolean(manual);

    const seen = new Map();
    const out = [];
    rows.slice(h + 1).forEach((row, i) => {
      const line = h + 2 + i;   // 엑셀에서 보이는 줄 번호
      const get = (k) => (map[k] === undefined ? "" : row[map[k]]);
      const text = String(get("text") || "").trim();

      if (row.every((c) => String(c == null ? "" : c).trim() === "")) { log.blank.push(line); return; }
      if (!text) { log.blank.push(line); return; }

      // 중복: 번호가 있으면 번호+내용, 없으면 작성일시+작성자+내용이 같을 때
      const key = map.no !== undefined ? `${get("no")}|${text}` : `${get("date")}|${get("author")}|${text}`;
      if (seen.has(key)) { log.dup.push({ line, first: seen.get(key), text }); return; }
      seen.set(key, line);

      const d = fixDate(get("date")); if (d.changed) log.dateFixed++;
      const s = fixStar(get("star")); if (s.changed && !s.bad) log.starFixed++;
      if (s.bad) log.starBad.push({ line, value: get("star") });
      const m = mask(text);
      if (m.found.length) log.masked.push({ line, found: m.found });

      out.push({
        line,
        no: String(get("no") || ""),
        date: d.value,
        kind: String(get("kind") || ""),
        product: String(get("product") || ""),
        option: String(get("option") || ""),
        star: s.value,
        original: text,         // 원문은 이 컴퓨터 안에서만 씀 (화면 확인용)
        text: m.text,           // AI에는 가린 글만 보냄 (3단계)
        masked: m.found
      });
    });

    log.kept = out.length;
    return { rows: out, log };
  }

  // 화면에 보여 줄 표준 열 이름 (필수는 글 내용 하나)
  const FIELDS = [["text", "글 내용 (꼭 필요)"], ["date", "작성일시"], ["product", "상품명"], ["star", "별점"],
                  ["kind", "구분 (리뷰, 문의)"], ["option", "옵션"], ["no", "번호"], ["author", "작성자"]];

  const api = { clean, findHeader, guessHeader, mapColumns, fixDate, fixStar, mask, FIELDS };
  root.RA = root.RA || {};
  Object.assign(root.RA, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
