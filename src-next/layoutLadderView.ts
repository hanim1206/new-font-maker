/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck — 아티팩트(scripts/layout-rules/build-ladder-page.py)의 화면 스크립트를 그대로 옮겨 온 실험실 전용 그림 코드.
/**
 * 가설 사다리 화면을 root 안에 그린다. 데이터(D)는 실험실이 조합을 잴 때마다 채우고 render()를 다시 부른다.
 * 아직 안 잰 조합 숫자는 "…"로 보인다. 체크를 바꾸면 onSel(새 조합)을 부른다.
 */
export const LADDER_CSS = `.LL{--ink:#1d1d1f;--mute:#6e6e73;--line:#e3e3e6;--bg:#f7f7f8;--noto:#e0522a;--tab:#2e9e5b;--step:#1f4fd8;--raw:#9a9aa2}
.LL *{box-sizing:border-box}
.LL{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
.LL main{max-width:1080px;margin:0 auto;padding:28px 20px 80px}
.LL h1{font-size:22px;margin:0 0 4px}
.LL h2{font-size:17px;margin:34px 0 8px}
.LL p.sub{color:var(--mute);margin:0 0 16px}
.LL .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.LL .ladder .st{display:grid;grid-template-columns:24px 1fr 250px;gap:8px;align-items:center;padding:5px 0;border-top:1px solid var(--line);cursor:pointer}
.LL .ladder .st:first-child{border-top:0}
.LL .ladder .st.base{cursor:default}
.LL .ladder .st input{width:18px;height:18px}
.LL .ladder .st .nm{font-weight:600}
.LL .ladder .st small{display:block;color:var(--mute);font-weight:400;font-size:12px}
.LL .ladder .st .num{text-align:right;font-size:12px;color:var(--mute)}
.LL .ladder .st .nm[data-hyp]{cursor:pointer}
.LL .ladder .st .more{font-weight:400;font-size:12px;color:var(--mute);text-decoration:underline}
.LL .pop{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:24px}
.LL .pop[hidden]{display:none}
.LL .pop .pin{position:relative;background:#fff;border-radius:12px;max-width:760px;width:100%;max-height:85vh;overflow:auto;padding:20px 22px}
.LL .pop .pin h3{margin:0 70px 6px 0;font-size:17px}
.LL .pop .pin .who{margin:0 0 6px;color:var(--ink);font-size:14px}
.LL .pop .pin .num{margin:0 0 12px;color:var(--mute);font-size:13px}
.LL .pop .x{position:absolute;top:14px;right:14px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer}
.LL .ladder .st .num b{color:var(--ink);font-size:15px}
.LL .ladder .st.cur .nm{color:var(--step)}
.LL .ladder .add{color:var(--mute);font-size:13px;padding-top:10px;border-top:1px dashed var(--line)}
.LL .pools{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:18px}
.LL .pool h3{margin:0;font-size:14px}
.LL .pool .meta{font-size:12px;color:var(--mute)}
.LL .track{position:relative;height:66px;margin:30px 20px 4px 20px}
.LL .track .bar{position:absolute;left:0;right:0;top:24px;height:4px;background:var(--line);border-radius:2px}
.LL .dot{position:absolute;top:16px;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px var(--line);transform:translateX(-50%)}
.LL .dot.small{width:12px;height:12px;top:20px;opacity:.5}
.LL .lab{position:absolute;top:42px;transform:translateX(-50%);font-size:11px;color:var(--mute);white-space:nowrap;text-align:center}
.LL .lab.up{top:-24px}
.LL .lab b{display:block;color:var(--ink);font-size:13px}
.LL .glyphs{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px}
.LL .glyphs div{text-align:center;font-size:12px;color:var(--mute)}
.LL svg{width:100%;aspect-ratio:1;background:#fff;border:1px solid var(--line);border-radius:8px;display:block}
.LL path.tab{fill:var(--tab);opacity:.45}
.LL path.prev{fill:#9a9aa2;opacity:.4}
.LL .kg{margin-top:8px}
.LL .kgh{font-size:12px;font-weight:600;margin-bottom:4px}
.LL .kgh small{font-weight:400;color:#888}
.LL .stex{padding:0 0 12px 38px}
.LL path.step{fill:none;stroke:var(--step);stroke-width:1.6;fill-rule:evenodd}
.LL .legend{display:flex;gap:16px;font-size:12px;color:var(--mute);margin-top:10px;flex-wrap:wrap}
.LL .legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:5px}
.LL .poolsw{display:flex;gap:8px;margin:0 0 12px}
.LL .poolsw button,.LL .vtabs button{font:inherit;font-size:13px;padding:5px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;cursor:pointer}
.LL .poolsw button.on,.LL .vtabs button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.LL .mv{border-top:1px solid var(--line);padding:12px 0}
.LL .mv:first-child{border-top:0}
.LL .mv .head{display:grid;grid-template-columns:230px 1fr 170px;gap:14px;align-items:center;cursor:pointer}
.LL .mv .name{font-weight:600}
.LL .mv .name small{display:block;font-weight:400;color:var(--mute);font-size:12px}
.LL .mv .bar{height:14px;background:#f0f0f2;border-radius:4px;overflow:hidden;position:relative}
.LL .mv .bar i{position:absolute;left:0;top:0;bottom:0;background:#8a6200;opacity:.75}
.LL .mv .bar u{position:absolute;top:0;bottom:0;border-right:2px dashed #8a6200;opacity:.5}
.LL .mv .num{font-size:13px;color:var(--mute);text-align:right}
.LL .mv .body{display:none;margin-top:14px}
.LL .mv.open .body{display:block}
.LL .heat{display:grid;gap:2px;font-size:11px;align-items:center}
.LL .heat .c{height:24px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
.LL .heat .h{color:var(--mute);text-align:center;font-size:12px}
.LL .heat .rh{font-size:13px;text-align:center}
.LL .heat .m{font-weight:600}
.LL [data-s]{cursor:pointer}
.LL [data-s]:hover{outline:1px solid #888}
.LL [data-s].line{outline:1.5px solid rgba(0,0,0,.45);outline-offset:-1px}
.LL [data-s].pick{outline:2px solid #111;outline-offset:-1px}
.LL .jong{display:flex;flex-wrap:wrap;gap:3px;margin-top:8px;font-size:11px}
.LL .jong div{width:42px;text-align:center}
.LL .jong .c{height:22px;border-radius:3px;display:flex;align-items:center;justify-content:center}
.LL .scale{font-size:12px;color:var(--mute);margin:10px 0 4px}
.LL .scale i{display:inline-block;width:14px;height:10px;border-radius:2px;vertical-align:-1px;margin:0 3px 0 10px}
.LL .vtabs{display:flex;gap:6px;margin-top:16px}
.LL .vtabs button{font-size:12px;padding:4px 12px}
.LL .exs{display:grid;grid-template-columns:repeat(10,1fr);gap:8px;margin-top:6px}
.LL .exs div{text-align:center;font-size:11px;color:var(--mute)}
.LL .exs b{color:var(--ink);font-size:13px}
.LL .note{background:#eef6f0;border:1px solid #cfe6d6;border-radius:10px;padding:12px 16px;font-size:13px;margin-top:14px}
.LL #pick{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.LL #pick .ph{font-size:14px;display:flex;align-items:center;gap:4px}
.LL #pick .ph button{margin-left:auto;border:0;background:none;font-size:15px;cursor:pointer;color:var(--mute)}
.LL #pick .ps{font-size:11px;color:var(--mute);margin:2px 0 6px}
.LL #pick .pt{font-size:12px;font-weight:600;margin:8px 0 4px}
.LL #pick .pg{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.LL #pick .pg div{text-align:center;font-size:10px;color:var(--mute)}
.LL #pick .pg b{color:var(--ink);font-size:13px}.LL #pick svg{border-radius:6px}
.LL #pick .pg .hi svg{outline:2px solid #111;border-radius:6px}`

