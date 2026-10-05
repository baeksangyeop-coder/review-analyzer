/* ==========================================================
   config.js — 바꿀 일이 생기면 이 파일만 고치면 되는 설정
   - 열 이름표: 쇼핑몰마다 다른 열 이름을 같은 이름으로 맞춤
   - 개인정보 규칙: AI에 보내기 전에 가릴 것
   ========================================================== */
(function (root) {
  const CONFIG = {
    // 표준 이름: [엑셀에서 쓰일 수 있는 이름들]
    columns: {
      no:      ["번호", "글번호", "No", "id"],
      date:    ["작성일시", "작성일", "작성시간", "등록일", "날짜", "일시", "date"],
      kind:    ["구분", "유형", "글 종류", "type"],
      product: ["상품명", "상품", "제품명", "제품", "product"],
      option:  ["옵션", "옵션정보", "선택옵션", "option"],
      star:    ["별점", "평점", "만족도", "rating"],
      text:    ["내용", "리뷰 내용", "문의 내용", "본문", "리뷰", "문의", "후기", "상품평", "구매평", "의견", "review", "comment", "content"],
      author:  ["작성자", "아이디", "닉네임", "고객", "고객명", "author"]
    },
    // 내용 열은 꼭 있어야 함. 나머지는 없으면 빈칸으로 둠
    required: ["text"],

    // 개인정보 규칙: 위에서부터 차례로 적용 (이름은 전화번호를 가린 뒤에 찾음)
    // 키와 몸무게는 사이즈 판단에 필요하고 그것만으로 누구인지 알 수 없어서 남김
    masks: [
      { label: "이메일",   pattern: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g },
      { label: "전화번호", pattern: /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g },
      { label: "주문번호", pattern: /(?<!\d)20\d{11,14}(?!\d)/g },
      { label: "주소",     pattern: /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣]*\s+[가-힣]+(시|군|구)(\s+[가-힣]+(구|읍|면|동))?\s+[가-힣0-9]+(로|길)(\s*\d+(-\d+)?)?(,\s*\d+호)?/g },
      { label: "이름",     pattern: /((?:받는\s?사람|수령인|이름|성함)\s*[:：]?\s*)([가-힣]{2,4})/g, keep: 1 },
      { label: "이름",     pattern: /(?<![가-힣])([가-힣]{2,4})(?=\s*\[전화번호\])/g, nameBeforePhone: true }
    ],
    // 이름처럼 보여도 이름이 아닌 말 (전화번호 앞에 자주 오는 단어)
    // 말끝(요, 다, 까 등)으로 끝나는 단어도 이름이 아님
    // AI 분류 서버 함수 (3단계). 주소와 공개용 키는 화면에 드러나도 되는 값
    // Gemini API 키는 여기에 절대 넣지 않음. Supabase 서버 함수의 비밀 설정에만 있음
    ai: {
      endpoint: "https://yzojuvnidtmrodutizqw.supabase.co/functions/v1/classify-reviews",
      publishableKey: "sb_publishable_b3u0Hg0mGWssa1GG28g-0w_m88WKn9Z",
      batchSize: 20,     // 서버도 20건까지만 받음
      gapMs: 6000,       // 묶음 사이 쉬는 시간 (무료 한도: 분당 요청 수 제한)
      parallel: 2,       // 동시에 보내는 묶음 수
      maxRetry: 3        // 한도에 걸리면 기다렸다가 다시 보내는 횟수
    },
    notNameEndings: /(요|다|까|죠|네|게|서|고)$/,
    notNames: ["연락처", "전화", "번호", "휴대폰", "핸드폰", "연락", "주세요", "드려요", "입니다", "에요", "이에요", "부탁드려요"]
  };
  root.RA = root.RA || {};
  root.RA.CONFIG = CONFIG;
  if (typeof module !== "undefined") module.exports = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
