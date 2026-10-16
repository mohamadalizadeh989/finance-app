'use strict';
// ---------- تاریخ شمسی (بر پایه Intl مرورگر) ----------
const JM = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const jf = new Intl.DateTimeFormat('en-US-u-ca-persian', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
const jcache = new Map();
const toIso = ms => new Date(ms).toISOString().slice(0, 10);
const today = () => toIso(Date.now());
function jp(iso) {
  let r = jcache.get(iso);
  if (r) return r;
  const o = {};
  jf.formatToParts(new Date(iso + 'T12:00:00Z')).forEach(p => { o[p.type] = p.value; });
  r = { y: +o.year, m: +o.month, d: +o.day };
  jcache.set(iso, r);
  return r;
}
const key = p => p.y * 372 + p.m * 31 + p.d;
function j2iso(y, m, d) {
  let g = Date.UTC(y + 621, 2, 21, 12) + ((m - 1) * 30.4 + d - 1) * 864e5;
  for (let i = 0; i < 80; i++) {
    const c = key(jp(toIso(g))) - (y * 372 + m * 31 + d);
    if (c === 0) return toIso(g);
    g -= Math.sign(c) * 864e5;
  }
  return null;
}
function addMonths(iso, n) {
  const p = jp(iso), t = p.m - 1 + n, y = p.y + Math.floor(t / 12), m = ((t % 12) + 12) % 12 + 1;
  let d = p.d, r;
  while (!(r = j2iso(y, m, d)) && d > 1) d--;
  return r;
}
const addDays = (iso, n) => toIso(Date.parse(iso + 'T12:00:00Z') + n * 864e5);
const diffDays = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
// ---------- اعداد ----------
const en = s => String(s).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[,٬،\s]/g, '').replace('٫', '.');
const fa = n => Math.round(n).toLocaleString('en-US').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const faN = s => String(s).replace(/\d/g, c => '۰۱۲۳۴۵۶۷۸۹'[c]);
const fd = iso => { const p = jp(iso); return `${p.y}/${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`.replace(/\d/g, c => '۰۱۲۳۴۵۶۷۸۹'[c]); };
const parseJ = s => { const m = en(s).match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/); return m ? j2iso(+m[1], +m[2], +m[3]) : null; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// ---------- داده ----------
const DEF = {
  accounts: [{ id: 'a1', name: 'کیف پول نقد', init: 0 }, { id: 'a2', name: 'حساب بانکی', init: 0 }],
  tx: [], loans: [], cheques: [],
  budgets: {},
  cats: {
    expense: ['خوراک', 'مسکن و اجاره', 'قبوض', 'حمل‌ونقل', 'درمان', 'آموزش', 'تفریح', 'پوشاک', 'قسط و بدهی', 'چک', 'سایر'],
    income: ['حقوق', 'کسب‌وکار', 'سرمایه‌گذاری', 'هدیه', 'سایر']
  }
};
let S = structuredClone(DEF);
// دیتابیس داخلی مرورگر (IndexedDB) - بدون نیاز به سرور
const DBP = new Promise((res, rej) => {
  const r = indexedDB.open('finance', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const idb = (mode, fn) => DBP.then(db => new Promise((res, rej) => {
  const t = db.transaction('kv', mode); const q = fn(t.objectStore('kv'));
  t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
}));
async function loadState() {
  let d = await idb('readonly', st => st.get('state')).catch(() => null);
  if (!d) { try { d = JSON.parse(localStorage.getItem('fin_app_v1')); } catch {} } // مهاجرت از نسخه قبلی
  if (d && d.tx) S = { ...structuredClone(DEF), ...d };
  S.dev ||= uid(); snap(); stamp();
}
// ---------- ردیابی تغییرات برای همگام‌سازی ----------
const COLS = ['accounts', 'tx', 'loans', 'cheques'];
const recKey = r => { const { u, ...x } = r; return JSON.stringify(x); };
let SNAP = {};
function snap() { SNAP = {}; COLS.forEach(c => (S[c] || []).forEach(r => SNAP[c + ':' + r.id] = recKey(r))); SNAP._b = JSON.stringify(S.budgets); SNAP._c = JSON.stringify(S.cats); }
function stamp() {
  const now = Date.now(); S.del ||= {}; S.mt ||= {}; const seen = new Set();
  COLS.forEach(c => (S[c] || []).forEach(r => { const k = c + ':' + r.id; seen.add(k); if (SNAP[k] !== recKey(r) || !r.u) r.u = now; }));
  Object.keys(SNAP).forEach(k => { if (k[0] !== '_' && !seen.has(k)) S.del[k] = now; });
  if (SNAP._b !== JSON.stringify(S.budgets)) S.mt.budgets = now;
  if (SNAP._c !== JSON.stringify(S.cats)) S.mt.cats = now;
  snap();
}
const save = () => { stamp(); idb('readwrite', st => st.put(S, 'state')).catch(e => alert('خطا در ذخیره: ' + e)); };
const acc = id => S.accounts.find(a => a.id === id);
const accName = id => acc(id)?.name || '—';
function balance(id) {
  let b = acc(id).init;
  S.tx.forEach(t => {
    if (t.type === 'income' && t.acc === id) b += t.amount;
    else if (t.type === 'expense' && t.acc === id) b -= t.amount;
    else if (t.type === 'transfer') { if (t.acc === id) b -= t.amount; if (t.to === id) b += t.amount; }
  });
  return b;
}
// ---------- وضعیت UI ----------
let tab = 'home', cur = jp(today()), chq = 'issued', txf = 'all', openLoan = null;
const $ = id => document.getElementById(id);
const monthTx = (y = cur.y, m = cur.m) => S.tx.filter(t => { const p = jp(t.date); return p.y === y && p.m === m; });
const sum = (arr, type) => arr.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
// ---------- موعدها ----------
function loanInst(l) {
  return Array.from({ length: l.count }, (_, i) => ({ i, due: addMonths(l.first, i * (l.every || 1)), paid: l.paid[i] }));
}
function dues() {
  const out = [];
  S.loans.forEach(l => loanInst(l).forEach(x => { if (!x.paid) out.push({ kind: 'قسط', title: l.title, amount: l.amount, due: x.due, tab: 'loans' }); }));
  S.cheques.filter(c => c.status === 'pending').forEach(c => out.push({ kind: c.dir === 'issued' ? 'چک پرداختنی' : 'چک دریافتنی', title: c.party, amount: c.amount, due: c.due, tab: 'cheques', inc: c.dir === 'received' }));
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
const dueTag = d => { const n = diffDays(d, today()); return n < 0 ? `<span class="tag bad">${fa(-n)} روز گذشته</span>` : n === 0 ? '<span class="tag w">امروز</span>' : n <= 7 ? `<span class="tag w">${fa(n)} روز دیگر</span>` : `<span class="tag">${fa(n)} روز دیگر</span>`; };
// ---------- فرم عمومی ----------
function form(title, fields, onSave, onDel) {
  const m = $('modal');
  m.hidden = false;
  m.innerHTML = `<div class="sheet"><h2>${title}</h2><form id="f">${fields.map(f => {
    const v = f.v ?? '';
    let h;
    if (f.t === 'select') h = `<select name="${f.k}">${f.o.map(o => { const [val, lb] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${val == v ? 'selected' : ''}>${esc(lb)}</option>`; }).join('')}</select>`;
    else if (f.t === 'area') h = `<textarea name="${f.k}" rows="2">${esc(v)}</textarea>`;
    else h = `<input name="${f.k}" value="${esc(f.t === 'num' ? v : v)}" ${f.t === 'num' ? 'inputmode="decimal"' : ''} ${f.t === 'date' ? 'readonly class="pick" data-pick="date"' : ''}${f.t === 'time' ? 'readonly class="pick" data-pick="time"' : ''} autocomplete="off">`;
    if (f.box) return `<div class="rbox"><div class="rbox-h">⏰ ${f.box}</div><label>${f.l}</label>${h}</div>`;
    return `<label>${f.l}</label>${h}`;
  }).join('')}<div class="acts"><button class="btn p">ذخیره</button><button type="button" class="btn" id="cx">انصراف</button>${onDel ? '<button type="button" class="btn d" id="dl">حذف</button>' : ''}</div></form></div>`;
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  $('cx').onclick = close;
  const gr = x => { const d = en(x); if (!/^\d*\.?\d*$/.test(d)) return x; const [a, b] = d.split('.'); const g = a.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (b !== undefined ? g + '.' + b : g).replace(/\d/g, c => '۰۱۲۳۴۵۶۷۸۹'[c]); };
  m.querySelectorAll('input[inputmode="decimal"]').forEach(i => { i.value = gr(i.value); i.oninput = () => { i.value = gr(i.value); }; });
  m.querySelectorAll('[data-pick=date]').forEach(i => { i.onclick = () => datePick(i); });
  m.querySelectorAll('[data-pick=time]').forEach(i => { i.onclick = () => timePick(i); });
  m.onclick = e => { if (e.target === m) close(); };
  if ($('dl')) $('dl').onclick = () => { if (confirm('حذف شود؟')) { onDel(); save(); close(); render(); } };
  $('f').onsubmit = e => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.target));
    const o = {};
    for (const f of fields) {
      let v = raw[f.k];
      if (f.t === 'num') { v = parseFloat(en(v)); if (!(v >= 0) && !f.neg) { alert(`«${f.l}» نامعتبر است`); return; } if (isNaN(v)) { alert(`«${f.l}» نامعتبر است`); return; } }
      if (f.t === 'date') { v = parseJ(v); if (!v) { alert('تاریخ نامعتبر است (مثال: ۱۴۰۵/۰۷/۲۳)'); return; } }
      if (f.req && !String(v).trim()) { alert(`«${f.l}» را وارد کنید`); return; }
      o[f.k] = typeof v === 'string' ? v.trim() : v;
    }
    if (onSave(o) === false) return;
    save(); close(); render();
  };
}
// ---------- انتخابگر تاریخ (تقویم شمسی) ----------
function popup() {
  const p = document.createElement('div'); p.className = 'pk-ov';
  p.innerHTML = '<div class="pk"></div>';
  document.body.appendChild(p); return p;
}
const mLen = (y, m) => m <= 6 ? 31 : m <= 11 ? 30 : j2iso(y, 12, 30) ? 30 : 29;
function datePick(inp) {
  const cur = jp(parseJ(inp.value) || today()), tp = jp(today());
  let y = cur.y, m = cur.m;
  const p = popup();
  const draw = () => {
    const first = (new Date(j2iso(y, m, 1) + 'T12:00:00Z').getUTCDay() + 1) % 7, n = mLen(y, m);
    let cells = '<i></i>'.repeat(first);
    for (let d = 1; d <= n; d++) cells += `<button type="button" data-d="${d}" class="${cur.y === y && cur.m === m && cur.d === d ? 'on' : ''} ${tp.y === y && tp.m === m && tp.d === d ? 'td' : ''}">${faN(d)}</button>`;
    p.firstChild.innerHTML = `<div class="pk-h"><button type="button" data-n="-1">›</button>
      <select data-m>${JM.map((x, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select data-y>${Array.from({ length: 21 }, (_, i) => tp.y - 10 + i).map(v => `<option value="${v}" ${v === y ? 'selected' : ''}>${faN(v)}</option>`).join('')}</select>
      <button type="button" data-n="1">‹</button></div>
      <div class="cal">${'شیدسچپج'.split('').map(x => `<span>${x}</span>`).join('')}${cells}</div>
      <div class="pk-f"><button type="button" class="btn" data-t>امروز</button><button type="button" class="btn" data-x>بستن</button></div>`;
  };
  p.onclick = e => {
    const t = e.target;
    if (t === p || t.dataset.x !== undefined) p.remove();
    else if (t.dataset.n) { m += +t.dataset.n; if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; } draw(); }
    else if (t.dataset.t !== undefined) { inp.value = fd(today()); p.remove(); }
    else if (t.dataset.d) { inp.value = fd(j2iso(y, m, +t.dataset.d)); p.remove(); }
  };
  p.onchange = e => { if (e.target.dataset.m !== undefined) m = +e.target.value; else y = +e.target.value; draw(); };
  draw();
}
// ---------- انتخابگر ساعت (صفحه گرد، ۲۴ ساعته) ----------
function timePick(inp) {
  let [h, mi] = en(inp.value || '07:00').split(':').map(Number), mode = 'h', drag = false;
  const p = popup();
  const pos = (i, r) => { const a = i / 12 * 2 * Math.PI; return `left:${50 + r * Math.sin(a)}%;top:${50 - r * Math.cos(a)}%`; };
  const draw = () => {
    let nums = '', ang, len;
    if (mode === 'h') {
      for (let i = 0; i < 12; i++) { const o = i || 12, n = i ? i + 12 : 0; nums += `<b style="${pos(i, 40)}" class="${h === o ? 'on' : ''}">${faN(o)}</b><b style="${pos(i, 26)}" class="in ${h === n ? 'on' : ''}">${faN(String(n).padStart(2, '0'))}</b>`; }
      ang = (h % 12) * 30; len = h === 0 || h > 12 ? 26 : 40;
    } else {
      for (let i = 0; i < 12; i++) nums += `<b style="${pos(i, 40)}" class="${mi === i * 5 ? 'on' : ''}">${faN(String(i * 5).padStart(2, '0'))}</b>`;
      ang = mi * 6; len = 40;
    }
    p.firstChild.innerHTML = `<div class="tm"><span class="${mode === 'h' ? 'on' : ''}" data-mode="h">${faN(String(h).padStart(2, '0'))}</span>:<span class="${mode === 'm' ? 'on' : ''}" data-mode="m">${faN(String(mi).padStart(2, '0'))}</span></div>
      <div class="dial"><div class="hand" style="height:${len}%;transform:rotate(${ang}deg)"></div><div class="dot"></div>${nums}</div>
      <div class="pk-f"><button type="button" class="btn p" data-ok>تأیید</button><button type="button" class="btn" data-x>انصراف</button></div>`;
  };
  // کلیک یا کشیدن روی صفحه ساعت
  const pick = e => {
    const d = p.querySelector('.dial'), r = d.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, yy = e.clientY - r.top - r.height / 2;
    let a = Math.atan2(x, -yy) * 180 / Math.PI; if (a < 0) a += 360;
    if (mode === 'h') { const i = Math.round(a / 30) % 12; h = Math.hypot(x, yy) / (r.width / 2) < 0.66 ? (i ? i + 12 : 0) : (i || 12); }
    else mi = Math.round(a / 6) % 60;
    draw();
  };
  p.onpointerdown = e => { if (e.target.classList.contains('dial')) { drag = true; pick(e); } };
  p.onpointermove = e => { if (drag) pick(e); };
  p.onpointerup = () => { if (drag) { drag = false; if (mode === 'h') { mode = 'm'; draw(); } } };
  p.onclick = e => {
    const t = e.target;
    if (t === p || t.dataset.x !== undefined) p.remove();
    else if (t.dataset.mode) { mode = t.dataset.mode; draw(); }
    else if (t.dataset.ok !== undefined) { inp.value = faN(String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0')); p.remove(); }
  };
  draw();
}
const accOpts = () => S.accounts.map(a => [a.id, a.name]);
// ---------- تراکنش ----------
function txForm(t) {
  const isNew = !t;
  t = t || { type: 'expense', date: today(), acc: S.accounts[0]?.id };
  if (t.ref) return alert('این تراکنش از بخش قسط/چک ثبت شده؛ از همان بخش وضعیت را برگردانید.');
  const types = [['expense', 'هزینه'], ['income', 'درآمد'], ['transfer', 'انتقال بین حساب‌ها']];
  const go = type => form(isNew ? 'تراکنش جدید' : 'ویرایش تراکنش', [
    { k: 'type', l: 'نوع', t: 'select', o: types, v: type },
    { k: 'amount', l: 'مبلغ (تومان)', t: 'num', v: t.amount },
    { k: 'date', l: 'تاریخ شمسی', t: 'date', v: fd(t.date) },
    { k: 'acc', l: type === 'transfer' ? 'از حساب' : 'حساب', t: 'select', o: accOpts(), v: t.acc },
    ...(type === 'transfer' ? [{ k: 'to', l: 'به حساب', t: 'select', o: accOpts(), v: t.to }] : [{ k: 'cat', l: 'دسته‌بندی', t: 'select', o: S.cats[type], v: t.cat }]),
    { k: 'note', l: 'توضیح', t: 'area', v: t.note }
  ], o => {
    if (o.type !== type) { Object.assign(t, o); go(o.type); return false; }
    if (o.type === 'transfer' && o.to === o.acc) { alert('حساب مبدأ و مقصد یکی است'); return false; }
    if (isNew) S.tx.push({ id: uid(), ...o }); else Object.assign(t, o);
  }, isNew ? null : () => { S.tx = S.tx.filter(x => x !== t); });
  go(t.type);
}
function monthNav() {
  return `<div class="mnav"><button onclick="mv(-1)">›</button><b>${JM[cur.m - 1]} ${cur.y.toString().replace(/\d/g, c => '۰۱۲۳۴۵۶۷۸۹'[c])}</b><button onclick="mv(1)">‹</button></div>`;
}
window.mv = n => { const t = cur.m - 1 + n; cur = { y: cur.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 + 1, d: 1 }; render(); };
// ---------- صفحه‌ها ----------
function vHome() {
  const mt = monthTx(), inc = sum(mt, 'income'), exp = sum(mt, 'expense');
  const total = S.accounts.reduce((s, a) => s + balance(a.id), 0);
  const byCat = {};
  mt.filter(t => t.type === 'expense').forEach(t => byCat[t.cat] = (byCat[t.cat] || 0) + t.amount);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const up = dues().filter(d => diffDays(d.due, today()) <= 30).slice(0, 8);
  // ۶ ماه اخیر
  const months = [];
  for (let i = 5; i >= 0; i--) { const t = cur.m - 1 - i; months.push({ y: cur.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 + 1 }); }
  const data = months.map(x => { const a = monthTx(x.y, x.m); return { m: x.m, i: sum(a, 'income'), e: sum(a, 'expense') }; });
  const mx = Math.max(1, ...data.flatMap(d => [d.i, d.e]));
  const budg = Object.entries(S.budgets).filter(([, v]) => v > 0);
  return monthNav() + `
  <div class="grid"><div class="card"><h3>درآمد</h3><div class="big inc">${fa(inc)}</div></div>
  <div class="card"><h3>هزینه</h3><div class="big exp">${fa(exp)}</div></div>
  <div class="card"><h3>مانده ماه</h3><div class="big ${inc - exp < 0 ? 'exp' : 'inc'}">${fa(inc - exp)}</div></div>
  <div class="card"><h3>موجودی کل حساب‌ها</h3><div class="big">${fa(total)}</div></div></div>
  <div class="card"><h3>موعدهای نزدیک (۳۰ روز + عقب‌افتاده)</h3>${up.length ? up.map(d => `<div class="row" onclick="go('${d.tab}')"><div>${d.kind}: ${esc(d.title)}<div class="mut">${fd(d.due)}</div></div><div style="text-align:left"><b class="${d.inc ? 'inc' : 'exp'}">${fa(d.amount)}</b><div>${dueTag(d.due)}</div></div></div>`).join('') : '<div class="empty">موعدی در پیش نیست 🎉</div>'}</div>
  ${budg.length ? `<div class="card"><h3>بودجه ماه</h3>${budg.map(([c, v]) => { const s = byCat[c] || 0, p = Math.min(100, s / v * 100); return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><span>${esc(c)}</span><span class="mut">${fa(s)} از ${fa(v)}</span></div><div class="bar ${s > v ? 'over' : ''}"><i style="width:${p}%"></i></div></div>`; }).join('')}</div>` : ''}
  <div class="card"><h3>هزینه به تفکیک دسته</h3>${cats.length ? cats.map(([c, v]) => `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between"><span>${esc(c)}</span><span class="mut">${fa(v)} (${fa(v / exp * 100)}٪)</span></div><div class="bar"><i style="width:${v / cats[0][1] * 100}%"></i></div></div>`).join('') : '<div class="empty">هزینه‌ای ثبت نشده</div>'}</div>
  <div class="card"><h3>روند ۶ ماه (سبز درآمد، قرمز هزینه)</h3><div class="chart">${data.map(d => `<div><span style="height:${d.i / mx * 85}px;background:var(--inc)"></span><span style="height:${d.e / mx * 85}px;background:var(--exp)"></span><br>${JM[d.m - 1]}</div>`).join('')}</div></div>`;
}
function vTx() {
  let mt = monthTx().sort((a, b) => b.date.localeCompare(a.date));
  if (txf !== 'all') mt = mt.filter(t => t.type === txf);
  const fl = [['all', 'همه'], ['expense', 'هزینه'], ['income', 'درآمد'], ['transfer', 'انتقال']];
  let last = '';
  return monthNav() + `<div class="seg">${fl.map(([k, l]) => `<button class="btn ${txf === k ? 'on' : ''}" onclick="txf='${k}';render()">${l}</button>`).join('')}</div>
  <div class="card">${mt.length ? mt.map(t => {
    const h = t.date !== last ? `<div class="mut" style="padding-top:8px">${fd(t.date)}</div>` : ''; last = t.date;
    const c = t.type === 'income' ? 'inc' : t.type === 'expense' ? 'exp' : '';
    return h + `<div class="row" onclick="editTx('${t.id}')"><div>${t.type === 'transfer' ? `انتقال: ${esc(accName(t.acc))} ← ${esc(accName(t.to))}` : esc(t.cat)}<div class="mut">${esc(accName(t.acc))}${t.note ? ' · ' + esc(t.note) : ''}</div></div><b class="${c}">${t.type === 'expense' ? '−' : t.type === 'income' ? '+' : ''}${fa(t.amount)}</b></div>`;
  }).join('') : '<div class="empty">تراکنشی در این ماه نیست</div>'}</div><button class="fab" onclick="txForm()">+</button>`;
}
window.editTx = id => txForm(S.tx.find(t => t.id === id));
function loanForm(l) {
  const isNew = !l;
  l = l || { first: today(), count: 12, every: 1, acc: S.accounts[0]?.id, paid: {} };
  form(isNew ? 'قسط / وام جدید' : 'ویرایش وام', [
    { k: 'title', l: 'عنوان (مثلاً وام خودرو، قسط یخچال)', v: l.title, req: 1 },
    { k: 'amount', l: 'مبلغ هر قسط (تومان)', t: 'num', v: l.amount },
    { k: 'count', l: 'تعداد کل اقساط', t: 'num', v: l.count },
    { k: 'first', l: 'تاریخ سررسید قسط اول', t: 'date', v: fd(l.first) },
    { k: 'every', l: 'فاصله اقساط (ماه)', t: 'num', v: l.every || 1 },
    { k: 'acc', l: 'پرداخت از حساب', t: 'select', o: accOpts(), v: l.acc },
    { k: 'note', l: 'توضیح (بانک، شماره قرارداد…)', v: l.note }
  ], o => {
    o.count = Math.max(1, Math.round(o.count)); o.every = Math.max(1, Math.round(o.every));
    if (isNew) S.loans.push({ id: uid(), paid: {}, ...o }); else Object.assign(l, o);
  }, isNew ? null : () => { S.tx = S.tx.filter(t => t.ref?.loan !== l.id); S.loans = S.loans.filter(x => x !== l); openLoan = null; });
}
window.payInst = (lid, i) => {
  const l = S.loans.find(x => x.id === lid);
  if (l.paid[i]) { if (!confirm('پرداخت این قسط لغو شود؟')) return; S.tx = S.tx.filter(t => !(t.ref?.loan === lid && t.ref.i === i)); delete l.paid[i]; }
  else {
    form(`پرداخت قسط ${fa(i + 1)} ${esc(l.title)}`, [
      { k: 'date', l: 'تاریخ پرداخت', t: 'date', v: fd(today()) },
      { k: 'amount', l: 'مبلغ پرداختی', t: 'num', v: l.amount },
      { k: 'acc', l: 'از حساب', t: 'select', o: accOpts(), v: l.acc }
    ], o => { const id = uid(); S.tx.push({ id, type: 'expense', amount: o.amount, date: o.date, acc: o.acc, cat: 'قسط و بدهی', note: `${l.title} - قسط ${i + 1}`, ref: { loan: lid, i } }); l.paid[i] = id; });
    return;
  }
  save(); render();
};
function vLoans() {
  if (openLoan) {
    const l = S.loans.find(x => x.id === openLoan);
    if (!l) { openLoan = null; return vLoans(); }
    const ins = loanInst(l), np = ins.filter(x => x.paid).length;
    return `<div class="mnav"><button onclick="openLoan=null;render()">› بازگشت</button><button onclick="editLoan('${l.id}')">ویرایش</button></div>
    <div class="card"><div class="big">${esc(l.title)}</div><div class="mut">${fa(l.amount)} × ${fa(l.count)} = ${fa(l.amount * l.count)} تومان</div>
    <div class="bar"><i style="width:${np / l.count * 100}%"></i></div><div class="mut">${fa(np)} از ${fa(l.count)} پرداخت شده · مانده: ${fa((l.count - np) * l.amount)}</div></div>
    <div class="card">${ins.map(x => `<div class="row"><div>قسط ${fa(x.i + 1)}<div class="mut">${fd(x.due)}</div></div><div>${x.paid ? '<span class="tag ok">پرداخت شد</span>' : dueTag(x.due)} <button class="btn" onclick="payInst('${l.id}',${x.i})">${x.paid ? 'لغو' : 'پرداخت'}</button></div></div>`).join('')}</div>`;
  }
  const tot = S.loans.reduce((s, l) => s + (l.count - Object.keys(l.paid).length) * l.amount, 0);
  const mo = S.loans.reduce((s, l) => s + (Object.keys(l.paid).length < l.count ? l.amount / (l.every || 1) : 0), 0);
  return `<div class="grid"><div class="card"><h3>کل بدهی باقی‌مانده</h3><div class="big exp">${fa(tot)}</div></div><div class="card"><h3>قسط ماهانه (تقریبی)</h3><div class="big">${fa(mo)}</div></div></div>
  <div class="card">${S.loans.length ? S.loans.map(l => {
    const np = Object.keys(l.paid).length, nx = loanInst(l).find(x => !x.paid);
    return `<div class="row" onclick="openLoan='${l.id}';render()"><div>${esc(l.title)}<div class="mut">${fa(np)}/${fa(l.count)} · ${fa(l.amount)} تومان</div></div><div style="text-align:left">${nx ? `<div class="mut">${fd(nx.due)}</div>${dueTag(nx.due)}` : '<span class="tag ok">تسویه</span>'}</div></div>`;
  }).join('') : '<div class="empty">هنوز قسطی ثبت نشده</div>'}</div><button class="fab" onclick="loanForm()">+</button>`;
}
window.editLoan = id => loanForm(S.loans.find(l => l.id === id));
function chequeForm(c) {
  const isNew = !c;
  c = c || { dir: chq, due: today(), acc: S.accounts[0]?.id, status: 'pending' };
  form(isNew ? 'چک جدید' : 'ویرایش چک', [
    { k: 'dir', l: 'نوع', t: 'select', o: [['issued', 'صادره (پرداختنی)'], ['received', 'دریافتی']], v: c.dir },
    { k: 'party', l: 'طرف حساب', v: c.party, req: 1 },
    { k: 'amount', l: 'مبلغ (تومان)', t: 'num', v: c.amount },
    { k: 'due', l: 'تاریخ سررسید', t: 'date', v: fd(c.due) },
    { k: 'time', l: 'ساعت پاس شدن', t: 'time', v: faN(c.time || '07:00') },
    { k: 'rv', l: 'یادآوری چه مدت قبل از پاس شدن؟', t: 'num', v: c.rv ?? 24, box: 'تنظیم یادآوری' },
    { k: 'ru', l: 'واحد', t: 'select', o: [['m', 'دقیقه قبل'], ['h', 'ساعت قبل'], ['d', 'روز قبل']], v: c.ru || 'h', box: ' ' },
    { k: 'num', l: 'شماره چک / صیاد', v: c.num },
    { k: 'bank', l: 'بانک', v: c.bank },
    { k: 'acc', l: 'حساب مرتبط', t: 'select', o: accOpts(), v: c.acc },
    { k: 'note', l: 'توضیح', t: 'area', v: c.note }
  ], o => { o.time = en(o.time); if (isNew) S.cheques.push({ id: uid(), status: 'pending', ...o }); else { if (c.status === 'cleared') { alert('ابتدا وصول چک را لغو کنید'); return false; } Object.assign(c, o); } },
  isNew ? null : () => { S.tx = S.tx.filter(t => t.ref?.cheque !== c.id); S.cheques = S.cheques.filter(x => x !== c); });
}
window.chStat = (id, st) => {
  const c = S.cheques.find(x => x.id === id);
  S.tx = S.tx.filter(t => t.ref?.cheque !== id);
  c.status = st;
  if (st === 'cleared') S.tx.push({ id: uid(), type: c.dir === 'issued' ? 'expense' : 'income', amount: c.amount, date: today() > c.due ? today() : c.due, acc: c.acc, cat: c.dir === 'issued' ? 'چک' : 'سایر', note: `چک ${c.party}${c.num ? ' ' + c.num : ''}`, ref: { cheque: id } });
  save(); render();
};
function vCheques() {
  const all = S.cheques.filter(c => c.dir === chq).sort((a, b) => a.due.localeCompare(b.due));
  const pend = all.filter(c => c.status === 'pending');
  const lb = { pending: ['در انتظار', 'w'], cleared: ['وصول/پاس شد', 'ok'], bounced: ['برگشتی', 'bad'] };
  return `<div class="seg"><button class="btn ${chq === 'issued' ? 'on' : ''}" onclick="chq='issued';render()">صادره (پرداختنی)</button><button class="btn ${chq === 'received' ? 'on' : ''}" onclick="chq='received';render()">دریافتی</button></div>
  <div class="card"><h3>جمع چک‌های در انتظار</h3><div class="big ${chq === 'issued' ? 'exp' : 'inc'}">${fa(pend.reduce((s, c) => s + c.amount, 0))}</div><div class="mut">${fa(pend.length)} فقره</div></div>
  <div class="card">${all.length ? all.map(c => `<div class="row" style="align-items:flex-start"><div onclick="editCheque('${c.id}')">${esc(c.party)} <span class="tag ${lb[c.status][1]}">${lb[c.status][0]}</span><div class="mut">${fd(c.due)}${c.bank ? ' · ' + esc(c.bank) : ''}${c.num ? ' · ' + esc(c.num) : ''}</div>${c.status === 'pending' ? dueTag(c.due) + `<div class="cd" data-cd="${c.id}"></div>` : ''}</div>
  <div style="text-align:left"><b>${fa(c.amount)}</b><div style="margin-top:4px">${c.status === 'pending' ? `<button class="btn" onclick="chStat('${c.id}','cleared')">${chq === 'issued' ? 'پاس شد' : 'وصول شد'}</button> <button class="btn d" onclick="chStat('${c.id}','bounced')">برگشت</button>` : `<button class="btn" onclick="chStat('${c.id}','pending')">بازگشت به انتظار</button>`}</div></div></div>`).join('') : '<div class="empty">چکی ثبت نشده</div>'}</div><button class="fab" onclick="chequeForm()">+</button>`;
}
window.editCheque = id => chequeForm(S.cheques.find(c => c.id === id));
function vMore() {
  const total = S.accounts.reduce((s, a) => s + balance(a.id), 0);
  return `<div class="card"><h3>حساب‌ها (جمع: ${fa(total)})</h3>${S.accounts.map(a => `<div class="row" onclick="accForm('${a.id}')"><span>${esc(a.name)}</span><b class="${balance(a.id) < 0 ? 'exp' : ''}">${fa(balance(a.id))}</b></div>`).join('')}<div class="acts"><button class="btn" onclick="accForm()">+ حساب جدید</button></div></div>
  <div class="card"><h3>بودجه ماهانه هر دسته</h3>${S.cats.expense.map(c => `<div class="row" onclick="budForm('${esc(c)}')"><span>${esc(c)}</span><span class="mut">${S.budgets[c] ? fa(S.budgets[c]) : 'تعیین نشده'}</span></div>`).join('')}</div>
  <div class="card"><h3>دسته‌بندی‌ها</h3><div class="acts"><button class="btn" onclick="catForm()">+ دسته جدید</button></div></div>
  <div class="card"><h3>🔄 همگام‌سازی بین دستگاه‌ها</h3><div class="mut" style="margin-bottom:8px">روی یک دستگاه «خروجی همگام‌سازی» بگیرید و روی دستگاه دیگر «دریافت و ادغام» کنید. فقط رکوردهای جدید/تغییرکرده اعمال می‌شوند و قبل از اعمال، پیش‌نمایش نشان داده می‌شود.${S.lastSync ? '<br>آخرین ادغام: ' + new Date(S.lastSync).toLocaleString('fa-IR') : ''}</div><div class="acts"><button class="btn p" onclick="syncExport()">خروجی همگام‌سازی</button><button class="btn" onclick="$('simp').click()">دریافت و ادغام</button><input id="simp" type="file" accept=".json" hidden onchange="syncImport(this.files[0]);this.value=''"></div></div>
  <div class="card"><h3>پشتیبان‌گیری</h3><div class="mut" style="margin-bottom:8px">داده‌ها فقط روی همین دستگاه ذخیره می‌شوند. برای انتقال به موبایل/کامپیوتر دیگر یا امنیت، پشتیبان بگیرید.</div><div class="acts"><button class="btn p" onclick="exportData()">دریافت فایل</button><button class="btn" onclick="$('imp').click()">بازیابی</button><input id="imp" type="file" accept=".json" hidden onchange="importData(this.files[0])"></div><div class="acts"><button class="btn" onclick="exportCsv()">خروجی اکسل (CSV)</button><button class="btn d" onclick="resetAll()">پاک کردن همه</button></div></div>`;
}
window.accForm = id => {
  const a = id ? acc(id) : { name: '', init: 0 };
  form(id ? 'ویرایش حساب' : 'حساب جدید', [{ k: 'name', l: 'نام حساب', v: a.name, req: 1 }, { k: 'init', l: 'موجودی اولیه', t: 'num', neg: 1, v: a.init }],
    o => { if (id) Object.assign(a, o); else S.accounts.push({ id: uid(), ...o }); },
    id && S.accounts.length > 1 ? () => { if (S.tx.some(t => t.acc === id || t.to === id)) { alert('این حساب تراکنش دارد و قابل حذف نیست'); return; } S.accounts = S.accounts.filter(x => x.id !== id); } : null);
};
window.budForm = c => form(`بودجه «${c}»`, [{ k: 'v', l: 'سقف ماهانه (۰ = بدون بودجه)', t: 'num', v: S.budgets[c] || 0 }], o => { S.budgets[c] = o.v; });
window.catForm = () => form('دسته جدید', [{ k: 't', l: 'نوع', t: 'select', o: [['expense', 'هزینه'], ['income', 'درآمد']] }, { k: 'n', l: 'نام', req: 1 }], o => { if (!S.cats[o.t].includes(o.n)) S.cats[o.t].push(o.n); });
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
window.exportData = () => dl(`finance-backup-${today()}.json`, JSON.stringify(S), 'application/json');
window.exportCsv = () => dl('transactions.csv', '\ufeffتاریخ,نوع,مبلغ,دسته,حساب,توضیح\n' + S.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => [fd(t.date), { income: 'درآمد', expense: 'هزینه', transfer: 'انتقال' }[t.type], t.amount, t.cat || '', accName(t.acc), t.note || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
window.importData = f => { if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.tx || !d.accounts) throw 0; if (!confirm('داده‌های فعلی با پشتیبان جایگزین می‌شود. ادامه؟')) return; S = { ...structuredClone(DEF), ...d }; snap(); save(); render(); } catch { alert('فایل نامعتبر است'); } }; r.readAsText(f); };
window.resetAll = () => { if (confirm('همه داده‌ها پاک می‌شود. مطمئنید؟') && confirm('این کار قابل بازگشت نیست. ادامه؟')) { const dv = S.dev; S = structuredClone(DEF); S.dev = dv; snap(); save(); render(); } };
// ---------- رندر ----------
const TABS = [['home', '📊', 'داشبورد'], ['tx', '💰', 'تراکنش‌ها'], ['loans', '📅', 'اقساط و وام'], ['cheques', '🧾', 'چک‌ها'], ['more', '⚙️', 'حساب‌ها و تنظیمات']];
const TCOL = { home: '#0ea5e9', tx: '#f59e0b', loans: '#8b5cf6', cheques: '#10b981', more: '#64748b' };
const TITLES = { home: 'خلاصه مالی', tx: 'درآمد و هزینه', loans: 'اقساط و وام‌ها', cheques: 'چک‌ها', more: 'حساب‌ها و تنظیمات' };
const menuOpen = () => $('nav').classList.contains('open');
window.toggleMenu = v => { const o = v ?? !menuOpen(); $('nav').classList.toggle('open', o); $('ov').classList.toggle('show', o); };
window.go = t => { tab = t; openLoan = null; toggleMenu(false); render(); scrollTo(0, 0); };
window.toggleTheme = () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('fin_theme', dark ? 'dark' : 'light');
  render();
};
document.documentElement.dataset.theme = localStorage.getItem('fin_theme') === 'dark' ? 'dark' : 'light';
function render() {
  const add = tab === 'loans' ? 'loanForm()' : tab === 'cheques' ? 'chequeForm()' : 'txForm()';
  $('top').innerHTML = `<button class="ib" onclick="toggleMenu()" aria-label="منو">☰</button><h1>${TITLES[tab]}</h1><button class="ib" onclick="${add}" aria-label="افزودن">＋</button>`;
  $('main').innerHTML = { home: vHome, tx: vTx, loans: vLoans, cheques: vCheques, more: vMore }[tab]();
  const total = S.accounts.reduce((s, a) => s + balance(a.id), 0);
  $('nav').innerHTML = `<div class="side-h"><div class="logo">₮</div><div><b>حسابداری شخصی</b><div class="mut">موجودی کل: ${fa(total)} تومان</div></div></div>
  <div class="side-l">${TABS.map(([k, i, l]) => `<button class="${tab === k ? 'on' : ''}" onclick="go('${k}')"><span style="--ic:${TCOL[k]}">${i}</span>${l}</button>`).join('')}</div>
  <button class="theme" onclick="toggleTheme()">${document.documentElement.dataset.theme === 'dark' ? '☀️ حالت روز' : '🌙 حالت شب'}</button>
  ${'Notification' in window && Notification.permission !== 'granted' ? '<button class="theme" onclick="askNotif()">🔔 فعال‌سازی اعلان دسکتاپ/موبایل</button>' : ''}
  <div class="side-f">داده‌ها روی همین دستگاه ذخیره می‌شوند</div>`;
}
// ---------- اعلان چک (۲۴ ساعت قبل از سررسید) ----------
const ringSound = () => {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [660, 0.35]].forEach(([f, t]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ac.currentTime + t);
      g.gain.linearRampToValueAtTime(0.18, ac.currentTime + t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 1.2);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 1.3);
    });
  } catch {}
};
function toast(title, body) {
  const box = $('toasts') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'toasts' });
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="ti">🔔</div><div style="flex:1"><b>${esc(title)}</b><small>${esc(body)}</small></div><button class="x" aria-label="بستن">×</button>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 350); };
  el.querySelector('.x').onclick = close;
  box.appendChild(el);
  setTimeout(close, 12000);
}
// زمان دقیق پاس شدن (ساعت محلی دستگاه) و زمان یادآوری
const dueAt = c => { const [y, mo, d] = c.due.split('-').map(Number), [h, mi] = (c.time || '07:00').split(':').map(Number); return new Date(y, mo - 1, d, h, mi, 0).getTime(); };
const remAt = c => dueAt(c) - (+(c.rv ?? 24)) * ({ m: 6e4, h: 36e5, d: 864e5 }[c.ru || 'h']);
const dur = ms => { const t = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return faN((d ? d + ' روز و ' : '') + [h, m, x].map(n => String(n).padStart(2, '0')).join(':')); };
function checkCheques() {
  const now = Date.now(), seen = JSON.parse(localStorage.getItem('fin_alerted') || '[]');
  let ch = false;
  S.cheques.filter(c => c.status === 'pending').forEach(c => {
    const k = c.id + '@' + remAt(c), due = dueAt(c);
    if (seen.includes(k) || now < remAt(c) || now > due) return;
    seen.push(k); ch = true;
    const msg = `چک ${c.party} به مبلغ ${fa(c.amount)} تومان در ${fd(c.due)} ساعت ${faN(c.time || '07:00')} پاس می‌شود (${dur(due - now)} مانده)`;
    ringSound(); toast('یادآوری چک', msg);
    if ('Notification' in window && Notification.permission === 'granted') new Notification('یادآوری چک', { body: msg, icon: 'icon.svg' });
  });
  if (ch) localStorage.setItem('fin_alerted', JSON.stringify(seen.slice(-200)));
}
// هر ثانیه: بررسی آلارم + شمارش معکوس روی لیست چک‌ها
setInterval(() => {
  checkCheques();
  document.querySelectorAll('[data-cd]').forEach(el => {
    const c = S.cheques.find(x => x.id === el.dataset.cd); if (!c) return;
    const now = Date.now(), r = remAt(c) - now, d = dueAt(c) - now;
    el.innerHTML = d <= 0 ? '⏱ زمان پاس شدن رسید' : `⏱ تا پاس شدن: <b>${dur(d)}</b>${r > 0 ? ` · 🔔 آلارم: <b>${dur(r)}</b>` : ''}`;
  });
}, 1000);
window.askNotif = () => Notification.requestPermission().then(() => render());

// ---------- همگام‌سازی فایل‌محور ----------
const CN = { accounts: 'حساب', tx: 'تراکنش', loans: 'قسط/وام', cheques: 'چک' };
const sig = (c, r) => c === 'accounts' ? r.name.trim()
  : c === 'tx' ? (r.ref ? 'ref|' + (r.ref.cheque || r.ref.loan + '#' + r.ref.i) : [r.type, r.date, r.amount, r.acc, r.to, r.cat].join('|'))
  : c === 'loans' ? [r.title.trim(), r.amount, r.first].join('|')
  : r.num ? 'n|' + String(r.num).trim() : [r.kind, (r.party || '').trim(), r.amount, r.due].join('|');
const recLabel = (c, r) => c === 'accounts' ? r.name : c === 'tx' ? `${r.type === 'income' ? 'درآمد' : r.type === 'expense' ? 'هزینه' : 'انتقال'} ${fa(r.amount)} · ${fd(r.date)} · ${r.cat || ''} ${r.note ? '· ' + r.note : ''}`
  : c === 'loans' ? `${r.title} · ${fa(r.amount)} × ${fa(r.count)}` : `${r.party || ''} · ${fa(r.amount)} · ${fd(r.due)}${r.num ? ' · ' + r.num : ''}`;
// تغییر شناسه یک رکورد و همه ارجاع‌ها به آن
function rename(D, c, from, to) {
  const arr = D[c], r = arr.find(x => x.id === from); if (!r) return;
  if (arr.some(x => x.id === to)) D[c] = arr.filter(x => x !== r); else r.id = to;
  const m = v => v === from ? to : v;
  if (c === 'accounts') { D.tx.forEach(t => { t.acc = m(t.acc); t.to = m(t.to); }); D.loans.forEach(l => l.acc = m(l.acc)); D.cheques.forEach(q => q.acc = m(q.acc)); }
  if (c === 'loans') D.tx.forEach(t => { if (t.ref?.loan === from) t.ref.loan = to; });
  if (c === 'cheques') D.tx.forEach(t => { if (t.ref?.cheque === from) t.ref.cheque = to; });
}
function applyAlias(D, al) { Object.entries(al || {}).forEach(([k, to]) => { const [c, from] = k.split(':'); if (D[c]) rename(D, c, from, to); }); }
window.syncExport = () => { stamp(); save(); dl(`finance-sync-${today()}.json`, JSON.stringify({ app: 'fin-sync', v: 1, dev: S.dev, at: Date.now(), data: S }), 'application/json'); toast('فایل همگام‌سازی آماده شد؛ آن را روی دستگاه دیگر «دریافت و ادغام» کنید.'); };
let PLAN = null;
window.syncImport = f => { if (!f) return; const r = new FileReader(); r.onload = () => {
  let I; try { const j = JSON.parse(r.result); I = j.app === 'fin-sync' ? j.data : j; if (!I.tx || !I.accounts) throw 0; } catch { return alert('فایل نامعتبر است'); }
  I = { ...structuredClone(DEF), ...structuredClone(I) }; I.del ||= {}; I.mt ||= {};
  if (I.dev && I.dev === S.dev) return alert('این فایل از همین دستگاه است.');
  stamp();
  const L = structuredClone(S); L.del ||= {}; L.alias ||= {};
  applyAlias(L, I.alias); applyAlias(I, L.alias);   // شناسه‌های یکسان‌شده قبلی
  const P = { add: [], upd: [], del: [], dup: [], same: 0 };
  COLS.forEach(c => {
    const loc = new Map(L[c].map(x => [x.id, x]));
    I[c].forEach(x => {
      const k = c + ':' + x.id, l = loc.get(x.id);
      if (L.del[k] && L.del[k] >= (x.u || 0)) return;            // اینجا بعداً حذف شده
      if (l) { if (recKey(l) === recKey(x)) P.same++; else if ((x.u || 0) > (l.u || 0)) P.upd.push({ c, x, l }); return; }
      const d = L[c].find(y => !I[c].some(z => z.id === y.id) && sig(c, y) === sig(c, x));
      if (d) P.dup.push({ c, x, l: d, auto: c === 'tx' && !!x.ref || c === 'accounts' }); else P.add.push({ c, x });
    });
  });
  Object.entries(I.del).forEach(([k, t]) => { const [c, id] = k.split(':'); const l = L[c]?.find(x => x.id === id); if (l && (l.u || 0) < t) P.del.push({ c, l, k, t }); });
  PLAN = { L, I, P }; showPlan();
}; r.readAsText(f); };
function showPlan() {
  const { P } = PLAN, m = $('modal'); m.hidden = false;
  const sec = (t, a, fn) => a.length ? `<h3 style="margin:12px 0 6px">${t} (${fa(a.length)})</h3>` + a.map(fn).join('') : '';
  const manual = P.dup.filter(d => !d.auto);
  m.innerHTML = `<div class="sheet"><h2>پیش‌نمایش ادغام</h2>
  <div class="mut">بدون تغییر: ${fa(P.same)} · جدید: ${fa(P.add.length)} · به‌روزرسانی: ${fa(P.upd.length)} · حذف: ${fa(P.del.length)} · مشکوک به تکرار: ${fa(manual.length)}</div>
  ${!P.add.length && !P.upd.length && !P.del.length && !P.dup.length ? '<div class="empty">دو دستگاه کاملاً هماهنگ هستند ✅</div>' : ''}
  ${sec('➕ رکوردهای جدید', P.add, a => `<div class="row"><span>${CN[a.c]}: ${esc(recLabel(a.c, a.x))}</span></div>`)}
  ${sec('✏️ به‌روزرسانی (نسخه دستگاه دیگر جدیدتر است)', P.upd, a => `<div class="row" style="display:block"><div>${CN[a.c]}: ${esc(recLabel(a.c, a.x))}</div><div class="mut">قبلی: ${esc(recLabel(a.c, a.l))}</div></div>`)}
  ${sec('🗑 حذف (روی دستگاه دیگر حذف شده)', P.del, a => `<div class="row"><span class="exp">${CN[a.c]}: ${esc(recLabel(a.c, a.l))}</span></div>`)}
  ${sec('⚠️ احتمال تکرار — تصمیم بگیرید', manual, a => { const i = P.dup.indexOf(a); return `<div class="row" style="display:block"><div>${CN[a.c]} ورودی: ${esc(recLabel(a.c, a.x))}</div><div class="mut">موجود: ${esc(recLabel(a.c, a.l))}</div><select data-dup="${i}"><option value="same">یکی هستند (ادغام، نسخه جدیدتر بماند)</option><option value="both">متفاوت‌اند (هر دو بماند)</option><option value="skip">رکورد ورودی را نادیده بگیر</option></select></div>`; })}
  <div class="acts"><button class="btn p" onclick="applyPlan()">تأیید و اعمال</button><button class="btn" onclick="PLAN=null;$('modal').hidden=true">انصراف</button></div></div>`;
}
window.applyPlan = () => {
  const { L, I, P } = PLAN, now = Date.now();
  document.querySelectorAll('[data-dup]').forEach(s => P.dup[s.dataset.dup].act = s.value);
  // ۱) تکراری‌ها: هر دو به شناسه کوچک‌تر یکسان می‌شوند تا دستگاه دیگر هم بفهمد
  P.dup.forEach(d => { const a = d.auto ? 'same' : d.act;
    if (a === 'both') P.add.push({ c: d.c, x: d.x });
    if (a !== 'same') return;
    const id = d.x.id < d.l.id ? d.x.id : d.l.id;
    if (d.l.id !== id) { L.alias[d.c + ':' + d.l.id] = id; rename(L, d.c, d.l.id, id); }
    if (d.x.id !== id) { L.alias[d.c + ':' + d.x.id] = id; rename(I, d.c, d.x.id, id); }
    const l = L[d.c].find(y => y.id === id); if ((d.x.u || 0) > (l.u || 0)) Object.assign(l, d.x, { id }); });
  // ۲) جدید و به‌روزرسانی
  P.add.forEach(a => L[a.c].push(structuredClone(a.x)));
  P.upd.forEach(a => { const l = L[a.c].find(y => y.id === a.x.id); if (l) { Object.keys(l).forEach(k => delete l[k]); Object.assign(l, structuredClone(a.x)); } });
  // ۳) حذف‌ها
  P.del.forEach(a => { L[a.c] = L[a.c].filter(x => x !== a.l); });
  Object.entries(I.del).forEach(([k, t]) => { if (!L.del[k] || L.del[k] < t) L.del[k] = t; });
  Object.assign(L.alias, I.alias || {});
  // ۴) دسته‌ها (اجتماع) و بودجه (جدیدترین)
  ['expense', 'income'].forEach(t => (I.cats[t] || []).forEach(n => { if (!L.cats[t].includes(n)) L.cats[t].push(n); }));
  if ((I.mt.budgets || 0) > (L.mt?.budgets || 0)) { L.budgets = I.budgets; L.mt = { ...L.mt, budgets: I.mt.budgets }; }
  L.lastSync = now; S = L; snap(); save(); PLAN = null; $('modal').hidden = true; render(); toast('ادغام با موفقیت انجام شد ✅');
};

loadState().finally(() => {
  checkCheques();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
});