export const LADDER_CSS_WORK = `.LL main{max-width:none;padding-left:24px;padding-right:24px}.LL .work{display:grid;grid-template-columns:300px minmax(0,1fr) 420px;gap:20px;align-items:start}.LL .side{position:sticky;top:40px;max-height:calc(100vh - 52px);overflow:auto}.LL #canvas svg{background:#fff;border:1px solid var(--line);border-radius:12px;aspect-ratio:auto}.LL #canvas .edge{cursor:pointer}.LL #canvas .edge:hover .vis{opacity:.7}.LL #canvas text{font-size:7px;fill:var(--ink);pointer-events:none;font-variant-numeric:tabular-nums}.LL #canvas .pn{font-size:9px;fill:var(--mute)}.LL .ehead{display:grid;grid-template-columns:1fr 200px;gap:12px;align-items:center;margin-bottom:10px}.LL .ehead .name{font-weight:600;font-size:16px}.LL .ehead small{display:block;font-weight:400;color:var(--mute);font-size:12px}`

export const LADDER_HTML = `<main>
<h1>가설 사다리 — 우리 패턴으로 노토까지</h1>
<p class="sub">"패턴만"에서 출발해 맞다고 확인된 가설을 하나씩 보탠다. 가설은 하나씩 켜고 끌 수 있고, 켠 조합으로 거리와 "아직 표가 하는 일"이 바뀐다. 목표는 표 없이 패턴만으로 파란 점을 초록(외운 표) 점까지 미는 것이다.</p>

<section class="card">
<div class="ladder" id="ladder"></div>
<div class="pop" id="pop" hidden><div class="pin"><button class="x" id="popx">닫기</button><div id="popbody"></div></div></div>
<div class="add">다음 칸 — 가설을 말해 주면 공식으로 옮겨 채점하고, 통과하면 여기 한 줄이 생긴다.</div>
<div class="pools" id="pools"></div>
<div class="legend"><span><i style="background:var(--raw)"></i>날것</span><span><i style="background:var(--step)"></i>지금 조합</span><span><i style="background:var(--tab)"></i>외운 표</span><span><i style="background:var(--noto)"></i>노토</span><span>거리 = 어긋난 잉크 ÷ 노토 잉크</span></div>
</section>

<h2>아직 표가 하는 일</h2>
<p class="sub">지금 조합과 외운 표의 상자 차이. 왼쪽 틀에서 상자의 변을 누르면 그 변의 첫닿자 × 홀자 표가 가운데에 뜬다. 변의 색과 숫자는 그 변을 표가 더 옮기는 양의 가운데값(절댓값), 괄호는 "패턴만" 때. 칸을 누르면 그 줄 · 그 열 글자가 오른쪽 영역에 뜬다.</p>
<div class="work"><aside class="side"><div class="poolsw"><button data-pool="171" class="on">받침 없는 171자</button><button data-pool="588">받침 있는 588자</button></div><div id="canvas"></div></aside><section class="card" id="moves"></section><aside class="side"><div id="pick"></div></aside></div>
<div class="note">보는 법 — 한 줄 전체가 같은 색이면 "그 첫닿자는 늘 이렇다", 한 열이 같은 색이면 "그 홀자 옆에서는 늘 이렇다"는 패턴 후보다. </div>
</main>
`

