/* ==========================================================
   read.js — 엑셀(xlsx, xls)과 CSV를 줄의 목록으로 읽기 (SheetJS 사용)
   - 모든 칸을 화면에 보이는 글자 그대로 읽음 (날짜, 번호가 숫자로 바뀌지 않게)
   - CSV는 한글이 깨지지 않게 UTF-8로 먼저 읽고, 깨지면 EUC-KR로 다시 읽음
   ========================================================== */
(function (root) {
  async function readFile(file) {
    const name = file.name.toLowerCase();
    const buf = await file.arrayBuffer();
    let wb;
    if (name.endsWith(".csv")) {
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("\uFFFD")) text = new TextDecoder("euc-kr").decode(buf);
      wb = XLSX.read(text, { type: "string" });
    } else if (/\.(xlsx|xls)$/.test(name)) {
      wb = XLSX.read(buf, { type: "array" });
    } else {
      throw new Error("엑셀(.xlsx, .xls)이나 CSV 파일만 올릴 수 있어요.");
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true });
  }

  // 정리된 결과를 엑셀로 내려받기: 정리된 글 + 정리 기록
  function downloadCleaned(result, sourceName) {
    const L = result.log;
    // AI 분류를 했으면 그 결과 칸도 함께 (정답표와 비교할 때 이 파일을 씀)
    const rows = [["번호", "작성일시", "구분", "상품명", "옵션", "별점", "내용 (개인정보 가림)", "가린 항목",
                   "주 유형", "함께 언급된 유형", "요청 사항", "감정", "긴급도", "요약", "근거 문구", "확인", "확인 사유"]];
    result.rows.forEach((r) => {
      const a = r.ai || {};
      rows.push([r.no, r.date, r.kind, r.product, r.option, r.star ?? "", r.text, r.masked.join(", "),
                 a.type || "", (a.also || []).join(", "), a.request || "", a.sentiment || "", a.urgency || "",
                 a.summary || "", a.evidence || "", a.status || "", (a.reasons || []).join(" / ")]);
    });
    const log = [
      ["항목", "건수", "자세히"],
      ["읽은 줄", L.read, ""],
      ["제목 줄 등 열 이름 위의 줄", L.skippedTop, ""],
      ["빈 줄", L.blank.length, L.blank.join(", ") + "번째 줄"],
      ["중복", L.dup.length, L.dup.map((d) => `${d.line}번째 줄 (${d.first}번째 줄과 같음)`).join(", ")],
      ["날짜 형식 통일", L.dateFixed, ""],
      ["별점 정리", L.starFixed, ""],
      ["별점을 읽지 못함", L.starBad.length, L.starBad.map((s) => `${s.line}번째 줄: ${s.value}`).join(", ")],
      ["개인정보를 가린 글", L.masked.length, ""],
      ["정리된 글", L.kept, ""]
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "정리된 글");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(log), "정리 기록");
    const base = sourceName.replace(/\.(xlsx|xls|csv)$/i, "");
    XLSX.writeFile(wb, `${base}_정리.xlsx`);
  }

  root.RA = root.RA || {};
  Object.assign(root.RA, { readFile, downloadCleaned });
})(window);
