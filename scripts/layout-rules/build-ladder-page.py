import json, os
d = json.load(open('/tmp/claude-0/m/ladder.json'))
# 글자 그림 좌표는 V(120) 단위라 소수 한 자리면 충분하다 — 조합이 늘어도 파일이 가볍게.
import re as _re
_r1 = lambda t: _re.sub(r'(\d+\.\d)\d+', r'\1', t)
for _c, _g in d['svgs'].items():
    _g['table'] = _r1(_g['table']); _g['steps'] = [_r1(x) for x in _g['steps']]
html = r'''<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>가설 사다리 — 노토까지</title>
<style>
:root{--ink:#1d1d1f;--mute:#6e6e73;--line:#e3e3e6;--bg:#f7f7f8;--noto:#e0522a;--tab:#2e9e5b;--step:#1f4fd8;--raw:#9a9aa2}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 20px 80px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:34px 0 8px}p.sub{color:var(--mute);margin:0 0 16px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.ladder .st{display:grid;grid-template-columns:28px 1fr 170px;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line);cursor:pointer}
.ladder .st:first-child{border-top:0}.ladder .st.base{cursor:default}.ladder .st input{width:18px;height:18px}
.ladder .st .nm{font-weight:600}.ladder .st small{display:block;color:var(--mute);font-weight:400;font-size:12px}
.ladder .st .num{text-align:right;font-size:13px;color:var(--mute)}.ladder .st .num b{color:var(--ink);font-size:15px}
.ladder .st.cur .nm{color:var(--step)}
.ladder .add{color:var(--mute);font-size:13px;padding-top:10px;border-top:1px dashed var(--line)}
.pools{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:18px}
.pool h3{margin:0;font-size:14px}.pool .meta{font-size:12px;color:var(--mute)}
.track{position:relative;height:66px;margin:30px 20px 4px 20px}
.track .bar{position:absolute;left:0;right:0;top:24px;height:4px;background:var(--line);border-radius:2px}
.dot{position:absolute;top:16px;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px var(--line);transform:translateX(-50%)}
.dot.small{width:12px;height:12px;top:20px;opacity:.5}
.lab{position:absolute;top:42px;transform:translateX(-50%);font-size:11px;color:var(--mute);white-space:nowrap;text-align:center}.lab.up{top:-24px}
.lab b{display:block;color:var(--ink);font-size:13px}
.glyphs{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px}
.glyphs div{text-align:center;font-size:12px;color:var(--mute)}
svg{width:100%;aspect-ratio:1;background:#fff;border:1px solid var(--line);border-radius:8px;display:block}
path.tab{fill:var(--tab);opacity:.45}path.prev{fill:#9a9aa2;opacity:.4}.kg{margin-top:8px}.kgh{font-size:12px;font-weight:600;margin-bottom:4px}.kgh small{font-weight:400;color:#888}
.stex{padding:0 0 12px 38px}path.step{fill:none;stroke:var(--step);stroke-width:1.6;fill-rule:evenodd}
.legend{display:flex;gap:16px;font-size:12px;color:var(--mute);margin-top:10px;flex-wrap:wrap}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:5px}
.poolsw{display:flex;gap:8px;margin:0 0 12px}.poolsw button,.vtabs button{font:inherit;font-size:13px;padding:5px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;cursor:pointer}.poolsw button.on,.vtabs button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.mv{border-top:1px solid var(--line);padding:12px 0}.mv:first-child{border-top:0}
.mv .head{display:grid;grid-template-columns:230px 1fr 170px;gap:14px;align-items:center;cursor:pointer}
.mv .name{font-weight:600}.mv .name small{display:block;font-weight:400;color:var(--mute);font-size:12px}
.mv .bar{height:14px;background:#f0f0f2;border-radius:4px;overflow:hidden;position:relative}.mv .bar i{position:absolute;left:0;top:0;bottom:0;background:#8a6200;opacity:.75}.mv .bar u{position:absolute;top:0;bottom:0;border-right:2px dashed #8a6200;opacity:.5}
.mv .num{font-size:13px;color:var(--mute);text-align:right}
.mv .body{display:none;margin-top:14px}.mv.open .body{display:block}
.heat{display:grid;gap:2px;font-size:11px;align-items:center}
.heat .c{height:24px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
.heat .h{color:var(--mute);text-align:center;font-size:12px}.heat .rh{font-size:13px;text-align:center}.heat .m{font-weight:600}[data-s]{cursor:pointer}[data-s]:hover{outline:1px solid #888}[data-s].line{outline:1.5px solid rgba(0,0,0,.45);outline-offset:-1px}[data-s].pick{outline:2px solid #111;outline-offset:-1px}
.jong{display:flex;flex-wrap:wrap;gap:3px;margin-top:8px;font-size:11px}.jong div{width:42px;text-align:center}.jong .c{height:22px;border-radius:3px;display:flex;align-items:center;justify-content:center}
.scale{font-size:12px;color:var(--mute);margin:10px 0 4px}.scale i{display:inline-block;width:14px;height:10px;border-radius:2px;vertical-align:-1px;margin:0 3px 0 10px}
.vtabs{display:flex;gap:6px;margin-top:16px}.vtabs button{font-size:12px;padding:4px 12px}
.exs{display:grid;grid-template-columns:repeat(10,1fr);gap:8px;margin-top:6px}.exs div{text-align:center;font-size:11px;color:var(--mute)}.exs b{color:var(--ink);font-size:13px}
.note{background:#eef6f0;border:1px solid #cfe6d6;border-radius:10px;padding:12px 16px;font-size:13px;margin-top:14px}
#pick{display:none;position:fixed;top:12px;right:12px;width:min(400px,38vw);max-height:calc(100vh - 24px);overflow:auto;background:#fff;border:1px solid #ddd;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.14);padding:12px 14px;z-index:20}
body.pk main{margin-left:12px;margin-right:calc(min(400px,38vw) + 24px)}
#pick .ph{font-size:14px;display:flex;align-items:center;gap:4px}#pick .ph button{margin-left:auto;border:0;background:none;font-size:15px;cursor:pointer;color:var(--mute)}
#pick .ps{font-size:11px;color:var(--mute);margin:2px 0 6px}#pick .pt{font-size:12px;font-weight:600;margin:8px 0 4px}
#pick .pg{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}#pick .pg div{text-align:center;font-size:10px;color:var(--mute)}#pick .pg b{color:var(--ink);font-size:12px}#pick .pg .hi svg{outline:2px solid #111;border-radius:6px}
</style></head><body><div id="pick"></div><main>
<h1>가설 사다리 — 우리 패턴으로 노토까지</h1>
<p class="sub">"패턴만"에서 출발해 맞다고 확인된 가설을 하나씩 보탠다. 가설은 하나씩 켜고 끌 수 있고, 켠 조합으로 거리와 "아직 표가 하는 일"이 바뀐다. 목표는 표 없이 패턴만으로 파란 점을 초록(외운 표) 점까지 미는 것이다.</p>

<section class="card">
<div class="ladder" id="ladder"></div>
<div class="add">다음 칸 — 가설을 말해 주면 공식으로 옮겨 채점하고, 통과하면 여기 한 줄이 생긴다.</div>
<div class="pools" id="pools"></div>
<div class="legend"><span><i style="background:var(--raw)"></i>날것</span><span><i style="background:var(--step)"></i>지금 조합</span><span><i style="background:var(--tab)"></i>외운 표</span><span><i style="background:var(--noto)"></i>노토</span><span>거리 = 어긋난 잉크 ÷ 노토 잉크</span></div>
</section>

<h2>아직 표가 하는 일</h2>
<p class="sub">지금 조합과 외운 표의 상자 차이. 칸 숫자는 표가 그 짝에서 변을 더 옮기는 양(빨강 오른쪽 · 아래, 파랑 왼쪽 · 위). 가설이 맞으면 해당 줄의 막대가 줄고 판이 하얘진다. 점선은 "패턴만" 때 막대 길이.</p>
<div class="poolsw"><button data-pool="171" class="on">받침 없는 171자</button><button data-pool="588">받침 있는 588자</button></div>
<section class="card" id="moves"></section>
<div class="note">보는 법 — 한 줄 전체가 같은 색이면 "그 첫닿자는 늘 이렇다", 한 열이 같은 색이면 "그 홀자 옆에서는 늘 이렇다"는 패턴 후보다. 아래 글자 탭은 첫닿자별(홀자 고정) · 홀자별(첫닿자 고정) · 받침별 · 가장 많이 순.</div>
</main>
<script>
const D = __DATA__;
const V = D.V, N = 1 << D.hyps.length;
const PARTN = {CH:'첫닿자',JU:'홀자',JO:'받침'}, EDGEN = {left:'왼면',right:'오른면',top:'윗면',bottom:'아랫면'};
const CHOS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'], JUNGS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅣ'], JONGS = [...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
/** 글자가 카드 테두리에 닿지 않게 둘레에 두는 여백(V 단위). */
const PADV = 14;
const OPEN = new Set();
const SELC = {};
let LAST = null;
/** 고른 칸의 줄(같은 첫닿자)과 열(같은 홀자)을 오른쪽 위 고정 패널에 띄운다. */
function panel() {
  const el = document.getElementById('pick'); const pick = LAST && SELC[pool + ' ' + LAST];
  if (!pick) { el.style.display = 'none'; document.body.classList.remove('pk'); return; }
  const key = LAST; const [p, e] = key.split('.'); const mv = r => r.moves[sel][key];
  const rows = D.rows.filter(r => r.pool === pool && mv(r) !== undefined);
  const mid = list => { const m = mmed(list.map(mv)); return [...list].sort((x, y) => Math.abs(mv(x) - m) - Math.abs(mv(y) - m))[0]; };
  const [t, a, b] = pick.split('|');
  const glyph = (r, hi) => r && D.svgs[r.char] ? `<div class="${hi ? 'hi' : ''}">${svgOf(r.char, sel)}<b>${r.char}</b> ${fmt(mv(r))}</div>` : '<div></div>';
  const line = (title, cells) => `<div class="pl"><div class="pt">${title}</div><div class="pg">${cells.join('')}</div></div>`;
  let body = '';
  const cho = t === 'cell' || t === 'cho' ? a : null, jung = t === 'cell' ? b : t === 'jung' ? a : null;
  if (t === 'cell') body += line(`${a} × ${b} 칸`, [...rows.filter(r => r.cho === a && r.jung === b)].sort((x, y) => Math.abs(mv(y)) - Math.abs(mv(x))).map(r => glyph(r, false)));
  if (cho) body += line(`줄 — 첫닿자 ${cho}`, JUNGS.map(j => glyph(mid(rows.filter(r => r.cho === cho && r.jung === j)), j === jung)));
  if (jung) body += line(`열 — 홀자 ${jung}`, CHOS.map(c => glyph(mid(rows.filter(r => r.cho === c && r.jung === jung)), c === cho)));
  if (t === 'jong') body += line(`받침 ${a}`, [...rows.filter(r => r.jong === a)].sort((x, y) => Math.abs(mv(y)) - Math.abs(mv(x))).map(r => glyph(r, false)));
  el.innerHTML = `<div class="ph"><b>${PARTN[p]} ${EDGEN[e]}</b> · ${pool}자 · ${selName()}<button id="pickx">✕</button></div><div class="ps">초록 면 = 외운 표 · 파랑 선 = 지금 조합 · 숫자 = 표가 더 옮기는 양</div>${body}`;
  el.style.display = 'block'; document.body.classList.add('pk');
  document.getElementById('pickx').onclick = () => { delete SELC[pool + ' ' + LAST]; LAST = null; moves(); };
}
/** 기본으로 고르는 칸: 표가 가장 많이 옮기는 첫닿자 × 홀자 칸. */
function defaultSel(rows, mv) { let best = null, bv = -1; for (const c of CHOS) for (const j of JUNGS) { const v = mmed(rows.filter(r => r.cho===c && r.jung===j).map(mv)); if (v !== null && Math.abs(v) > bv) { bv = Math.abs(v); best = `cell|${c}|${j}`; } } return best; }
function pickedOf(rows, mv, pick) {
  const [t, a, b] = (pick ?? '').split('|'); const has = r => mv(r) !== undefined;
  const byAbs = list => [...list].sort((x, y) => Math.abs(mv(y)) - Math.abs(mv(x)));
  const mid = list => { const m = mmed(list.map(mv)); return [...list].sort((x, y) => Math.abs(mv(x) - m) - Math.abs(mv(y) - m))[0]; };
  if (t === 'cell') return { cap: `${a} × ${b} 칸의 글자`, list: byAbs(rows.filter(r => has(r) && r.cho===a && r.jung===b)) };
  if (t === 'cho') return { cap: `첫닿자 ${a} — 홀자마다 가운데 글자 하나`, list: JUNGS.map(j => mid(rows.filter(r => has(r) && r.cho===a && r.jung===j))).filter(Boolean) };
  if (t === 'jung') return { cap: `홀자 ${a} — 첫닿자마다 가운데 글자 하나`, list: CHOS.map(c => mid(rows.filter(r => has(r) && r.cho===c && r.jung===a))).filter(Boolean) };
  if (t === 'jong') return { cap: `받침 ${a}의 글자`, list: byAbs(rows.filter(r => has(r) && r.jong===a)) };
  return { cap: '칸을 고르면 글자가 나온다', list: [] };
}
const KEYS = ['CH.left','CH.right','CH.top','CH.bottom','JU.left','JU.right','JU.top','JU.bottom','JO.left','JO.right','JO.top','JO.bottom'];
const mmed = a => { const x = a.filter(v => v !== undefined && isFinite(v)).sort((p,q)=>p-q); return x.length ? x[x.length>>1] : null; };
const col = v => { if (v === null) return '#f4f4f5'; const t = Math.min(1, Math.abs(v)/0.08); return v > 0 ? `rgba(214,69,69,${0.06+0.8*t})` : `rgba(31,79,216,${0.06+0.8*t})`; };
const fmt = v => v === null ? '' : (Math.abs(v) < 0.0005 ? '0' : (v>0?'+':'−') + Math.abs(v).toFixed(3).replace(/^0/,''));
const dirOf = (e, v) => (e==='left'||e==='right') ? (v>0?'오른쪽':'왼쪽') : (v>0?'아래':'위');
let sel = N - 1, pool = '171';
const svgOf = (c, i) => { const g = D.svgs[c]; return g ? `<svg viewBox="${-PADV} ${-PADV} ${V+2*PADV} ${V+2*PADV}"><path class="tab" d="${g.table}" fill-rule="evenodd"/><path class="step" d="${g.steps[i]}"/></svg>` : ''; };
function ladder() {
  const el = document.getElementById('ladder'); el.innerHTML = '';
  const s5 = D.summary['588'], s1 = D.summary['171'];
  const pct = (s, x) => Math.round((1 - x / s.raw) * 100);
  const nums = m => `588 <b>${s5.steps[m].toFixed(2)}</b> (${pct(s5, s5.steps[m])}%)<br>171 <b>${s1.steps[m].toFixed(2)}</b> (${pct(s1, s1.steps[m])}%)`;
  el.insertAdjacentHTML('beforeend', `<div class="st base"><span></span><div class="nm">패턴만 <small>늘 켜져 있다 — 관계 규칙 · 획 꼴 다섯 · 받침 없을 때 첫닿자 공식</small></div><div class="num">${nums(0)}</div></div>`);
  D.hyps.forEach((h, i) => {
    const bit = 1 << i, on = (sel & bit) !== 0, off = sel & ~bit, with_ = sel | bit;
    const d = (s, a, b) => `${s.steps[a].toFixed(2)} → ${s.steps[b].toFixed(2)}`;
    el.insertAdjacentHTML('beforeend', `<label class="st ${on ? 'cur' : ''}"><input type="checkbox" ${on ? 'checked' : ''} data-bit="${bit}"><div class="nm">${i + 1}. ${h.name}<small>${h.who}</small></div><div class="num">이것만 켜고 끄면<br>588 ${d(s5, off, with_)}<br>171 ${d(s1, off, with_)}</div></label>`);
    if (!on) return;
    const ex = r => { const g = D.svgs[r.char]; return g ? `<div><svg viewBox="${-PADV} ${-PADV} ${V+2*PADV} ${V+2*PADV}"><path class="prev" d="${g.steps[off]}" fill-rule="evenodd"/><path class="step" d="${g.steps[with_]}"/></svg><b>${r.char}</b> ${r.xs[off].toFixed(2)} → ${r.xs[with_].toFixed(2)}</div>` : ''; };
    const groups = D.kinds.map(([label, js]) => { const pr = D.rows.filter(r => js.includes(r.jung)); const gain = r => r.xs[off] - r.xs[with_]; const top = [...pr].sort((a, b) => gain(b) - gain(a)).slice(0, 4).filter(r => gain(r) > 0.005); return { label, med: mmed(pr.map(gain)) ?? 0, top }; });
    el.insertAdjacentHTML('beforeend', `<div class="stex"><div class="scale">이 가설을 켰을 때 가장 많이 나아진 글자, 홀자 가지 갈래별로 — 회색 면 = 이것만 끈 것 · 파랑 선 = 켠 것(다른 가설은 지금 체크 그대로). 숫자는 노토까지 거리 전 → 후.</div>${groups.map(gr => `<div class="kg"><div class="kgh">${gr.label} <small>이 갈래 글자들은 가운데값으로 거리 ${Math.abs(gr.med).toFixed(2)} ${gr.med >= 0 ? '줄어듦' : '늘어남'}</small></div>${gr.top.length ? `<div class="exs">${gr.top.map(ex).join('')}</div>` : '<div class="scale">이 가설로는 바뀌지 않는다</div>'}</div>`).join('')}</div>`);
  });
  el.querySelectorAll('input').forEach(x => x.addEventListener('change', () => { sel ^= +x.dataset.bit; renderAll(); }));
}
const selName = () => sel === 0 ? '패턴만' : '패턴만 + ' + D.hyps.map((h, i) => (sel >> i) & 1 ? (i + 1) : null).filter(Boolean).join(' · ');
function pools() {
  const el = document.getElementById('pools'); el.innerHTML = '';
  for (const p of ['171','588']) {
    const s = D.summary[p]; const max = s.raw; const px = v => (1 - v / max) * 100;
    let dots = `<div class="dot" style="left:0;background:var(--raw)"></div><div class="lab up" style="left:0"><b>${s.raw.toFixed(2)}</b>날것</div>`;
    s.steps.forEach((v, i) => { if (i !== sel) dots += `<div class="dot small" style="left:${px(v)}%;background:var(--step)"></div>`; });
    dots += `<div class="dot" style="left:${px(s.steps[sel])}%;background:var(--step)"></div><div class="lab" style="left:${px(s.steps[sel])}%"><b>${s.steps[sel].toFixed(2)}</b>지금</div>`;
    dots += `<div class="dot" style="left:${px(s.table)}%;background:var(--tab)"></div><div class="lab up" style="left:${px(s.table)}%"><b>${s.table.toFixed(2)}</b>외운 표</div>`;
    dots += `<div class="dot" style="left:100%;background:var(--noto)"></div><div class="lab" style="left:100%"><b>0</b>노토</div>`;
    el.insertAdjacentHTML('beforeend', `<div class="pool"><h3>${p==='588'?'받침 있는 588자':'받침 없는 171자'}</h3><div class="meta">패턴만으로 ${Math.round((1-s.steps[sel]/s.raw)*100)}% · 외운 표 ${Math.round((1-s.table/s.raw)*100)}%</div><div class="track"><div class="bar"></div>${dots}</div></div>`);
  }
}
function moves() {
  const box = document.getElementById('moves'); box.innerHTML = '';
  const rows = D.rows.filter(r => r.pool === pool);
  const gs = KEYS.map(k => { const v = rows.map(r => r.moves[sel][k]).filter(x => x !== undefined); const v0 = rows.map(r => r.moves[0][k]).filter(x => x !== undefined);
    return { key: k, med: mmed(v.map(Math.abs)) ?? 0, base: mmed(v0.map(Math.abs)) ?? 0, sgn: mmed(v) ?? 0, n: v.length, over: v.filter(x => Math.abs(x) > 0.02).length }; }).filter(g => g.n); // 순서는 고정(첫닿자 → 홀자 → 받침, 왼 · 오른 · 위 · 아래)
  const maxMed = Math.max(...gs.map(g => Math.max(g.med, g.base)));
  gs.forEach((g, gi) => {
    const [p, e] = g.key.split('.'); const mv = r => r.moves[sel][g.key];
    let heat = `<div class="heat" style="grid-template-columns:28px repeat(9,1fr) 8px 1fr"><div></div>${JUNGS.map(j=>`<div class="h" data-s="jung|${j}">${j}</div>`).join('')}<div></div><div class="h">첫닿자별</div>`;
    for (const c of CHOS) { heat += `<div class="rh" data-s="cho|${c}">${c}</div>`; for (const j of JUNGS) { const v = mmed(rows.filter(r => r.cho===c && r.jung===j).map(mv)); heat += `<div class="c" data-s="cell|${c}|${j}" style="background:${col(v)}">${fmt(v)}</div>`; } const rv = mmed(rows.filter(r => r.cho===c).map(mv)); heat += `<div></div><div class="c m" data-s="cho|${c}" style="background:${col(rv)}">${fmt(rv)}</div>`; }
    heat += `<div class="rh" style="font-size:11px">홀자별</div>${JUNGS.map(j => { const v = mmed(rows.filter(r=>r.jung===j).map(mv)); return `<div class="c m" data-s="jung|${j}" style="background:${col(v)}">${fmt(v)}</div>`; }).join('')}</div>`;
    let jong = '';
    if (pool === '588') { const cell = {}; for (const r of rows) if (mv(r) !== undefined) (cell[r.cho+r.jung] ??= []).push(mv(r)); const cm = Object.fromEntries(Object.entries(cell).map(([k,v]) => [k, mmed(v)]));
      jong = `<div class="scale">받침별 — 같은 첫닿자 · 홀자 칸에 받침이 더 얹는 양</div><div class="jong">${JONGS.map(k => { const v = mmed(rows.filter(r=>r.jong===k && mv(r)!==undefined).map(r=>mv(r) - cm[r.cho+r.jung])); return `<div><div class="c" data-s="jong|${k}" style="background:${col(v)}">${fmt(v)}</div>${k}</div>`; }).join('')}</div>`; }
    const panes = '';
    const tabs = '';
    box.insertAdjacentHTML('beforeend', `<div class="mv${OPEN.has(g.key)?' open':''}" data-key="${g.key}"><div class="head"><div class="name">${PARTN[p]} ${EDGEN[e]}<small>표가 대개 ${dirOf(e, g.sgn)}으로 · 0.02 넘게 ${g.over}/${g.n}</small></div><div class="bar"><i style="width:${g.med/maxMed*100}%"></i>${sel>0?`<u style="left:0;width:${g.base/maxMed*100}%"></u>`:''}</div><div class="num">가운데 ${g.med.toFixed(3)}${sel>0?` (패턴만 ${g.base.toFixed(3)})`:''}</div></div><div class="body"><div class="scale">첫닿자 × 홀자 · 칸을 누르면 그 줄 · 그 열이, 머리(ㄱ · ㅏ …)를 누르면 그 줄이나 열 하나가 오른쪽 위에 뜬다<i style="background:rgba(214,69,69,.7)"></i>오른쪽 · 아래<i style="background:rgba(31,79,216,.7)"></i>왼쪽 · 위</div>${heat}${jong}${tabs}${panes}</div></div>`);
  });
  box.querySelectorAll('.mv .head').forEach(h => h.addEventListener('click', () => { const m = h.parentElement; m.classList.toggle('open'); const k = m.dataset.key; m.classList.contains('open') ? OPEN.add(k) : OPEN.delete(k); }));
  box.querySelectorAll('.mv').forEach(m => { const key = pool + ' ' + m.dataset.key; const cur = SELC[key]; m.querySelectorAll('[data-s]').forEach(c => { if (cur === c.dataset.s) c.classList.add('pick');
    const [ct, cc, cj] = c.dataset.s.split('|'); const [pt, pa, pb] = (cur ?? '').split('|');
    if (ct === 'cell' && ((pt === 'cho' && cc === pa) || (pt === 'jung' && cj === pa) || (pt === 'cell' && (cc === pa || cj === pb) && c.dataset.s !== cur))) c.classList.add('line'); c.addEventListener('click', () => { SELC[key] = c.dataset.s; LAST = m.dataset.key; moves(); }); }); });
  panel();
}
function renderAll() { ladder(); pools(); moves(); }
document.querySelectorAll('.poolsw button').forEach(b => b.addEventListener('click', () => { pool = b.dataset.pool; document.querySelectorAll('.poolsw button').forEach(x => x.classList.toggle('on', x===b)); moves(); }));
renderAll();
</script></body></html>'''
html = html.replace('__DATA__', json.dumps(d, ensure_ascii=False))
os.makedirs('/home/user/new-font-maker/.tmp-mock', exist_ok=True)
open('/home/user/new-font-maker/.tmp-mock/index.html', 'w').write(html)
print(len(html))