export function mountLadderView(root: HTMLElement, D: any, onSel: (mask: number) => void): { render: () => void; mask: () => number } {

const V = D.V, N = 1 << D.hyps.length;
const PARTN = {CH:'첫닿자',JU:'홀자',JO:'받침'}, EDGEN = {left:'왼면',right:'오른면',top:'윗면',bottom:'아랫면'};
const CHOS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'], JUNGS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅣ'], JONGS = [...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
/** 글자가 카드 테두리에 닿지 않게 둘레에 두는 여백(V 단위). */
const PADV = 14;
const SELC = {};
let LAST = null;
/** 고른 칸의 줄(같은 첫닿자)과 열(같은 홀자)을 오른쪽 영역에 띄운다. */
function panel() {
  const el = root.querySelector('#' + 'pick'); const pick = LAST && SELC[pool + ' ' + LAST];
  if (!pick) { el.innerHTML = '<div class="ps">가운데 표에서 칸이나 머리(ㄱ · ㅏ …)를 누르면 그 줄 · 그 열의 글자가 여기 뜬다.</div>'; return; }
  const key = LAST; const [p, e] = key.split('.'); const mv = r => (r.moves[sel] ?? {})[key];
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
  
  root.querySelector('#pickx').onclick = () => { delete SELC[pool + ' ' + LAST]; moves(); };
}
const KEYS = ['CH.left','CH.right','CH.top','CH.bottom','JU.left','JU.right','JU.top','JU.bottom','JO.left','JO.right','JO.top','JO.bottom'];
const f2 = v => v === undefined || v === null ? '…' : v.toFixed(2);
const mmed = a => { const x = a.filter(v => v !== undefined && isFinite(v)).sort((p,q)=>p-q); return x.length ? x[x.length>>1] : null; };
const col = v => { if (v === null) return '#f4f4f5'; const t = Math.min(1, Math.abs(v)/0.08); return v > 0 ? `rgba(214,69,69,${0.06+0.8*t})` : `rgba(31,79,216,${0.06+0.8*t})`; };
const fmt = v => v === null ? '' : (Math.abs(v) < 0.0005 ? '0' : (v>0?'+':'−') + Math.abs(v).toFixed(3).replace(/^0/,''));
const dirOf = (e, v) => (e==='left'||e==='right') ? (v>0?'오른쪽':'왼쪽') : (v>0?'아래':'위');
let sel = N - 1, pool = '171';
const closePop = () => { popHyp = null; root.querySelector('#pop').hidden = true; };
root.querySelector('#popx').addEventListener('click', closePop);
root.querySelector('#pop').addEventListener('click', e => { if (e.target.id === 'pop') closePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
const svgOf = (c, i) => { const g = D.svgs[c]; return g ? `<svg viewBox="${-PADV} ${-PADV} ${V+2*PADV} ${V+2*PADV}"><path class="tab" d="${g.table}" fill-rule="evenodd"/><path class="step" d="${g.steps[i]}"/></svg>` : ''; };
function ladder() {
  const el = root.querySelector('#' + 'ladder'); el.innerHTML = '';
  const s5 = D.summary['588'], s1 = D.summary['171'];
  const pct = (s, x) => x === undefined ? '…' : Math.round((1 - x / s.raw) * 100);
  const nums = m => `588 <b>${f2(s5.steps[m])}</b> (${pct(s5, s5.steps[m])}%)<br>171 <b>${f2(s1.steps[m])}</b> (${pct(s1, s1.steps[m])}%)`;
  el.insertAdjacentHTML('beforeend', `<div class="st base"><span></span><div class="nm">패턴만 <small>늘 켜져 있다 — 관계 규칙 · 획 꼴 다섯 · 받침 없을 때 첫닿자 공식</small></div><div class="num">${nums(0)}</div></div>`);
  D.hyps.forEach((h, i) => {
    const bit = 1 << i, on = (sel & bit) !== 0, off = sel & ~bit, with_ = sel | bit;
    const d = (s, a, b) => `${f2(s.steps[a])} → ${f2(s.steps[b])}`;
    el.insertAdjacentHTML('beforeend', `<div class="st ${on ? 'cur' : ''}"><input type="checkbox" ${on ? 'checked' : ''} data-bit="${bit}"><div class="nm" data-hyp="${i}">${i + 1}. ${h.name} <span class="more">자세히</span></div><div class="num">켜고 끄면 588 ${d(s5, off, with_)} · 171 ${d(s1, off, with_)}</div></div>`);
  });
  el.querySelectorAll('input').forEach(x => x.addEventListener('change', () => { sel ^= +x.dataset.bit; onSel(sel); renderAll(); }));
  el.querySelectorAll('.nm[data-hyp]').forEach(x => x.addEventListener('click', () => { popHyp = +x.dataset.hyp; popup(); }));
  if (popHyp !== null) popup();
}
// 가설 자세히 — 누른 가설의 설명과 가장 많이 나아진 글자를 가운데 팝업으로 띄운다.
let popHyp = null;
function popup() {
  const pop = root.querySelector('#pop'), body = root.querySelector('#popbody');
  if (popHyp === null) { pop.hidden = true; return; }
  const i = popHyp, h = D.hyps[i], bit = 1 << i, on = (sel & bit) !== 0, off = sel & ~bit, with_ = sel | bit;
  const s5 = D.summary['588'], s1 = D.summary['171'];
  const d = (s, a, b) => `${f2(s.steps[a])} → ${f2(s.steps[b])}`;
  const ready = D.rows.some(r => r.xs[off] !== undefined && r.xs[with_] !== undefined);
  const ex = r => { const g = D.svgs[r.char]; return g ? `<div><svg viewBox="${-PADV} ${-PADV} ${V+2*PADV} ${V+2*PADV}"><path class="prev" d="${g.steps[off]}" fill-rule="evenodd"/><path class="step" d="${g.steps[with_]}"/></svg><b>${r.char}</b> ${f2(r.xs[off])} → ${f2(r.xs[with_])}</div>` : ''; };
  const groups = D.kinds.map(([label, js]) => { const pr = D.rows.filter(r => js.includes(r.jung)); const gain = r => (r.xs[off] ?? NaN) - (r.xs[with_] ?? NaN); const top = pr.filter(r => isFinite(gain(r))).sort((a, b) => gain(b) - gain(a)).slice(0, 4).filter(r => gain(r) > 0.005); return { label, med: mmed(pr.map(gain)) ?? 0, top }; });
  body.innerHTML = `<h3>${i + 1}. ${h.name}</h3><p class="who">${h.who}</p><p class="num">이것만 켜고 끄면 — 588 ${d(s5, off, with_)} · 171 ${d(s1, off, with_)}${on ? '' : ' (지금은 꺼져 있다)'}</p>`
    + (ready ? `<div class="stex"><div class="scale">가장 많이 나아진 글자, 홀자 가지 갈래별로 — 회색 면 = 이것만 끈 것 · 파랑 선 = 켠 것(다른 가설은 지금 체크 그대로). 숫자는 노토까지 거리 전 → 후.</div>${groups.map(gr => `<div class="kg"><div class="kgh">${gr.label} <small>이 갈래 글자들은 가운데값으로 거리 ${Math.abs(gr.med).toFixed(2)} ${gr.med >= 0 ? '줄어듦' : '늘어남'}</small></div>${gr.top.length ? `<div class="exs">${gr.top.map(ex).join('')}</div>` : '<div class="scale">이 가설로는 바뀌지 않는다</div>'}</div>`).join('')}</div>` : '<div class="scale">이 조합을 재는 중이다. 다 재면 글자가 뜬다.</div>');
  pop.hidden = false;
}
const selName = () => sel === 0 ? '패턴만' : '패턴만 + ' + D.hyps.map((h, i) => (sel >> i) & 1 ? (i + 1) : null).filter(Boolean).join(' · ');
function pools() {
  const pct = (s, x) => x === undefined ? '…' : Math.round((1 - x / s.raw) * 100);
  const el = root.querySelector('#' + 'pools'); el.innerHTML = '';
  for (const p of ['171','588']) {
    const s = D.summary[p]; const max = s.raw; const px = v => (1 - v / max) * 100;
    let dots = `<div class="dot" style="left:0;background:var(--raw)"></div><div class="lab up" style="left:0"><b>${s.raw.toFixed(2)}</b>날것</div>`;
    Object.entries(s.steps).forEach(([i, v]) => { if (+i !== sel) dots += `<div class="dot small" style="left:${px(v)}%;background:var(--step)"></div>`; });
    if (s.steps[sel] !== undefined) dots += `<div class="dot" style="left:${px(s.steps[sel])}%;background:var(--step)"></div><div class="lab" style="left:${px(s.steps[sel])}%"><b>${s.steps[sel].toFixed(2)}</b>지금</div>`;
    dots += `<div class="dot" style="left:${px(s.table)}%;background:var(--tab)"></div><div class="lab up" style="left:${px(s.table)}%"><b>${s.table.toFixed(2)}</b>외운 표</div>`;
    dots += `<div class="dot" style="left:100%;background:var(--noto)"></div><div class="lab" style="left:100%"><b>0</b>노토</div>`;
    el.insertAdjacentHTML('beforeend', `<div class="pool"><h3>${p==='588'?'받침 있는 588자':'받침 없는 171자'}</h3><div class="meta">지금 조합 ${pct(s, s.steps[sel])}% · 외운 표 ${Math.round((1-s.table/s.raw)*100)}%</div><div class="track"><div class="bar"></div>${dots}</div></div>`);
  }
}
/** 틀 그림 속 상자 자리(그림 좌표 200). 받침 있을 때와 없을 때. */
const FRAME = {
  '588': { CH: [28, 26, 108, 98], JU: [128, 20, 170, 124], JO: [36, 144, 170, 180] },
  '171': { CH: [28, 50, 112, 150], JU: [132, 20, 172, 180] },
};
let EDGE = null;
function stats(rows, k) {
  const v = rows.map(r => (r.moves[sel] ?? {})[k]).filter(x => x !== undefined); const v0 = rows.map(r => (r.moves[0] ?? {})[k]).filter(x => x !== undefined);
  return { key: k, med: mmed(v.map(Math.abs)) ?? 0, base: mmed(v0.map(Math.abs)) ?? 0, sgn: mmed(v) ?? 0, n: v.length, over: v.filter(x => Math.abs(x) > 0.02).length };
}
/** 왼쪽 틀: 상자 열두 변을 오차 크기대로 칠하고, 누르면 그 변을 고른다. */
function canvas(rows, gs) {
  const el = root.querySelector('#canvas'); const fr = FRAME[pool];
  const by = Object.fromEntries(gs.map(g => [g.key, g]));
  const tone = g => { const t = Math.min(1, g.med / 0.06); return g.sgn > 0 ? `rgba(214,69,69,${0.15 + 0.85 * t})` : `rgba(31,79,216,${0.15 + 0.85 * t})`; };
  let svg = `<svg viewBox="0 0 200 200" width="100%"><rect x="6" y="6" width="188" height="188" fill="none" stroke="#e3e3e6" stroke-dasharray="3 3"/>`;
  for (const [part, [x0, y0, x1, y1]] of Object.entries(fr)) {
    svg += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#f4f4f5" stroke="none"/><text class="pn" x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2 + 4}" text-anchor="middle">${PARTN[part]}</text>`;
    const sides = { left: [x0, y0, x0, y1], right: [x1, y0, x1, y1], top: [x0, y0, x1, y0], bottom: [x0, y1, x1, y1] };
    for (const [e, [ax, ay, bx, by_]] of Object.entries(sides)) {
      const g = by[part + '.' + e]; if (!g) continue;
      const on = EDGE === g.key; const mx = (ax + bx) / 2, my = (ay + by_) / 2;
      const tx = e === 'left' ? ax - 3 : e === 'right' ? ax + 3 : mx, ty = e === 'top' ? ay - 3 : e === 'bottom' ? ay + 9 : my;
      const rot = e === 'left' ? ` transform="rotate(-90 ${tx} ${ty})"` : e === 'right' ? ` transform="rotate(90 ${tx} ${ty})"` : '';
      const anchor = 'middle';
      svg += `<g class="edge" data-key="${g.key}"><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by_}" stroke="transparent" stroke-width="16"/><line class="vis" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by_}" stroke="${tone(g)}" stroke-width="${on ? 8 : 5}" stroke-linecap="round"/>${on ? `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by_}" stroke="#111" stroke-width="1.5"/>` : ''}<text x="${tx}" y="${ty}"${rot} text-anchor="${anchor}" style="font-weight:${on ? 700 : 400}">${g.med.toFixed(3).replace(/^0/, '')}${sel > 0 ? ` (${g.base.toFixed(3).replace(/^0/, '')})` : ''}</text></g>`;
    }
  }
  svg += `</svg>`;
  el.innerHTML = svg;
  el.querySelectorAll('.edge').forEach(n => n.addEventListener('click', () => { EDGE = n.dataset.key; LAST = EDGE; moves(); }));
}
function moves() {
  const box = root.querySelector('#' + 'moves'); box.innerHTML = '';
  const rows = D.rows.filter(r => r.pool === pool);
  const gs = KEYS.map(k => stats(rows, k)).filter(g => g.n);
  if (!gs.length) { canvas(rows, gs); box.innerHTML = '<div class="scale">아직 이 조합을 재는 중이다.</div>'; panel(); return; }
  if (!EDGE || !gs.some(g => g.key === EDGE)) EDGE = [...gs].sort((a, b) => b.med - a.med)[0].key;
  LAST = EDGE;
  canvas(rows, gs);
  const g = gs.find(x => x.key === EDGE);
  const [p, e] = g.key.split('.'); const mv = r => (r.moves[sel] ?? {})[g.key];
  const maxMed = Math.max(...gs.map(x => Math.max(x.med, x.base)));
  let heat = `<div class="heat" style="grid-template-columns:28px repeat(9,1fr) 8px 1fr"><div></div>${JUNGS.map(j=>`<div class="h" data-s="jung|${j}">${j}</div>`).join('')}<div></div><div class="h">첫닿자별</div>`;
  for (const c of CHOS) { heat += `<div class="rh" data-s="cho|${c}">${c}</div>`; for (const j of JUNGS) { const v = mmed(rows.filter(r => r.cho===c && r.jung===j).map(mv)); heat += `<div class="c" data-s="cell|${c}|${j}" style="background:${col(v)}">${fmt(v)}</div>`; } const rv = mmed(rows.filter(r => r.cho===c).map(mv)); heat += `<div></div><div class="c m" data-s="cho|${c}" style="background:${col(rv)}">${fmt(rv)}</div>`; }
  heat += `<div class="rh" style="font-size:11px">홀자별</div>${JUNGS.map(j => { const v = mmed(rows.filter(r=>r.jung===j).map(mv)); return `<div class="c m" data-s="jung|${j}" style="background:${col(v)}">${fmt(v)}</div>`; }).join('')}</div>`;
  let jong = '';
  if (pool === '588') { const cell = {}; for (const r of rows) if (mv(r) !== undefined) (cell[r.cho+r.jung] ??= []).push(mv(r)); const cm = Object.fromEntries(Object.entries(cell).map(([k,v]) => [k, mmed(v)]));
    jong = `<div class="scale">받침별 — 같은 첫닿자 · 홀자 칸에 받침이 더 얹는 양</div><div class="jong">${JONGS.map(k => { const v = mmed(rows.filter(r=>r.jong===k && mv(r)!==undefined).map(r=>mv(r) - cm[r.cho+r.jung])); return `<div><div class="c" data-s="jong|${k}" style="background:${col(v)}">${fmt(v)}</div>${k}</div>`; }).join('')}</div>`; }
  box.innerHTML = `<div class="ehead"><div class="name">${PARTN[p]} ${EDGEN[e]}<small>표가 대개 ${dirOf(e, g.sgn)}으로 · 0.02 넘게 ${g.over}/${g.n} · 가운데 ${g.med.toFixed(3)}${sel>0?` (패턴만 ${g.base.toFixed(3)})`:''}</small></div><div class="mv"><div class="bar"><i style="width:${g.med/maxMed*100}%"></i>${sel>0?`<u style="left:0;width:${g.base/maxMed*100}%"></u>`:''}</div></div></div><div class="scale">첫닿자 × 홀자 · 칸을 누르면 그 줄 · 그 열이, 머리(ㄱ · ㅏ …)를 누르면 그 줄이나 열 하나가 오른쪽 영역에 뜬다<i style="background:rgba(214,69,69,.7)"></i>오른쪽 · 아래<i style="background:rgba(31,79,216,.7)"></i>왼쪽 · 위</div>${heat}${jong}`;
  const key = pool + ' ' + EDGE; const cur = SELC[key];
  box.querySelectorAll('[data-s]').forEach(c => { if (cur === c.dataset.s) c.classList.add('pick');
    const [ct, cc, cj] = c.dataset.s.split('|'); const [pt, pa, pb] = (cur ?? '').split('|');
    if (ct === 'cell' && ((pt === 'cho' && cc === pa) || (pt === 'jung' && cj === pa) || (pt === 'cell' && (cc === pa || cj === pb) && c.dataset.s !== cur))) c.classList.add('line'); c.addEventListener('click', () => { SELC[key] = c.dataset.s; moves(); }); });
  panel();
}
function renderAll() { ladder(); pools(); moves(); }
root.querySelectorAll('.poolsw button').forEach(b => b.addEventListener('click', () => { pool = b.dataset.pool; root.querySelectorAll('.poolsw button').forEach(x => x.classList.toggle('on', x===b)); moves(); }));
return { render: renderAll, mask: () => sel };

}
