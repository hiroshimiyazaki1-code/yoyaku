/* 予約画面：URLの ?id=w-xxxxxx（予約）または ?m=w-<管理用キー>&do=change|cancel（変更・キャンセル）で動く */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var linkId = params.get('id') || '';
  var manage = params.get('m') || '';
  var doWhat = params.get('do') || '';
  var DEMO = params.get('demo') === '1'; // 公開前の見た目確認用（実際の予約は行わない）
  var code = (linkId || manage).split('-')[0];
  var token = manage ? manage.slice(manage.indexOf('-') + 1) : '';
  var base = (window.YOYAKU_CONFIG && window.YOYAKU_CONFIG.backends || {})[code];

  var $info = document.getElementById('info');
  var $main = document.getElementById('main');
  var WD = '日月火水木金土';
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmtT = function (m) { return Math.floor(m / 60) + ':' + pad(m % 60); };
  var dow = function (k) { var p = k.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); };
  var fmtD = function (k) { var p = k.split('-').map(Number); return p[1] + '月' + p[2] + '日（' + WD.charAt(dow(k)) + '）'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var monthKey = function (y, m) { return y + '-' + pad(m + 1); };

  var ICON = {
    clock: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.3"/><path d="M8 4.5V8l2.4 1.6"/></svg>',
    video: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="4" width="9" height="8" rx="2"/><path d="M10.5 7l4-2.2v6.4l-4-2.2"/></svg>',
    user: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="5.5" r="2.8"/><path d="M2.5 14c.8-2.7 3-4 5.5-4s4.7 1.3 5.5 4"/></svg>',
    globe: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.3"/><path d="M1.8 8h12.4M8 1.7c2 2 2 10.6 0 12.6M8 1.7c-2 2-2 10.6 0 12.6"/></svg>',
    check: '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 13.5l4.5 4.5L20 8.5"/></svg>',
    left: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 2.5L4.5 7 9 11.5"/></svg>',
    right: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 2.5L9.5 7 5 11.5"/></svg>'
  };

  var st = {
    mode: manage ? 'manage' : 'book', info: null, booking: null,
    step: 1, y: 0, m: 0, monthDays: {}, loadingMonth: false,
    date: null, slot: null, error: '', busy: false, done: null, confirmCancel: doWhat === 'cancel'
  };

  /* ---------- 通信 ---------- */
  function apiGet(q) {
    if (DEMO) return demoApi(q);
    var url = base + '?' + new URLSearchParams(q).toString();
    return fetch(url).then(function (r) { return r.json(); }).then(check);
  }
  function apiPost(body) {
    if (DEMO) return demoApi(body);
    return fetch(base, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(check);
  }
  function check(res) { if (!res.ok) throw new Error(res.error || 'エラーが発生しました'); return res; }
  function netErr(e) {
    return e instanceof TypeError ? '通信できませんでした。電波の良い場所で、もう一度お試しください。' : e.message;
  }

  /* ---------- 左側（面談の情報） ---------- */
  function renderInfo() {
    var i = st.info;
    $info.innerHTML =
      '<div class="org">' + esc(i.company) + '</div>' +
      '<h1>' + esc(i.menu) + '</h1>' +
      '<ul class="meta">' +
      '<li>' + ICON.clock + '<span><strong class="num">' + i.dur + '分</strong></span></li>' +
      '<li>' + ICON.video + '<span><strong>Zoom</strong><br>URLは予約確定後にお送りします</span></li>' +
      '<li>' + ICON.user + '<span>担当：<strong>宮崎 洋</strong></span></li>' +
      '<li>' + ICON.globe + '<span>日本時間（GMT+9）</span></li></ul>' +
      (i.intro ? '<p>' + esc(i.intro) + '</p>' : '');
    document.title = i.menu + 'のご予約｜' + i.company;
  }

  /* ---------- 日時選択 ---------- */
  function loadMonth() {
    var mk = monthKey(st.y, st.m);
    if (st.monthDays[mk]) { pickFirstDate(); render(); return; }
    st.loadingMonth = true; render();
    var q = { action: 'slots', month: mk };
    if (st.mode === 'manage') q.token = token; else q.id = linkId;
    apiGet(q).then(function (res) {
      st.monthDays[mk] = res.days || {};
      st.loadingMonth = false;
      pickFirstDate();
      // この月に空きが無ければ、予約できる範囲で次の月へ
      if (!st.date && monthKey(st.y, st.m) < st.info.lastDay.slice(0, 7)) { nextMonth(); return; }
      render();
    }).catch(function (e) { st.loadingMonth = false; st.error = netErr(e); render(); });
  }
  function pickFirstDate() {
    var days = st.monthDays[monthKey(st.y, st.m)] || {};
    if (st.date && days[st.date] && days[st.date].length) return;
    st.date = null; st.slot = null;
    Object.keys(days).sort().some(function (k) { if (days[k].length) { st.date = k; return true; } return false; });
  }
  function nextMonth() { st.m++; if (st.m > 11) { st.m = 0; st.y++; } st.date = null; st.slot = null; loadMonth(); }
  function prevMonth() { st.m--; if (st.m < 0) { st.m = 11; st.y--; } st.date = null; st.slot = null; loadMonth(); }

  function renderStep1(title, nextLabel) {
    var mk = monthKey(st.y, st.m), days = st.monthDays[mk] || {};
    var first = new Date(st.y, st.m, 1).getDay(), count = new Date(st.y, st.m + 1, 0).getDate();
    var cells = WD.split('').map(function (w, i) { return '<div class="cal-wd' + (i === 0 ? ' sun' : '') + '">' + w + '</div>'; }).join('');
    for (var i = 0; i < first; i++) cells += '<div></div>';
    for (var d = 1; d <= count; d++) {
      var k = mk + '-' + pad(d), n = (days[k] || []).length, sel = k === st.date;
      cells += '<button class="day' + (n ? ' avail' : '') + (sel ? ' sel' : '') + '" data-act="date" data-k="' + k + '"' + (n ? '' : ' disabled') +
        ' aria-label="' + (st.m + 1) + '月' + d + '日' + (n ? '、空きあり' : '、空きなし') + '"' + (sel ? ' aria-current="date"' : '') + '>' + d + '</button>';
    }
    var list;
    if (st.loadingMonth) list = '<div class="empty">空き状況を確認しています…</div>';
    else if (!st.date) list = '<div class="empty">この月は空きがありません</div>';
    else list = (days[st.date] || []).map(function (s) { return '<button class="slot" data-act="slot" data-s="' + s + '" aria-pressed="' + (s === st.slot) + '">' + fmtT(s) + '</button>'; }).join('');
    var minMk = st.info.today.slice(0, 7), maxMk = st.info.lastDay.slice(0, 7);
    return (st.error ? '<div class="alert">' + esc(st.error) + '</div>' : '') +
      '<div class="step-label">' + (st.mode === 'manage' ? '日時の変更' : 'STEP 1 / 2') + '</div><h2>' + title + '</h2>' +
      '<div class="step1"><div>' +
      '<div class="month-head"><button class="icon-btn" data-act="prev"' + (mk <= minMk ? ' disabled' : '') + ' aria-label="前の月">' + ICON.left + '</button>' +
      '<h3 class="num">' + st.y + '年' + (st.m + 1) + '月</h3>' +
      '<button class="icon-btn" data-act="next"' + (mk >= maxMk ? ' disabled' : '') + ' aria-label="次の月">' + ICON.right + '</button></div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<p class="tz">色の付いた日に空きがあります。</p></div>' +
      '<div class="slots-col"><h3>' + (st.date ? fmtD(st.date) : '') + '</h3><div class="slots">' + list + '</div>' +
      '<button class="btn primary" data-act="toNext"' + (st.slot == null || st.busy ? ' disabled' : '') + '>' + nextLabel + '</button></div></div>';
  }

  /* ---------- 入力 ---------- */
  function renderStep2() {
    var isW = code === 'w', isP = code === 'p';
    return '<button class="link-btn" data-act="back">← 日時を選び直す</button>' +
      '<div class="picked"><span>' + fmtD(st.date) + '</span><span class="num">' + fmtT(st.slot) + '〜' + fmtT(st.slot + st.info.dur) + '</span><span>（' + st.info.dur + '分・Zoom）</span></div>' +
      '<div class="step-label">STEP 2 / 2</div><h2>お名前と連絡先を入力してください</h2>' +
      (st.error ? '<div class="alert">' + esc(st.error) + '</div>' : '') +
      '<form class="bk" id="bk" novalidate>' +
      '<div class="field"><label for="fName">お名前<span class="req">必須</span></label><input id="fName" name="name" autocomplete="name" required placeholder="例：山田 太郎"></div>' +
      '<div class="field"><label for="fMail">メールアドレス<span class="req">必須</span></label><input id="fMail" name="mail" type="email" autocomplete="email" required placeholder="例：taro@example.com"></div>' +
      (isP ? '' : '<div class="field"><label for="fTel">電話番号<span class="opt">任意</span></label><input id="fTel" name="tel" type="tel" autocomplete="tel" placeholder="例：090-0000-0000"></div>') +
      (isW ? '<div class="field"><label for="fJob">現在のお仕事・ご希望の職種<span class="opt">任意</span></label><input id="fJob" name="job" placeholder="例：Webマーケティング／事業会社への転職を検討中"></div>' : '') +
      '<div class="field"><label for="fMemo">ご相談したいこと<span class="opt">任意</span></label><textarea id="fMemo" name="memo" placeholder="事前に共有しておきたいことがあればご記入ください"></textarea></div>' +
      '<div class="hp" aria-hidden="true"><label for="fWeb">空欄のままにしてください</label><input id="fWeb" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<div><button class="btn primary" type="submit"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? '送信しています…' : '予約を確定する') + '</button></div>' +
      '<p class="note">ご入力いただいた情報は、この面談のご連絡にのみ使用します。</p></form>';
  }

  /* ---------- 完了 ---------- */
  function renderDone() {
    var d = st.done;
    return '<div class="done"><div class="done-mark">' + ICON.check + '</div><h2>' + esc(d.title) + '</h2>' +
      '<dl class="dl"><dt>日時</dt><dd class="num">' + fmtD(d.date) + ' ' + fmtT(d.start) + '〜' + fmtT(d.end) + '</dd>' +
      '<dt>内容</dt><dd>' + esc(st.info.menu) + '（' + st.info.dur + '分）</dd>' +
      (d.zoomUrl ? '<dt>Zoom</dt><dd class="url">' + esc(d.zoomUrl) + '</dd>' : '') +
      '<dt>担当</dt><dd>宮崎 洋（' + esc(st.info.company) + '）</dd></dl>' +
      '<p class="note">' + esc(d.note) + '</p></div>';
  }

  /* ---------- 予約の確認（変更・キャンセル） ---------- */
  function renderManage() {
    var b = st.booking;
    if (b.status !== '確定') return '<h2>このご予約はキャンセル済みです</h2>';
    var acts = !b.canChange ? '<p class="note">開始時刻を過ぎたため、変更・キャンセルはできません。</p>' :
      st.confirmCancel
        ? '<div class="alert">このご予約をキャンセルしますか？</div><div class="row"><button class="btn danger" data-act="doCancel"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? '処理しています…' : 'キャンセルする') + '</button><button class="btn" data-act="noCancel">やめる</button></div>'
        : '<div class="row"><button class="btn primary" data-act="change">日時を変更する</button><button class="btn" data-act="askCancel">キャンセルする</button></div>';
    return (st.error ? '<div class="alert">' + esc(st.error) + '</div>' : '') +
      '<h2>ご予約の内容</h2><dl class="dl" style="margin-bottom:20px"><dt>日時</dt><dd class="num">' + fmtD(b.date) + ' ' + fmtT(b.start) + '〜' + fmtT(b.end) + '</dd>' +
      '<dt>内容</dt><dd>' + esc(b.menu) + '（' + b.dur + '分）</dd>' +
      (b.zoomUrl ? '<dt>Zoom</dt><dd class="url">' + esc(b.zoomUrl) + '</dd>' : '') + '</dl>' + acts;
  }

  /* ---------- 描画 ---------- */
  function render() {
    if (st.done) { $main.innerHTML = renderDone(); return; }
    if (st.mode === 'manage' && st.step === 0) { $main.innerHTML = renderManage(); return; }
    if (st.step === 1) $main.innerHTML = renderStep1(st.mode === 'manage' ? '新しい日時を選んでください' : '日時を選んでください',
      st.mode === 'manage' ? (st.busy ? '変更しています…' : 'この日時に変更する') : 'この日時で次へ');
    else $main.innerHTML = renderStep2();
  }
  function fatal(msg) {
    $info.innerHTML = '<div class="org">日程のご予約</div>';
    $main.innerHTML = '<div class="alert">' + esc(msg) + '</div>';
  }
  function startCalendar() {
    var t = st.info.today.split('-').map(Number);
    st.y = t[0]; st.m = t[1] - 1; st.step = 1;
    loadMonth();
  }

  /* ---------- 操作 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    var a = t.getAttribute('data-act');
    st.error = '';
    if (a === 'date') { st.date = t.getAttribute('data-k'); st.slot = null; render(); }
    else if (a === 'slot') { st.slot = Number(t.getAttribute('data-s')); render(); }
    else if (a === 'prev') prevMonth();
    else if (a === 'next') nextMonth();
    else if (a === 'toNext') { if (st.mode === 'manage') doReschedule(); else { st.step = 2; render(); window.scrollTo(0, 0); } }
    else if (a === 'back') { st.step = 1; render(); }
    else if (a === 'change') startCalendar();
    else if (a === 'askCancel') { st.confirmCancel = true; render(); }
    else if (a === 'noCancel') { st.confirmCancel = false; render(); }
    else if (a === 'doCancel') doCancel();
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var v = function (n) { return f.elements[n] ? f.elements[n].value.trim() : ''; };
    var keep = { name: v('name'), mail: v('mail'), tel: v('tel'), job: v('job'), memo: v('memo') };
    var restore = function () { var g = document.getElementById('bk'); if (g) Object.keys(keep).forEach(function (k) { if (g.elements[k]) g.elements[k].value = keep[k]; }); };
    if (!keep.name) { st.error = 'お名前を入力してください。'; render(); restore(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(keep.mail)) { st.error = 'メールアドレスを正しく入力してください（例：taro@example.com）。'; render(); restore(); return; }
    st.busy = true; render(); restore();
    apiPost({ action: 'book', id: linkId, date: st.date, start: st.slot, name: keep.name, mail: keep.mail,
      tel: keep.tel, job: keep.job, memo: keep.memo, website: v('website') })
      .then(function (r) {
        st.busy = false;
        st.done = { title: 'ご予約が確定しました', date: r.date, start: r.start, end: r.end, zoomUrl: r.zoomUrl,
          note: '確認メールを ' + r.mail + ' にお送りしました。日時の変更・キャンセルは、メール内のリンクから行えます。' };
        render(); window.scrollTo(0, 0);
      })
      .catch(function (err) {
        st.busy = false; st.error = netErr(err);
        if (/埋まって/.test(st.error)) { st.step = 1; st.monthDays = {}; st.slot = null; loadMonth(); return; }
        render(); restore();
      });
  });

  function doReschedule() {
    st.busy = true; render();
    apiPost({ action: 'reschedule', token: token, date: st.date, start: st.slot }).then(function (r) {
      st.busy = false;
      st.done = { title: '日時を変更しました', date: r.date, start: r.start, end: r.end, zoomUrl: r.zoomUrl, note: '変更後の内容をメールでお送りしました。ZoomのURLは変わりません。' };
      render(); window.scrollTo(0, 0);
    }).catch(function (err) {
      st.busy = false; st.error = netErr(err);
      if (/埋まって/.test(st.error)) { st.monthDays = {}; st.slot = null; loadMonth(); return; }
      render();
    });
  }
  function doCancel() {
    st.busy = true; render();
    apiPost({ action: 'cancel', token: token }).then(function (r) {
      st.busy = false;
      st.done = { title: 'キャンセルを承りました', date: r.date, start: r.start, end: r.end, zoomUrl: '', note: 'キャンセルの確認メールをお送りしました。' };
      render();
    }).catch(function (err) { st.busy = false; st.error = netErr(err); render(); });
  }

  /* ---------- 起動 ---------- */
  if (!DEMO && (!base || !/^[whp]$/.test(code))) {
    fatal('このリンクは正しくありません。お手数ですが、送り主にお問い合わせください。');
    return;
  }
  if (st.mode === 'book') {
    apiGet({ action: 'link', id: linkId }).then(function (i) { st.info = i; renderInfo(); startCalendar(); })
      .catch(function (e) { fatal(netErr(e)); });
  } else {
    apiGet({ action: 'manage', token: token }).then(function (b) {
      st.booking = b; st.info = { company: b.company, menu: b.menu, dur: b.dur, intro: '', today: b.today, lastDay: b.lastDay };
      renderInfo(); st.step = 0;
      if (doWhat === 'change' && b.canChange) startCalendar(); else render();
    }).catch(function (e) { fatal(netErr(e)); });
  }

  /* ---------- 見た目確認用のダミー（?demo=1 のときだけ。実際の予約は行わない） ---------- */
  function demoApi(q) {
    var today = new Date(); var tk = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    var last = new Date(today.getTime() + 60 * 864e5); var lk = last.getFullYear() + '-' + pad(last.getMonth() + 1) + '-' + pad(last.getDate());
    var info = { company: '株式会社ウィンスリー（見本）', menu: 'キャリア面談', dur: 60, intro: '見た目確認用の画面です。実際の予約は行われません。', today: tk, lastDay: lk };
    var wait = function (v) { return new Promise(function (res) { setTimeout(function () { res(Object.assign({ ok: true }, v)); }, 300); }); };
    if (q.action === 'link') return wait(info);
    if (q.action === 'manage') return wait({ status: '確定', date: tk, start: 780, end: 840, dur: 60, company: info.company, menu: info.menu, zoomUrl: 'https://zoom.us/j/（見本）', canChange: true, today: tk, lastDay: lk });
    if (q.action === 'slots') {
      var p = q.month.split('-').map(Number), n = new Date(p[0], p[1], 0).getDate(), days = {};
      for (var d = 1; d <= n; d++) {
        var k = q.month + '-' + pad(d), w = dow(k), list = [];
        if (k > tk && k <= lk) {
          var h = (w === 0 || w === 6) ? [420, 600] : [510, 1080];
          for (var s = h[0]; s + 60 <= h[1]; s += 30) if ((s + d * 7) % 4 !== 0) list.push(s);
        }
        days[k] = list;
      }
      return wait({ days: days });
    }
    if (q.action === 'book') return wait({ date: q.date, start: q.start, end: q.start + 60, zoomUrl: 'https://zoom.us/j/（見本）', mail: q.mail });
    if (q.action === 'reschedule') return wait({ date: q.date, start: q.start, end: q.start + 60, zoomUrl: 'https://zoom.us/j/（見本）' });
    if (q.action === 'cancel') return wait({ date: tk, start: 780, end: 840 });
    return Promise.reject(new Error('不明な操作'));
  }
})();
