import json, os
d = json.load(open('/tmp/claude-0/m/ladder.json'))
html = r'''<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>가설 사다리 — 노토까지</title>
<style>
:root{--ink:#1d1d1f;--mute:#6e6e73;--line:#e3e3e6;--bg:#f7f7f8;--noto:#e0522a;--tab:#2e9e5b;--step:#1f4fd8;--raw:#9a9aa2}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 20px 80px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:34px 0 8px}p.sub{color:var(--mute);margin:0 0 16px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.ladder .st{display:grid;grid-template-columns:28px 1fr 170px;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line);cursor:pointer}
.ladder .st:first-child{border-top:0}.ladder .st input{width:18px;height:18px}
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
path.tab{fill:var(--tab);opacity:.45}path.prev{fill:#9a9aa2;opacity:.4}.stex{padding:0 0 12px 38px}path.step{fill:none;stroke:var(--step);stroke-width:1.6;fill-rule:evenodd}
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
.heat .h{color:var(--mute);text-align:center;font-size:12px}.heat .rh{font-size:13px;text-align:center}.heat .m{font-weight:600}
.jong{display:flex;flex-wrap:wrap;gap:3px;margin-top:8px;font-size:11px}.jong div{width:42px;text-align:center}.jong .c{height:22px;border-radius:3px;display:flex;align-items:center;justify-content:center}
.scale{font-size:12px;color:var(--mute);margin:10px 0 4px}.scale i{display:inline-block;width:14px;height:10px;border-radius:2px;vertical-align:-1px;margin:0 3px 0 10px}
.vtabs{display:flex;gap:6px;margin-top:16px}.vtabs button{font-size:12px;padding:4px 12px}
.exs{display:grid;grid-template-columns:repeat(10,1fr);gap:8px;margin-top:6px}.exs div{text-align:center;font-size:11px;color:var(--mute)}.exs b{color:var(--ink);font-size:13px}
.note{background:#eef6f0;border:1px solid #cfe6d6;border-radius:10px;padding:12px 16px;font-size:13px;margin-top:14px}
</style></head><body><main>
<h1>가설 사다리 — 우리 패턴으로 노토까지</h1>
<p class="sub">맨 아래 칸 "패턴만"에서 출발해, 맞다고 확인된 가설을 한 칸씩 쌓는다. 칸을 고르면 그 칸까지 쌓은 결과로 거리와 "아직 표가 하는 일"이 바뀐다. 목표는 표 없이 패턴만으로 파란 점을 초록(외운 표) 점까지 미는 것이다.</p>

<section class="card">
<div class="ladder" id="ladder"></div>
<div class="add">다음 칸 — 가설을 말해 주면 공식으로 옮겨 채점하고, 통과하면 여기 한 줄이 생긴다.</div>
<div class="pools" id="pools"></div>
<div class="legend"><span><i style="background:var(--raw)"></i>날것</span><span><i style="background:var(--step)"></i>지금 고른 칸</span><span><i style="background:var(--tab)"></i>외운 표</span><span><i style="background:var(--noto)"></i>노토</span><span>거리 = 어긋난 잉크 ÷ 노토 잉크</span></div>
</section>

<h2>아직 표가 하는 일</h2>
<p class="sub">고른 칸과 외운 표의 상자 차이. 칸 숫자는 표가 그 짝에서 변을 더 옮기는 양(빨강 오른쪽 · 아래, 파랑 왼쪽 · 위). 가설이 맞으면 해당 줄의 막대가 줄고 판이 하얘진다. 점선은 "패턴만" 때 막대 길이.</p>
<div class="poolsw"><button data-pool="588" class="on">받침 있는 588자</button><button data-pool="171">받침 없는 171자</button></div>
<section class="card" id="moves"></section>
<div class="note">보는 법 — 한 줄 전체가 같은 색이면 "그 첫닿자는 늘 이렇다", 한 열이 같은 색이면 "그 홀자 옆에서는 늘 이렇다"는 패턴 후보다. 아래 글자 탭은 첫닿자별(홀자 고정) · 홀자별(첫닿자 고정) · 받침별 · 가장 많이 순.</div>
</main>
<script>
const D = __DATA__;
const V = D.V, N = D.steps.length;
const PARTN = {CH:'첫닿자',JU:'홀자',JO:'받침'}, EDGEN = {left:'왼면',right:'오른면',top:'윗면',bottom:'아랫면'};
const CHOS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'], JUNGS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅣ'], JONGS = [...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const KEYS = ['CH.left','CH.right','CH.top','CH.bottom','JU.left','JU.right','JU.top','JU.bottom','JO.left','JO.right','JO.top','JO.bottom'];
const mmed = a => { const x = a.filter(v => v !== undefined && isFinite(v)).sort((p,q)=>p-q); return x.length ? x[x.length>>1] : null; };
const col = v => { if (v === null) return '#f4f4f5'; const t = Math.min(1, Math.abs(v)/0.08); return v > 0 ? `rgba(214,69,69,${0.06+0.8*t})` : `rgba(31,79,216,${0.06+0.8*t})`; };
const fmt = v => v === null ? '' : (Math.abs(v) < 0.0005 ? '0' : (v>0?'+':'−') + Math.abs(v).toFixed(3).replace(/^0/,''));
const dirOf = (e, v) => (e==='left'||e==='right') ? (v>0?'오른쪽':'왼쪽') : (v>0?'아래':'위');
let sel = N - 1, pool = '588';
const svgOf = (c, i) => { const g = D.svgs[c]; return g ? `<svg viewBox="0 0 ${V} ${V}"><path class="tab" d="${g.table}" fill-rule="evenodd"/><path class="step" d="${g.steps[i]}"/></svg>` : ''; };
function ladder() {
  const el = document.getElementById('ladder'); el.innerHTML = '';
  [...D.steps.keys()].reverse().forEach(i => {
    const st = D.steps[i]; const s5 = D.summary['588'], s1 = D.summary['171'];
    const pct = (s, x) => Math.round((1 - x / s.raw) * 100);
    el.insertAdjacentHTML('beforeend', `<label class="st ${i===sel?'cur':''}"><input type="radio" name="step" ${i===sel?'checked':''} data-i="${i}"><div class="nm">${i}. ${st.name}<small>${st.who}</small></div><div class="num">588 <b>${s5.steps[i].toFixed(2)}</b> (${pct(s5, s5.steps[i])}%)<br>171 <b>${s1.steps[i].toFixed(2)}</b> (${pct(s1, s1.steps[i])}%)</div></label>`);
    const top = (D.stepTop[i] ?? []);
    if (top.length) el.insertAdjacentHTML('beforeend', `<div class="stex"><div class="scale">이 칸에서 가장 많이 나아진 글자 — 회색 면 = 바로 아래 칸(${i-1}칸) · 파랑 선 = 이 칸(${i}칸). 숫자는 노토까지 거리 전 → 후.</div><div class="exs">${top.map(t => { const g = D.svgs[t.char]; return g ? `<div><svg viewBox="0 0 ${V} ${V}"><path class="prev" d="${g.steps[i-1]}" fill-rule="evenodd"/><path class="step" d="${g.steps[i]}"/></svg><b>${t.char}</b> ${t.before.toFixed(2)} → ${t.after.toFixed(2)}</div>` : ''; }).join('')}</div></div>`);
  });
  el.querySelectorAll('input').forEach(x => x.addEventListener('change', () => { sel = +x.dataset.i; renderAll(); }));
}
function pools() {
  const el = document.getElementById('pools'); el.innerHTML = '';
  for (const p of ['588','171']) {
    const s = D.summary[p]; const max = s.raw; const px = v => (1 - v / max) * 100;
    let dots = `<div class="dot" style="left:0;background:var(--raw)"></div><div class="lab up" style="left:0"><b>${s.raw.toFixed(2)}</b>날것</div>`;
    s.steps.forEach((v, i) => { if (i !== sel) dots += `<div class="dot small" style="left:${px(v)}%;background:var(--step)"></div>`; });
    dots += `<div class="dot" style="left:${px(s.steps[sel])}%;background:var(--step)"></div><div class="lab" style="left:${px(s.steps[sel])}%"><b>${s.steps[sel].toFixed(2)}</b>${sel}칸</div>`;
    dots += `<div class="dot" style="left:${px(s.table)}%;background:var(--tab)"></div><div class="lab up" style="left:${px(s.table)}%"><b>${s.table.toFixed(2)}</b>외운 표</div>`;
    dots += `<div class="dot" style="left:100%;background:var(--noto)"></div><div class="lab" style="left:100%"><b>0</b>노토</div>`;
    el.insertAdjacentHTML('beforeend', `<div class="pool"><h3>${p==='588'?'받침 있는 588자':'받침 없는 171자'}</h3><div class="meta">패턴만으로 ${Math.round((1-s.steps[sel]/s.raw)*100)}% · 외운 표 ${Math.round((1-s.table/s.raw)*100)}%</div><div class="track"><div class="bar"></div>${dots}</div></div>`);
  }
}
function moves() {
  const box = document.getElementById('moves'); box.innerHTML = '';
  const rows = D.rows.filter(r => r.pool === pool);
  const gs = KEYS.map(k => { const v = rows.map(r => r.moves[sel][k]).filter(x => x !== undefined); const v0 = rows.map(r => r.moves[0][k]).filter(x => x !== undefined);
    return { key: k, med: mmed(v.map(Math.abs)) ?? 0, base: mmed(v0.map(Math.abs)) ?? 0, sgn: mmed(v) ?? 0, n: v.length, over: v.filter(x => Math.abs(x) > 0.02).length }; }).filter(g => g.n).sort((a,b) => b.med - a.med);
  const maxMed = Math.max(...gs.map(g => Math.max(g.med, g.base)));
  gs.forEach((g, gi) => {
    const [p, e] = g.key.split('.'); const mv = r => r.moves[sel][g.key];
    let heat = `<div class="heat" style="grid-template-columns:28px repeat(9,1fr) 8px 1fr"><div></div>${JUNGS.map(j=>`<div class="h">${j}</div>`).join('')}<div></div><div class="h">첫닿자별</div>`;
    for (const c of CHOS) { heat += `<div class="rh">${c}</div>`; for (const j of JUNGS) { const v = mmed(rows.filter(r => r.cho===c && r.jung===j).map(mv)); heat += `<div class="c" style="background:${col(v)}">${fmt(v)}</div>`; } const rv = mmed(rows.filter(r => r.cho===c).map(mv)); heat += `<div></div><div class="c m" style="background:${col(rv)}">${fmt(rv)}</div>`; }
    heat += `<div class="rh" style="font-size:11px">홀자별</div>${JUNGS.map(j => { const v = mmed(rows.filter(r=>r.jung===j).map(mv)); return `<div class="c m" style="background:${col(v)}">${fmt(v)}</div>`; }).join('')}</div>`;
    let jong = '';
    if (pool === '588') { const cell = {}; for (const r of rows) if (mv(r) !== undefined) (cell[r.cho+r.jung] ??= []).push(mv(r)); const cm = Object.fromEntries(Object.entries(cell).map(([k,v]) => [k, mmed(v)]));
      jong = `<div class="scale">받침별 — 같은 첫닿자 · 홀자 칸에 받침이 더 얹는 양</div><div class="jong">${JONGS.map(k => { const v = mmed(rows.filter(r=>r.jong===k && mv(r)!==undefined).map(r=>mv(r) - cm[r.cho+r.jung])); return `<div><div class="c" style="background:${col(v)}">${fmt(v)}</div>${k}</div>`; }).join('')}</div>`; }
    const byChar = Object.fromEntries(rows.map(r => [r.char, r]));
    const cellOf = (c, label) => { const r = byChar[c]; return r && D.svgs[c] ? `<div>${svgOf(c, sel)}<b>${label}</b> ${c} ${fmt(mv(r))}</div>` : ''; };
    const rep = D.reps[pool + ' ' + g.key] ?? {byCho:[],byJung:[],byJong:[],top:[]};
    const views = { cho: [`첫닿자별 — 홀자 ${rep.jStar} 고정`, rep.byCho.map(c => cellOf(c, byChar[c]?.cho ?? ''))], jung: [`홀자별 — 첫닿자 ${rep.cStar} 고정`, rep.byJung.map(c => cellOf(c, byChar[c]?.jung ?? ''))], ...(rep.byJong.length ? { jong: ['받침별', rep.byJong.map(c => cellOf(c, byChar[c]?.jong ?? ''))] } : {}), top: ['가장 많이', rep.top.map(c => cellOf(c, ''))] };
    const tabs = `<div class="vtabs">${Object.entries({cho:'첫닿자별',jung:'홀자별',jong:'받침별',top:'가장 많이'}).filter(([k]) => views[k]).map(([k,l],i) => `<button data-v="${k}" class="${i===0?'on':''}">${l}</button>`).join('')}</div>`;
    const panes = Object.entries(views).map(([k,[cap,cells]],i) => `<div class="vpane" data-v="${k}" style="${i===0?'':'display:none'}"><div class="scale">${cap} · 초록 면 = 외운 표 · 파랑 선 = ${sel}칸</div><div class="exs">${cells.join('')}</div></div>`).join('');
    box.insertAdjacentHTML('beforeend', `<div class="mv${gi===0?' open':''}"><div class="head"><div class="name">${PARTN[p]} ${EDGEN[e]}<small>표가 대개 ${dirOf(e, g.sgn)}으로 · 0.02 넘게 ${g.over}/${g.n}</small></div><div class="bar"><i style="width:${g.med/maxMed*100}%"></i>${sel>0?`<u style="left:0;width:${g.base/maxMed*100}%"></u>`:''}</div><div class="num">가운데 ${g.med.toFixed(3)}${sel>0?` (패턴만 ${g.base.toFixed(3)})`:''}</div></div><div class="body"><div class="scale">첫닿자 × 홀자<i style="background:rgba(214,69,69,.7)"></i>오른쪽 · 아래<i style="background:rgba(31,79,216,.7)"></i>왼쪽 · 위</div>${heat}${jong}${tabs}${panes}</div></div>`);
  });
  box.querySelectorAll('.mv .head').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  box.querySelectorAll('.vtabs button').forEach(b => b.addEventListener('click', () => { const m = b.closest('.mv'); m.querySelectorAll('.vtabs button').forEach(x => x.classList.toggle('on', x===b)); m.querySelectorAll('.vpane').forEach(x => x.style.display = x.dataset.v === b.dataset.v ? '' : 'none'); }));
}
function renderAll() { ladder(); pools(); moves(); }
document.querySelectorAll('.poolsw button').forEach(b => b.addEventListener('click', () => { pool = b.dataset.pool; document.querySelectorAll('.poolsw button').forEach(x => x.classList.toggle('on', x===b)); moves(); }));
renderAll();
</script></body></html>'''
html = html.replace('__DATA__', json.dumps(d, ensure_ascii=False))
os.makedirs('/home/user/new-font-maker/.tmp-mock', exist_ok=True)
open('/home/user/new-font-maker/.tmp-mock/index.html', 'w').write(html)
print(len(html))
