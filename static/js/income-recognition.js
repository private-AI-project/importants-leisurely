// 소득인정액 계산기 겸 기초연금 판정기.
//
// 기존 기초연금 계산기들은 입력으로 "소득인정액"을 요구한다. 그런데
// 소득인정액을 구하는 게 문제의 대부분이다. 재산 종류별 공제와 환산율,
// 지역별 기본재산액을 다 계산한 사람이 계산기를 왜 쓰겠는가.
//
// 그래서 이 도구는 사람들이 실제로 아는 값만 묻는다. 집값, 예금, 대출, 월급.
// 소득인정액은 우리가 만들고, 그다음 기초연금을 받는지까지 본다.
//
// 근거: 기초연금법 시행령 제2조·제5조, 2026년 보건복지부 고시

(function () {
  "use strict";

  // ── 기준값 (2026년) ────────────────────────────────────────

  var SELECTION = { single: 2470000, couple: 3952000 };  // 선정기준액
  var BASE_PENSION = 349700;            // 기준연금액
  var COUPLE_CUT = 0.2;                 // 부부 모두 수급 시 각 20% 감액
  var MIN_RATIO = 0.1;                  // 소득역전 방지 감액의 하한 (기준연금액의 10%)

  var WORK_DEDUCT = 1160000;            // 근로소득 기본공제 (월)
  var WORK_RATE = 0.7;                  // 공제 후 30% 추가공제 → 0.7 을 곱한다
  var FIN_DEDUCT = 20000000;            // 금융재산 공제
  var CONVERT_RATE = 0.04;              // 재산 소득환산율 연 4%

  // 지역별 기본재산액 공제.
  var BASIC_PROPERTY = {
    metro: { amount: 135000000, label: "대도시·특례시" },
    city:  { amount: 85000000,  label: "중소도시" },
    rural: { amount: 72500000,  label: "농어촌" },
  };

  // ── 계산 ──────────────────────────────────────────────────

  // 소득평가액. 근로소득만 공제가 붙고 나머지는 그대로 더한다.
  function evaluateIncome(i) {
    var work = Math.max(0, i.work - WORK_DEDUCT) * WORK_RATE;
    // 사업·재산·공적이전소득은 공제가 없어 처리가 같다. 칸을 나눠 받을 이유가 없다.
    var rest = i.otherIncome;
    return { work: work, rest: rest, total: work + rest };
  }

  // 재산의 소득환산액. 공제를 다 뺀 뒤 남은 것에만 연 4% 를 매기고 12로 나눈다.
  // 뺀 결과가 음수면 0 이다. 빚이 많다고 소득이 마이너스가 되지는 않는다.
  function convertProperty(i) {
    var region = BASIC_PROPERTY[i.region] || BASIC_PROPERTY.city;
    var general = Math.max(0, i.general - region.amount);
    var financial = Math.max(0, i.financial - FIN_DEDUCT);
    var net = Math.max(0, general + financial - i.debt);
    var monthly = net * CONVERT_RATE / 12;
    // 고급자동차와 회원권은 공제도 환산도 없이 가액 전체가 월 소득이 된다.
    return {
      region: region,
      generalAfter: general,
      financialAfter: financial,
      net: net,
      monthly: monthly,
      luxury: i.luxury,
      total: monthly + i.luxury,
    };
  }

  function calculate(i) {
    var inc = evaluateIncome(i);
    var prop = convertProperty(i);
    var recognized = inc.total + prop.total;
    var limit = SELECTION[i.household];
    var eligible = recognized <= limit;

    // 부부 모두 받으면 각자 20% 깎인다.
    var base = i.bothReceive ? Math.round(BASE_PENSION * (1 - COUPLE_CUT)) : BASE_PENSION;

    // 소득역전 방지. 연금을 받아서 선정기준액을 넘어서면 그만큼 깎는다.
    // 안 그러면 아슬아슬하게 떨어진 사람이 받은 사람보다 잘살게 된다.
    var amount = base, reversed = false;
    if (eligible && recognized + base > limit) {
      amount = Math.max(Math.round(BASE_PENSION * MIN_RATIO), limit - recognized);
      amount = Math.floor(amount / 1000) * 1000;   // 천원 단위 절사
      reversed = amount < base;
    }
    if (!eligible) amount = 0;

    return {
      income: inc,
      property: prop,
      recognized: recognized,
      limit: limit,
      household: i.household,
      eligible: eligible,
      gap: recognized - limit,
      base: base,
      amount: amount,
      reversed: reversed,
      bothReceive: i.bothReceive,
    };
  }

  // ── 화면 ──────────────────────────────────────────────────

  function won(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }

  function line(label, value, note) {
    return '<li><span class="bd-label">' + label + "</span>" +
           '<span class="bd-value">' + value + "</span>" +
           (note ? '<span class="bd-note">' + note + "</span>" : "") + "</li>";
  }

  function render(r) {
    var box = document.getElementById("calc-result");
    var html = "";

    html += '<p class="calc-label">' + (r.household === "single" ? "단독가구" : "부부가구") +
            " · 소득인정액 월 " + won(r.recognized) + "</p>";

    if (r.eligible) {
      html += '<p class="calc-amount">월 ' + won(r.amount) + "</p>";
      html += '<p class="calc-sub">기초연금 대상일 가능성이 높습니다</p>';
    } else {
      html += '<p class="calc-amount none">대상이 아닐 가능성이 높습니다</p>';
      html += '<p class="calc-sub">선정기준액 ' + won(r.limit) + "을 " + won(r.gap) + " 넘습니다</p>";
    }

    // 소득인정액이 어떻게 나왔는지 분해해서 보여준다. 이게 없으면
    // 사용자가 결과를 검증할 수도, 뭘 바꿔야 할지 알 수도 없다.
    html += '<div class="calc-breakdown"><h4>소득인정액이 나온 과정</h4><ul>';
    html += line("근로소득 평가액",
      won(r.income.work),
      "기본공제 " + won(WORK_DEDUCT) + " 를 뺀 뒤 30% 를 더 공제합니다");
    if (r.income.rest > 0) {
      html += line("그 밖의 소득", won(r.income.rest), "사업·재산·공적이전소득은 공제 없이 더합니다");
    }
    html += line("일반재산 공제 후",
      won(r.property.generalAfter),
      r.property.region.label + " 기본재산액 " + won(r.property.region.amount) + " 공제");
    html += line("금융재산 공제 후", won(r.property.financialAfter), "금융재산은 " + won(FIN_DEDUCT) + " 공제");
    html += line("환산 대상 재산", won(r.property.net), "여기서 부채를 뺐습니다");
    html += line("재산의 소득환산액", won(r.property.monthly), "연 4% 를 매기고 12로 나눕니다");
    if (r.property.luxury > 0) {
      html += line("고급자동차·회원권", won(r.property.luxury), "공제도 환산도 없이 가액 전체가 월 소득이 됩니다");
    }
    html += line("소득인정액", "<strong>" + won(r.recognized) + "</strong>", "선정기준액 " + won(r.limit));
    html += "</ul></div>";

    html += '<ul class="calc-notes">';
    if (r.reversed) {
      html += "<li>소득역전 방지 감액이 걸렸습니다. 연금까지 더하면 선정기준액을 넘기 때문에 그만큼 깎아 " +
              won(r.amount) + " 만 나옵니다. 아슬아슬하게 떨어진 분보다 잘살게 되는 걸 막는 장치입니다</li>";
    }
    if (r.bothReceive) {
      html += "<li>부부가 모두 받으면 각자 20% 씩 깎입니다. 기준연금액 " + won(BASE_PENSION) +
              " 이 " + won(r.base) + " 이 됩니다</li>";
    }
    if (r.eligible) {
      html += "<li><strong>국민연금 연계감액은 반영하지 않았습니다.</strong> 국민연금을 기준연금액의 150%(" +
              won(Math.round(BASE_PENSION * 1.5)) + ")보다 많이 받고 계시면 실제 기초연금이 이보다 적을 수 있습니다. 산식이 가입이력에 따라 갈려 여기서는 계산하지 않습니다</li>";
    }
    if (!r.eligible && r.gap < 300000) {
      html += "<li>선정기준액을 " + won(r.gap) + " 넘었습니다. 재산 구성이나 부채 반영이 달라지면 뒤집힐 수 있는 차이입니다. 복지로 모의계산이나 국민연금공단 1355로 한 번 확인해 보세요</li>";
    }
    html += "<li>선정기준액은 매년 1월에 바뀝니다. 2026년은 단독가구 " + won(SELECTION.single) +
            ", 부부가구 " + won(SELECTION.couple) + " 입니다</li>";
    html += "<li>부부가구는 한 사람만 신청해도 <strong>부부 기준</strong>으로 심사합니다. 소득과 재산도 둘을 합쳐서 봅니다</li>";
    html += "</ul>";

    html += '<div class="calc-actions">';
    html += '<a class="calc-btn primary" href="https://www.bokjiro.go.kr" target="_blank" rel="noopener">복지로에서 모의계산 하기</a>';
    html += "</div>";

    html += '<div class="calc-share">';
    html += '<span class="calc-share-label">결과 공유하기</span>';
    html += '<div class="calc-share-btns">';
    html += '<button class="share-btn kakao" type="button" data-share="native">카카오톡·메시지</button>';
    html += '<button class="share-btn x" type="button" data-share="x">X</button>';
    html += '<button class="share-btn link" type="button" data-share="copy">링크 복사</button>';
    html += "</div></div>";

    html += '<p class="calc-disclaimer">기초연금법 시행령의 산식을 그대로 반영한 <strong>간이 계산</strong>입니다. 무료임차소득, 증여재산, 자연적 소비금액 차감처럼 개별 사정에 따라 붙는 항목은 반영하지 않았습니다. 국민연금 연계감액도 빠져 있습니다. 정확한 금액은 복지로 모의계산이나 국민연금공단 1355로 확인하세요.</p>';

    box.innerHTML = html;
    box.hidden = false;
    if (window.gtag) gtag("event", "tool_result", { tool_path: location.pathname });

    var url = "https://leisurely.importants-studio.com/tools/income-recognition/";
    var shareText = r.eligible
      ? "소득인정액이 월 " + won(r.recognized) + "이면 기초연금 월 " + won(r.amount) + " 정도라고 합니다 (느긋하게 계산기)"
      : "소득인정액이 월 " + won(r.recognized) + "이면 기초연금 대상이 아닐 것 같다고 합니다 (느긋하게 계산기)";

    box.querySelectorAll("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-share");
        if (mode === "native") {
          if (navigator.share) {
            navigator.share({ title: "기초연금 모의계산 (소득인정액 계산기)", text: shareText, url: url }).catch(function () {});
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
    var form = document.getElementById("income-recognition-form");
    if (!form) return;

    var bothBox = document.getElementById("both-field");
    function sync() { bothBox.hidden = form.elements.household.value !== "couple"; }
    form.elements.household.addEventListener("change", sync);
    sync();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      render(calculate({
        household: form.elements.household.value,
        region: form.elements.region.value,
        work: num(form.elements.work),
        otherIncome: num(form.elements.otherIncome),
        general: num(form.elements.general),
        financial: num(form.elements.financial),
        debt: num(form.elements.debt),
        luxury: num(form.elements.luxury),
        bothReceive: form.elements.household.value === "couple" && form.elements.bothReceive.checked,
      }));
    });
  });

  window.__incomeRecognition = {
    calculate: calculate, evaluateIncome: evaluateIncome, convertProperty: convertProperty,
    SELECTION: SELECTION, BASE_PENSION: BASE_PENSION, BASIC_PROPERTY: BASIC_PROPERTY,
    WORK_DEDUCT: WORK_DEDUCT, FIN_DEDUCT: FIN_DEDUCT, CONVERT_RATE: CONVERT_RATE,
  };
})();
