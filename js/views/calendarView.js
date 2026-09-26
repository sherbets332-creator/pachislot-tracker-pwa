/**
 * カレンダー（ホーム）画面。Flask版 calendar.py + templates/calendar/*.html 相当。
 */
import { getRecordsForMonth, computeDisplayProfits, getRecordYearRange } from "../repository.js";
import { commas, profitClass, formatDate, todayDateString } from "../ui/format.js";
import { renderFlash } from "../ui/flash.js";
import { buildUrl, navigate } from "../router.js";

function getMonthWeeks(year, month) {
  // JSのDate#getDay()は0=日曜〜6=土曜。Flask版の firstweekday=6（日曜始まり）とそのまま一致する。
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstOfMonth.getDay();

  const weeks = [];
  let week = new Array(startWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function addMonths(year, month, delta) {
  const total = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export async function renderCalendar(container, db, query) {
  const today = new Date();
  const year = query.get("year") ? parseInt(query.get("year"), 10) : today.getFullYear();
  const month = query.get("month") ? parseInt(query.get("month"), 10) : today.getMonth() + 1;
  const todayStr = todayDateString();

  const records = await getRecordsForMonth(db, year, month);
  const displayProfits = await computeDisplayProfits(db, records);

  const dailyTotals = new Map();
  for (const record of records) {
    const displayProfit = displayProfits.get(record.id) ?? record.profit_amount;
    dailyTotals.set(record.play_date, (dailyTotals.get(record.play_date) || 0) + displayProfit);
  }
  const monthTotal = [...dailyTotals.values()].reduce((sum, v) => sum + v, 0);

  const weeks = getMonthWeeks(year, month);
  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);

  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

  // 年月ピッカーの選択肢範囲：記録が実際にある年 ± 1年（無ければ今年のみ）をカバーする
  const yearRange = await getRecordYearRange(db);
  const minYear = Math.min(today.getFullYear(), year, yearRange?.min ?? today.getFullYear()) - 1;
  const maxYear = Math.max(today.getFullYear(), year, yearRange?.max ?? today.getFullYear()) + 1;
  const yearOptionsHtml = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i)
    .map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${y}年</option>`)
    .join("");
  const monthOptionsHtml = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${m}月</option>`)
    .join("");

  const rowsHtml = weeks
    .map((week) => {
      const cells = week
        .map((day) => {
          if (day === null) return `<td class="empty"></td>`;
          const dateStr = formatDate(year, month, day);
          const total = dailyTotals.has(dateStr) ? dailyTotals.get(dateStr) : null;
          const isToday = dateStr === todayStr;
          const href = total === null ? buildUrl("/records/new", { date: dateStr }) : buildUrl(`/records/day/${dateStr}`);
          const amountHtml =
            total === null ? "" : `<div class="day-amount ${profitClass(total)}">${commas(total)}</div>`;
          return `<td class="${isToday ? "today" : ""}"><a href="${href}"><div class="day-number">${day}</div>${amountHtml}</a></td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    ${renderFlash()}
    <div class="calendar-header">
      <a class="btn btn-sm" data-nav="prev" href="${buildUrl("/calendar", prev)}">◀</a>
      <button type="button" id="ym-toggle" style="background:none;border:none;font-size:1.1rem;font-weight:bold;padding:4px 8px;cursor:pointer;">${year}年${month}月 ▾</button>
      <a class="btn btn-sm" data-nav="next" href="${buildUrl("/calendar", next)}">▶</a>
    </div>
    <div id="ym-picker" class="card hidden" style="display:flex;gap:8px;align-items:center;justify-content:center;">
      <select id="ym-year">${yearOptionsHtml}</select>
      <select id="ym-month">${monthOptionsHtml}</select>
    </div>
    <div class="text-center mb-3">
      <span class="muted small">当月収支</span>
      <div class="fw-bold ${profitClass(monthTotal)}" style="font-size:1.4rem;">${commas(monthTotal)} 円</div>
    </div>
    <table class="calendar-table" id="calendar-table">
      <thead><tr>${weekdayLabels.map((w) => `<th>${w}</th>`).join("")}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <a class="btn btn-primary btn-block mt-3" href="${buildUrl("/records/new", { date: todayStr })}">+ 新規記録を登録</a>
  `;

  // 見出しをタップすると年月選択パネルを開閉する
  const ymPicker = container.querySelector("#ym-picker");
  container.querySelector("#ym-toggle").addEventListener("click", () => {
    ymPicker.classList.toggle("hidden");
  });
  function goToSelectedYearMonth() {
    const selectedYear = parseInt(container.querySelector("#ym-year").value, 10);
    const selectedMonth = parseInt(container.querySelector("#ym-month").value, 10);
    navigate("/calendar", { year: selectedYear, month: selectedMonth });
  }
  container.querySelector("#ym-year").addEventListener("change", goToSelectedYearMonth);
  container.querySelector("#ym-month").addEventListener("change", goToSelectedYearMonth);

  // スマホでの左右スワイプによる月切り替え
  const table = container.querySelector("#calendar-table");
  let touchStartX = null;
  let touchStartY = null;
  table.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );
  table.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) navigate("/calendar", next);
    else navigate("/calendar", prev);
  });
}
