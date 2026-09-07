// 국민연금 재직자 감액 진단기.
//
// 노령연금을 받으면서 일하면 연금이 깎인다. 그런데 2026년 6월 17일부터 기준선이
// A값에서 A값+200만원으로 올라, 월 519만원 아래면 한 푼도 안 깎인다.
//
// 이 진단기가 답하는 것은 두 가지다.
//   1) 내 출생연도면 몇 살부터 받고, 감액은 몇 살까지 걸리는가
//   2) 내 소득이면 깎이는가, 깎이면 얼마쯤인가
//
// 감액 규모는 공단이 구간별 범위로 발표한다. 그래서 결과도 범위다. 억지로
// 한 값을 내면 없는 정확도를 만드는 것이 된다.

(function () {
  "use strict";

  // ── 상수 ──────────────────────────────────────────────────

  // 근거: 2026-09-03 국민연금 재직자 감액제도 개편 글 (국민연금공단)
  //
  // A값은 전체 가입자의 최근 3년 평균소득월액을 평균 낸 값으로 매년 바뀐다.
  var A_VALUE = 3193511;              // 2026년 A값
  var EXEMPT_MARGIN = 2000000;        // 2026년 6월 17일부터 붙은 여유분
  var THRESHOLD = A_VALUE + EXEMPT_MARGIN;   // 약 519만원. 이 아래면 감액 없음

  // 초과소득월액(월평균소득 - A값) 구간별 감액 규모.
  // 공단 발표가 범위라 그대로 범위로 둔다.
  var BANDS = [
    { min: 2000000, max: 3000000, low: 150000, high: 300000, label: "200만~300만원" },
    { min: 3000000, max: 4000000, low: 300000, high: 500000, label: "300만~400만원" },
    { min: 4000000, max: Infinity, low: 500000, high: null,  label: "400만원 이상" },
  ];

  // 감액 상한. 아무리 소득이 많아도 노령연금의 절반을 넘겨 깎지 않는다.
  var MAX_CUT_RATIO = 0.5;

  // 출생연도별 지급개시연령. 감액은 개시연령부터 5년만 걸린다.
  var START_AGES = [
    { from: 1953, to: 1956, age: 61 },
    { from: 1957, to: 1960, age: 62 },
    { from: 1961, to: 1964, age: 63 },
    { from: 1965, to: 1968, age: 64 },
    { from: 1969, to: 9999, age: 65 },
  ];

  var CUT_YEARS = 5;

  // ── 계산 ──────────────────────────────────────────────────

  function startAge(year) {
    for (var i = 0; i < START_AGES.length; i += 1) {
      if (year >= START_AGES[i].from && year <= START_AGES[i].to) return START_AGES[i].age;
    }
    return null;   // 1953년보다 앞이면 표 밖이다
  }

  function calculate(input) {
    var age = startAge(input.birthYear);
    var monthly = input.income;
    var excess = Math.max(0, monthly - A_VALUE);
    var reduced = monthly > THRESHOLD;

    var band = null;
    if (reduced) {
      for (var i = 0; i < BANDS.length; i += 1) {
        if (excess >= BANDS[i].min && excess < BANDS[i].max) { band = BANDS[i]; break; }
      }
    }

    // 연금액을 넣었으면 상한(절반)을 함께 본다. 안 넣었어도 진단은 된다.
    var pension = input.pension || 0;
    var cap = pension > 0 ? Math.floor(pension * MAX_CUT_RATIO) : null;
    var low = band ? band.low : 0;
    var high = band ? band.high : 0;
    if (cap !== null) {
      low = Math.min(low, cap);
      if (high !== null) high = Math.min(high, cap);
    }

    return {
      birthYear: input.birthYear,
      startAge: age,
      cutFrom: age,
      cutTo: age === null ? null : age + CUT_YEARS,
      monthly: monthly,
      excess: excess,
      threshold: THRESHOLD,
      reduced: reduced,
      band: band,
      pension: pension,
      cap: cap,
      cutLow: low,
      cutHigh: high,
      // 상한에 걸려 발표 구간보다 적게 깎이는 경우
      cappedByHalf: cap !== null && band !== null && band.low > cap,
    };
  }

  // ── 화면 ──────────────────────────────────────────────────

  function won(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }

  function render(r) {
    var box = document.getElementById("calc-result");
    var html = "";

    if (r.startAge === null) {
      html += '<p class="calc-amount none">표 밖의 출생연도입니다</p>';
      html += '<p class="calc-reason">1953년 이후 출생연도를 넣어 주세요. 그 앞은 지급개시연령이 60세로 이 표에 없습니다.</p>';
    } else if (!r.reduced) {
      html += '<p class="calc-label">' + r.birthYear + "년생 · 월 " + won(r.monthly) + " 소득</p>";
      html += '<p class="calc-amount">깎이지 않습니다</p>';
      html += '<p class="calc-sub">감액 기준선 ' + won(r.threshold) + " 아래입니다</p>";
    } else {
      html += '<p class="calc-label">' + r.birthYear + "년생 · 월 " + won(r.monthly) + " 소득</p>";
      html += '<p class="calc-amount">월 ' + won(r.cutLow) +
              (r.cutHigh ? " ~ " + won(r.cutHigh) : " 이상") + "</p>";
      html += '<p class="calc-sub">이 범위에서 깎입니다</p>';
    }

    html += '<ul class="calc-notes">';
    if (r.startAge !== null) {
      html += "<li><strong>" + r.birthYear + "년생은 " + r.startAge +
              "세부터</strong> 노령연금을 받습니다. 감액은 " + r.cutFrom + "세부터 " +
              r.cutTo + "세까지 5년만 걸리고, " + (r.cutTo + 1) +
              "세부터는 소득이 얼마든 전액 받습니다</li>";
    }
    if (r.reduced) {
      html += "<li>월평균소득에서 A값 " + won(A_VALUE) + "을 뺀 초과소득월액이 " +
              won(r.excess) + "입니다. " + r.band.label + " 구간에 들어갑니다</li>";
      if (r.cappedByHalf) {
        html += "<li>노령연금이 " + won(r.pension) + "이라 감액 상한(연금의 절반) " +
                won(r.cap) + "에 걸립니다. 발표 구간보다 적게 깎입니다</li>";
      } else if (r.cap !== null) {
        html += "<li>감액은 노령연금의 절반(" + won(r.cap) + ")을 넘지 않습니다</li>";
      } else {
        html += "<li>감액은 노령연금의 절반을 넘지 않습니다. 연금액을 넣으시면 그 상한도 같이 봅니다</li>";
      }
    } else {
      html += "<li>2026년 6월 17일부터 기준선이 A값에서 <strong>A값+200만원</strong>으로 올랐습니다. 그 전에는 " +
              won(A_VALUE) + "만 넘어도 깎였습니다</li>";
      html += "<li>이미 감액을 받고 계셨더라도 2025년 1월 1일 이후 소득부터 새 기준으로 다시 계산됩니다</li>";
    }
    html += "<li>근로소득과 사업소득만 봅니다. 이자·배당·연금소득은 감액 대상이 아닙니다</li>";
    html += "</ul>";

    html += '<div class="calc-actions">';
    html += '<a class="calc-btn primary" href="https://www.nps.or.kr" target="_blank" rel="noopener">국민연금공단에서 내 예상 연금액 조회</a>';
    html += "</div>";

    html += '<div class="calc-share">';
    html += '<span class="calc-share-label">결과 공유하기</span>';
    html += '<div class="calc-share-btns">';
    html += '<button class="share-btn kakao" type="button" data-share="native">카카오톡·메시지</button>';
    html += '<button class="share-btn x" type="button" data-share="x">X</button>';
    html += '<button class="share-btn link" type="button" data-share="copy">링크 복사</button>';
    html += "</div></div>";

    html += '<p class="calc-disclaimer">공단이 발표한 구간표를 그대로 반영한 <strong>간이 진단</strong>입니다. 감액 규모가 구간별 범위로 발표되기 때문에 이 계산도 범위로 나옵니다. 정확한 감액액은 세부 산식에 따라 갈리므로, 국민연금공단 홈페이지의 내 연금 알아보기나 국번 없이 1355로 확인하세요.</p>';

    box.innerHTML = html;
    box.hidden = false;

    var url = "https://leisurely.importants-studio.com/tools/pension-reduction-calculator/";
    var shareText = r.reduced
      ? r.birthYear + "년생이 월 " + won(r.monthly) + " 벌면 연금이 월 " + won(r.cutLow) +
        "쯤 깎인다고 합니다 (느긋하게 간이진단)"
      : r.birthYear + "년생이 월 " + won(r.monthly) + " 벌어도 연금은 안 깎인다고 합니다 (느긋하게 간이진단)";

    box.querySelectorAll("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-share");
        if (mode === "native") {
          if (navigator.share) {
            navigator.share({ title: "국민연금 재직자 감액 진단기", text: shareText, url: url }).catch(function () {});
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

    // 스크롤은 마지막에 한다. 위에 두면 이게 터질 때 공유 버튼 연결까지 같이 죽는다.
    if (box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("pension-reduction-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var year = parseInt(form.elements.birthYear.value, 10);
      if (!year || year < 1900 || year > 2010) { form.elements.birthYear.select(); return; }
      var income = parseInt(String(form.elements.income.value).replace(/[,\s원]/g, ""), 10);
      if (isNaN(income) || income < 0) income = 0;
      var pension = parseInt(String(form.elements.pension.value).replace(/[,\s원]/g, ""), 10);
      if (isNaN(pension) || pension < 0) pension = 0;
      render(calculate({ birthYear: year, income: income, pension: pension }));
    });
  });

  window.__pensionCut = {
    calculate: calculate, startAge: startAge,
    A_VALUE: A_VALUE, THRESHOLD: THRESHOLD, BANDS: BANDS, START_AGES: START_AGES,
  };
})();
