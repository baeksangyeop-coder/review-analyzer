/* ==========================================================
   app.js — 화면 동작: 파일 받기 → 정리 → 기록과 미리보기 → AI 분류
   - 올린 파일은 이 브라우저 안에서 정리하고, AI에는 가린 글만 보냄
   - 글자는 모두 textContent로 넣음 (엑셀 안의 글이 코드로 실행되지 않게)
   ========================================================== */
(() => {
  const $ = (s) => document.querySelector(s);
  const input = $("#file");
  const drop = $("#drop");
  const statusEl = $("#status");
  const results = $("#results");
  const PAGE = 50;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let current = null, shown = 0, fileName = "", controller = null;

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  async function handle(file) {
    if (!file) return;
    if (controller) { setStatus("AI 분류가 진행 중이에요. 멈춘 뒤에 새 파일을 올려 주세요.", true); return; }
    fileName = file.name;
    setStatus(`${file.name} 읽는 중…`);
    try {
      const rows = await RA.readFile(file);
      current = RA.clean(rows);
      setStatus(`${file.name}: 글 ${current.log.kept}건을 정리했어요.`);
      render();
    } catch (err) {
      console.error(err);
      results.hidden = true;
      setStatus(err.message || "파일을 읽지 못했어요. 다른 파일로 다시 해 보세요.", true);
    }
  }

  // ---------- 정리 기록 ----------
  function stepItem(label, count, detail) {
    const li = document.createElement("li");
    const head = document.createElement(detail ? "details" : "div");
    head.className = "step";
    const sum = document.createElement(detail ? "summary" : "div");
    sum.className = "step__head";
    const l = document.createElement("span"); l.className = "step__label"; l.textContent = label;
    const c = document.createElement("span"); c.className = "step__count"; c.textContent = count;
    sum.append(l, c); head.appendChild(sum);
    if (detail) { const p = document.createElement("p"); p.className = "step__detail"; p.textContent = detail; head.appendChild(p); }
    li.appendChild(head);
    return li;
  }

  function render() {
    const L = current.log;
    const kinds = {};
    L.masked.forEach((m) => m.found.forEach((f) => (kinds[f] = (kinds[f] || 0) + 1)));
    const maskDetail = Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ");

    $("#steps").replaceChildren(
      stepItem("읽은 줄", `${L.read}줄`),
      stepItem("열 이름 위의 제목 줄과 빈 줄 건너뜀", `${L.skippedTop}줄`),
      stepItem("빈 줄 뺌", `${L.blank.length}줄`, L.blank.length ? `엑셀 ${L.blank.join(", ")}번째 줄` : ""),
      stepItem("같은 글이 두 번 들어간 줄 뺌", `${L.dup.length}줄`,
        L.dup.map((d) => `${d.line}번째 줄 (${d.first}번째 줄과 같음)`).join("\n")),
      stepItem("날짜 형식 통일", `${L.dateFixed}건`, L.dateFixed ? "2026.10.03 같은 표기를 2026-10-03으로 맞춤" : ""),
      stepItem("별점 정리", `${L.starFixed}건`, L.starFixed ? "'5점', '★★★★★' 같은 표기를 숫자로 맞춤" : ""),
      ...(L.starBad.length ? [stepItem("별점을 읽지 못해 빈칸으로 둠", `${L.starBad.length}건`,
        L.starBad.map((s) => `${s.line}번째 줄: ${s.value}`).join("\n"))] : []),
      stepItem("개인정보를 가린 글", `${L.masked.length}건`, maskDetail),
      stepItem("정리된 글", `${L.kept}건`)
    );

    ["#only-masked", "#show-original", "#only-urgent", "#only-check"].forEach((id) => ($(id).checked = false));
    $("#ai-progress").hidden = true;
    $("#ai-summary").hidden = true;
    results.hidden = false;
    rerender();
    results.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }

  // ---------- 미리보기 표 ----------
  function visibleRows() {
    return current.rows.filter((r) =>
      (!$("#only-masked").checked || r.masked.length) &&
      (!$("#only-urgent").checked || r.ai?.urgency === "즉시 대응") &&
      (!$("#only-check").checked || r.ai?.status === "확인필요"));
  }

  // [전화번호] 같은 표시를 박음질 조각으로 바꿔 넣음
  function maskedText(text) {
    const frag = document.createDocumentFragment();
    text.split(/(\[(?:전화번호|이메일|주문번호|주소|이름)\])/).forEach((part) => {
      if (!part) return;
      if (/^\[.+\]$/.test(part)) {
        const m = document.createElement("mark"); m.className = "masked"; m.textContent = part.slice(1, -1);
        m.setAttribute("aria-label", `가린 ${part.slice(1, -1)}`);
        frag.appendChild(m);
      } else frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }

  // AI가 고른 근거 문구에 밑줄 (원문에 그대로 있을 때만)
  function textWithEvidence(text, evidence) {
    const at = evidence ? text.indexOf(evidence) : -1;
    if (at < 0) return maskedText(text);
    const frag = document.createDocumentFragment();
    frag.appendChild(maskedText(text.slice(0, at)));
    const u = document.createElement("span"); u.className = "evidence"; u.appendChild(maskedText(evidence));
    frag.appendChild(u);
    frag.appendChild(maskedText(text.slice(at + evidence.length)));
    return frag;
  }

  function cell(tr, value, className) {
    const td = document.createElement("td");
    if (value instanceof Node) td.appendChild(value); else td.textContent = value ?? "";
    if (className) td.className = className;
    tr.appendChild(td);
    return td;
  }

  function more() {
    const rows = visibleRows();
    const original = $("#show-original").checked;
    const tbody = $("#tbody");
    rows.slice(shown, shown + PAGE).forEach((r) => {
      const tr = document.createElement("tr");
      const a = r.ai;
      if (a?.urgency === "즉시 대응") tr.className = "is-urgent";
      // AI 결과(긴급도, 유형, 요청, 감정)를 내용 앞에 두어 가로로 넘기지 않아도 보이게 함
      [r.no, r.date, r.kind, r.product].forEach((v) => cell(tr, v));
      cell(tr, r.star ?? "–", "num");
      const has = a && a.type;
      if (has) {
        cell(tr, a.urgency, a.urgency === "즉시 대응" ? "urgent" : "");
        const t = document.createElement("span"); t.textContent = a.type;
        if (a.also?.length) { const s = document.createElement("small"); s.textContent = `함께: ${a.also.join(", ")}`; t.append(document.createElement("br"), s); }
        cell(tr, t);
        cell(tr, a.request); cell(tr, a.sentiment);
      } else { for (let i = 0; i < 4; i++) cell(tr, "–", "empty"); }
      cell(tr, original ? r.original : textWithEvidence(r.text, a?.evidence), "text");
      if (has) cell(tr, a.summary, "summary"); else cell(tr, "–", "empty");

      if (a) {
        const box = document.createElement("span");
        box.className = a.status === "확인필요" ? "flag" : "ok";
        box.textContent = a.status;
        if (a.reasons?.length) { const s = document.createElement("small"); s.textContent = a.reasons.join(" / "); box.append(document.createElement("br"), s); }
        cell(tr, box, "status");
      } else cell(tr, "–", "empty");
      tbody.appendChild(tr);
    });
    shown = Math.min(rows.length, shown + PAGE);
    $("#count").textContent = `${rows.length}건 중 ${shown}건 표시`;
    $("#more").hidden = shown >= rows.length;
  }

  function rerender() { shown = 0; $("#tbody").replaceChildren(); more(); }

  // ---------- AI 분류 ----------
  function summarize(info) {
    const done = current.rows.filter((r) => r.ai);
    if (!done.length) { $("#ai-summary").hidden = true; return; }   // 하나도 못 받았으면 요약을 띄우지 않음
    const count = (fn) => done.filter(fn).length;
    const types = {};
    done.forEach((r) => r.ai.type && (types[r.ai.type] = (types[r.ai.type] || 0) + 1));
    const dl = $("#ai-summary");
    const add = (k, v) => { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd); };
    dl.replaceChildren();
    add("분류한 글", `${done.length}건`);
    add("즉시 대응", `${count((r) => r.ai.urgency === "즉시 대응")}건`);
    add("확인필요", `${count((r) => r.ai.status === "확인필요")}건`);
    add("유형별", Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
    if (info) {
      add("걸린 시간", `${info.seconds}초 (AI 요청 ${info.usage.calls}번)`);
      add("사용량", `보낸 글 ${info.usage.prompt.toLocaleString()} 토큰, 받은 답 ${info.usage.output.toLocaleString()} 토큰 (${info.model})`);
    }
    dl.hidden = false;
  }

  async function runAI(limit) {
    if (!current || controller) return;
    const rows = current.rows.slice(0, limit || current.rows.length);
    controller = new AbortController();
    const bar = $("#ai-bar"), st = $("#ai-status");
    $("#ai-progress").hidden = false;
    $("#ai-test").disabled = $("#ai-all").disabled = true;
    $("#ai-stop").hidden = false;
    st.classList.remove("is-error");
    let info = null;
    try {
      info = await RA.classify(rows, {
        signal: controller.signal,
        onProgress: (done, total, msg) => {
          bar.max = total; bar.value = done;
          st.textContent = msg || `${done} / ${total}건 분류함`;
          if (!msg) rerender();
        },
      });
      st.textContent = `${rows.length}건 분류를 마쳤어요.`;
      st.classList.remove("is-error");
    } catch (err) {
      st.textContent = err.name === "AbortError" ? "멈췄어요. 그때까지 분류한 결과는 남아 있어요." : err.message;
      st.classList.toggle("is-error", err.name !== "AbortError");
    } finally {
      controller = null;
      $("#ai-test").disabled = $("#ai-all").disabled = false;
      $("#ai-stop").hidden = true;
      summarize(info);
      rerender();
    }
  }

  // ---------- 연결 ----------
  input.addEventListener("change", () => handle(input.files[0]));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); handle(e.dataTransfer.files[0]); });

  $("#sample").addEventListener("click", async () => {
    setStatus("샘플 파일 불러오는 중…");
    try {
      const res = await fetch("sample/musooknyeo-reviews.xlsx");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      handle(new File([blob], "무숙녀_리뷰문의_샘플.xlsx"));
    } catch {
      setStatus("샘플 파일을 불러오지 못했어요. Live Server로 열었는지 확인해 주세요.", true);
    }
  });
  $("#more").addEventListener("click", more);
  ["#only-masked", "#show-original", "#only-urgent", "#only-check"].forEach((id) => $(id).addEventListener("change", rerender));
  $("#download").addEventListener("click", () => current && RA.downloadCleaned(current, fileName));
  $("#ai-test").addEventListener("click", () => runAI(20));
  $("#ai-all").addEventListener("click", () => runAI());
  $("#ai-stop").addEventListener("click", () => controller && controller.abort());
})();
