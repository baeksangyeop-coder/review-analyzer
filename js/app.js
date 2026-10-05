/* ==========================================================
   app.js — 화면 동작: 파일 받기 → 정리 → 기록과 미리보기 보여 주기
   - 올린 파일은 이 브라우저 안에서만 처리하고 어디에도 보내지 않음
   - 글자는 모두 textContent로 넣음 (엑셀 안의 글이 코드로 실행되지 않게)
   ========================================================== */
(() => {
  const $ = (s) => document.querySelector(s);
  const input = $("#file");
  const drop = $("#drop");
  const statusEl = $("#status");
  const results = $("#results");
  const PAGE = 50;
  let current = null, shown = 0, fileName = "";

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  async function handle(file) {
    if (!file) return;
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

    const list = $("#steps");
    list.replaceChildren(
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

    $("#only-masked").checked = false;
    $("#show-original").checked = false;
    results.hidden = false;
    shown = 0;
    $("#tbody").replaceChildren();
    more();
    results.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  // ---------- 미리보기 표 ----------
  function visibleRows() {
    return $("#only-masked").checked ? current.rows.filter((r) => r.masked.length) : current.rows;
  }

  // [전화번호] 같은 표시를 눈에 띄는 조각으로 바꿔 넣음
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

  function more() {
    const rows = visibleRows();
    const original = $("#show-original").checked;
    const tbody = $("#tbody");
    rows.slice(shown, shown + PAGE).forEach((r) => {
      const tr = document.createElement("tr");
      const cells = [r.no, r.date, r.kind, r.product, r.option, r.star ?? "–"];
      cells.forEach((v, i) => { const td = document.createElement("td"); td.textContent = v; if (i === 5) td.className = "num"; tr.appendChild(td); });
      const td = document.createElement("td"); td.className = "text";
      if (original) td.textContent = r.original; else td.appendChild(maskedText(r.text));
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    shown = Math.min(rows.length, shown + PAGE);
    $("#count").textContent = `${rows.length}건 중 ${shown}건 표시`;
    $("#more").hidden = shown >= rows.length;
  }

  function rerender() { shown = 0; $("#tbody").replaceChildren(); more(); }

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
  $("#only-masked").addEventListener("change", rerender);
  $("#show-original").addEventListener("change", rerender);
  $("#download").addEventListener("click", () => current && RA.downloadCleaned(current, fileName));
})();
