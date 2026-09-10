// 건강보험 피부양자 자격 판정기.
//
// 계산기가 아니라 판정기다. 사람들이 궁금한 것은 "보험료가 얼마"가 아니라
// "내가 자격을 잃느냐"이기 때문이다. 공단이 11월에 일괄 재심사하고
// 12월분부터 지역가입자로 부과한다.
//
// 요건이 세 갈래로 갈리고 서로 얽혀 있어서 폼 하나로는 답이 안 나온다.
//   소득요건  합산 2천만원 + 사업소득 없을 것 + (기혼이면) 배우자도 충족
//   재산요건  과표 5.4억 이하 / 5.4억~9억은 소득 1천만원 조건부 / 형제자매 1.8억
//   부양요건  형제자매는 30세 미만 또는 65세 이상만
//
// 근거: 국민건강보험법 시행규칙 별표 1(부양요건), 별표 1의2(소득 및 재산요건)
//
// 결과를 요건별로 쪼개서 보여준다. 어디서 걸렸는지 모르면 고칠 수도 없다.

(function () {
  "use strict";

  // ── 기준값 ────────────────────────────────────────────────
  // 2022년 9월 2단계 개편으로 합산소득 기준이 3,400만원에서 2,000만원으로 내려갔다.

  var INCOME_LIMIT = 20000000;        // 합산소득 연 2천만원
  var BIZ_EXEMPT_LIMIT = 5000000;     // 특례 대상의 사업소득 인정 한도 연 500만원
  var PROP_SAFE = 540000000;          // 재산세 과세표준 5.4억 이하면 무조건 통과
  var PROP_CEIL = 900000000;          // 9억 초과면 무조건 탈락
  var PROP_MID_INCOME = 10000000;     // 5.4억~9억 구간에서 요구하는 소득 상한 1천만원
  var SIBLING_PROP = 180000000;       // 형제자매 재산 기준 1.8억

  var RELATION_LABEL = {
    spouse: "배우자",
    ascendant: "직계존속 (부모·조부모)",
    descendant: "직계비속 (자녀·손자녀)",
    sibling: "형제·자매",
  };

  // ── 판정 ──────────────────────────────────────────────────

  // 사업소득 요건. 원칙은 "사업소득이 없을 것"이고 예외가 붙는다.
  // 예외 대상이면 연 500만원까지는 없는 것으로 본다.
  function judgeBusiness(biz, registered, special, rental) {
    if (biz <= 0) {
      return { ok: true, reason: "사업소득이 없습니다" };
    }
    // 사업자등록이 없어도 주택임대소득이 있으면 특례에서 빠진다.
    var exempt = special || (!registered && !rental);
    if (!exempt) {
      if (registered) {
        return { ok: false, reason: "사업자등록이 있으면 사업소득이 1원이라도 있을 때 탈락합니다" };
      }
      return { ok: false, reason: "주택임대소득이 있으면 사업자등록이 없어도 500만원 특례를 못 씁니다" };
    }
    if (biz <= BIZ_EXEMPT_LIMIT) {
      return { ok: true, reason: "특례 대상이라 연 500만원까지는 사업소득이 없는 것으로 봅니다" };
    }
    return { ok: false, reason: "특례를 쓰더라도 연 500만원을 넘으면 탈락합니다" };
  }

  function judge(i) {
    // 사업소득만 따로 판정하고 나머지는 어차피 합산이라 한 칸으로 받는다.
    // 입력 칸이 늘수록 끝까지 채우는 사람이 준다.
    var sum = i.business + i.otherIncome;

    var incomeOk = sum <= INCOME_LIMIT;
    var biz = judgeBusiness(i.business, i.bizRegistered, i.special, i.rental);

    // 기혼자는 부부가 모두 소득요건을 채워야 한다. 재산요건은 본인만 본다.
    // 이 비대칭이 실제로 사람들을 가장 많이 놀라게 하는 지점이다.
    var spouseOk = true;
    if (i.married) {
      spouseOk = i.spouseIncome <= INCOME_LIMIT && !(i.spouseBiz && i.spouseBizRegistered);
    }

    // 재산요건. 형제자매는 별도 기준이다.
    var propOk, propWhy;
    if (i.relation === "sibling") {
      propOk = i.property <= SIBLING_PROP;
      propWhy = propOk
        ? "형제·자매 기준 1억 8천만원 이하입니다"
        : "형제·자매는 재산세 과세표준 1억 8천만원을 넘으면 탈락합니다";
    } else if (i.property <= PROP_SAFE) {
      propOk = true;
      propWhy = "5억 4천만원 이하입니다";
    } else if (i.property <= PROP_CEIL) {
      propOk = sum <= PROP_MID_INCOME;
      propWhy = propOk
        ? "5억 4천만원을 넘지만 9억원 이하이고, 합산소득이 1천만원 이하라 통과합니다"
        : "5억 4천만원~9억원 구간은 합산소득이 1천만원 이하여야 합니다";
    } else {
      propOk = false;
      propWhy = "재산세 과세표준 9억원을 넘으면 소득과 관계없이 탈락합니다";
    }

    // 형제자매만 나이 요건이 걸린다.
    var relOk = true, relWhy = "";
    if (i.relation === "sibling") {
      relOk = i.age < 30 || i.age >= 65 || i.special;
      relWhy = relOk
        ? "형제·자매 나이 요건을 채웁니다"
        : "형제·자매는 30세 미만이거나 65세 이상이어야 합니다 (장애인·상이자는 나이 무관)";
    }

    var pass = incomeOk && biz.ok && spouseOk && propOk && relOk;

    return {
      relation: i.relation,
      sum: sum,
      incomeOk: incomeOk,
      biz: biz,
      married: i.married,
      spouseOk: spouseOk,
      spouseIncome: i.spouseIncome,
      propOk: propOk,
      propWhy: propWhy,
      property: i.property,
      relOk: relOk,
      relWhy: relWhy,
      pass: pass,
    };
  }

  // ── 화면 ──────────────────────────────────────────────────

  function won(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }

  function row(ok, title, detail) {
    return '<li class="' + (ok ? "pass" : "fail") + '">' +
           '<strong>' + title + '</strong>' +
           (detail ? '<span>' + detail + "</span>" : "") + "</li>";
  }

  function render(r) {
    var box = document.getElementById("calc-result");
    var html = "";

    html += '<p class="calc-label">' + RELATION_LABEL[r.relation] + " · 합산소득 " + won(r.sum) + "</p>";
    if (r.pass) {
      html += '<p class="calc-amount">자격이 유지될 것으로 보입니다</p>';
      html += '<p class="calc-sub">아래 요건을 모두 채웁니다</p>';
    } else {
      html += '<p class="calc-amount none">탈락할 가능성이 높습니다</p>';
      html += '<p class="calc-sub">아래에서 걸린 항목을 보세요</p>';
    }

    html += '<ul class="calc-checklist">';
    html += row(r.incomeOk, "합산소득 " + won(r.sum),
      r.incomeOk ? "연 2천만원 이하입니다"
                 : "연 2천만원을 " + won(r.sum - INCOME_LIMIT) + " 넘습니다");
    html += row(r.biz.ok, "사업소득", r.biz.reason);
    if (r.married) {
      html += row(r.spouseOk, "배우자 소득 " + won(r.spouseIncome),
        r.spouseOk ? "배우자도 소득요건을 채웁니다"
                   : "기혼자는 부부가 모두 소득요건을 채워야 합니다. 배우자 쪽이 기준을 넘으면 두 사람이 함께 빠집니다");
    }
    html += row(r.propOk, "재산세 과세표준 " + won(r.property), r.propWhy);
    if (r.relation === "sibling") {
      html += row(r.relOk, "형제·자매 부양요건", r.relWhy);
    }
    html += "</ul>";

    html += '<ul class="calc-notes">';
    if (!r.pass) {
      html += "<li>탈락하면 <strong>지역가입자</strong>로 바뀌어 소득과 재산에 따라 보험료가 따로 부과됩니다. 자격 상실 후 최대 4년까지 보험료를 단계적으로 깎아주는 경감 제도가 있으니 공단에 문의해 보세요</li>";
    }
    html += "<li>이자·배당소득은 연 1천만원 이하면 분리과세로 끝나 공단에 자료가 넘어오지 않는 경우가 많습니다. 넣으신 금액에 그런 금융소득이 섞여 있다면 실제 심사에서는 빠질 수 있습니다</li>";
    html += "<li>연금소득은 <strong>공적연금만</strong> 셉니다. 국민연금·공무원연금·사학연금·군인연금이 대상이고 퇴직연금과 개인연금은 빠집니다</li>";
    html += "<li>재산은 시세나 공시가격이 아니라 <strong>재산세 과세표준</strong>입니다. 주택은 공시가격의 60%, 토지·건축물은 70% 수준입니다</li>";
    html += "<li>공단은 매년 11월에 자격을 일괄 재심사합니다. 전년도 소득과 당해 연도 재산세 과세표준을 봅니다</li>";
    html += "</ul>";

    html += '<div class="calc-actions">';
    html += '<a class="calc-btn primary" href="https://www.nhis.or.kr" target="_blank" rel="noopener">공단에서 내 자격 조회하기</a>';
    html += "</div>";

    html += '<div class="calc-share">';
    html += '<span class="calc-share-label">결과 공유하기</span>';
    html += '<div class="calc-share-btns">';
    html += '<button class="share-btn kakao" type="button" data-share="native">카카오톡·메시지</button>';
    html += '<button class="share-btn x" type="button" data-share="x">X</button>';
    html += '<button class="share-btn link" type="button" data-share="copy">링크 복사</button>';
    html += "</div></div>";

    html += '<p class="calc-disclaimer">국민건강보험법 시행규칙 별표 1과 별표 1의2를 그대로 반영한 <strong>간이 판정</strong>입니다. 실제 심사는 공단이 보유한 소득·재산 자료로 이루어지고, 폐업이나 사업중단처럼 공단이 따로 인정하는 사유도 있습니다. 최종 확인은 국민건강보험공단 1577-1000으로 하세요.</p>';

    box.innerHTML = html;
    box.hidden = false;

    var url = "https://leisurely.importants-studio.com/tools/dependent-check/";
    var shareText = r.pass
      ? "합산소득 " + won(r.sum) + "이면 건강보험 피부양자 자격이 유지될 것 같다고 합니다 (느긋하게 판정기)"
      : "합산소득 " + won(r.sum) + "이면 건강보험 피부양자에서 탈락할 수 있다고 합니다 (느긋하게 판정기)";

    box.querySelectorAll("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-share");
        if (mode === "native") {
          if (navigator.share) {
            navigator.share({ title: "건강보험 피부양자 자격 판정기", text: shareText, url: url }).catch(function () {});
          } else {
            copyTo(btn, shareText + "\n" + url, "복사됨 (카톡에 붙여넣기)");
          }
        } else if (mode === "x") {
          window.open(
            "https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText) + "&url=" + encodeURIComponent(url),
            "_blank", "noopener"
          );
        } else {
          copyTo(btn, url, "링크 복사됨");
        }
      });
    });

    function copyTo(btn, text, done) {
      var original = btn.textContent;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = done;
        setTimeout(function () { btn.textContent = original; }, 2000);
      });
    }

    if (box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ── 입력 ──────────────────────────────────────────────────

  function num(el) {
    if (!el) return 0;
    var v = parseInt(String(el.value).replace(/[,\s원]/g, ""), 10);
    return isNaN(v) || v < 0 ? 0 : v;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("dependent-form");
    if (!form) return;

    // 관계와 혼인 여부에 따라 필요한 칸이 달라진다. 안 쓰는 칸을 띄워두면
    // 사람들이 거기 뭘 넣어야 하나 고민하다 그만둔다.
    var siblingBox = document.getElementById("sibling-fields");
    var spouseBox = document.getElementById("spouse-fields");

    function sync() {
      siblingBox.hidden = form.elements.relation.value !== "sibling";
      spouseBox.hidden = !form.elements.married.checked;
    }
    form.elements.relation.addEventListener("change", sync);
    form.elements.married.addEventListener("change", sync);
    sync();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      render(judge({
        relation: form.elements.relation.value,
        age: parseInt(form.elements.age.value, 10) || 0,
        married: form.elements.married.checked,
        business: num(form.elements.business),
        bizRegistered: form.elements.bizRegistered.checked,
        rental: form.elements.rental.checked,
        special: form.elements.special.checked,
        otherIncome: num(form.elements.otherIncome),
        property: num(form.elements.property),
        spouseIncome: num(form.elements.spouseIncome),
        spouseBiz: num(form.elements.spouseBiz) > 0,
        spouseBizRegistered: form.elements.spouseBizRegistered.checked,
      }));
    });
  });

  window.__dependentCheck = {
    judge: judge, judgeBusiness: judgeBusiness,
    INCOME_LIMIT: INCOME_LIMIT, PROP_SAFE: PROP_SAFE, PROP_CEIL: PROP_CEIL,
    SIBLING_PROP: SIBLING_PROP, BIZ_EXEMPT_LIMIT: BIZ_EXEMPT_LIMIT,
  };
})();
