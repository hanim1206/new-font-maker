import { useMemo, useState } from 'react'
import { approvedNotoInputs, connectApprovedNotoInput, createNotoBoundMaster, railEditRange, renderNotoBoundMaster } from './notoBoundMaster'
import type { ApprovedNotoInput, BoundMaster, MasterDrawing, RailEdits } from './notoBoundMaster'
import { corpusRecordingPath } from './notoCorpus'
import type { CorpusDetail } from './notoCorpus'
import styles from './NotoPresetInspector.module.css'

function MasterCanvas({ master, drawing, source = false, overlay = false, showGuides }: { master: BoundMaster; drawing: MasterDrawing; source?: boolean; overlay?: boolean; showGuides: boolean }) {
  const path = source ? corpusRecordingPath(master.sourceOperations) : `${drawing.paths.initial} ${drawing.paths.medial}`
  return <svg viewBox="-.12 -.12 1.24 1.24" role="img" aria-label={`${master.character} ${source ? '승인 당시 원본' : '기준선 결속 마스터'}`} data-testid={source ? 'preset-source-canvas' : 'preset-master-canvas'}>
    <rect width="1" height="1" fill="white" stroke="#d5dfe8" strokeWidth=".003" />
    <path d="M-.1 .88H1.1" stroke="#9aaec1" strokeWidth=".002" />
    {showGuides && <g data-testid={source ? 'preset-source-guides' : 'preset-master-guides'}>
      <rect {...drawing.initialArea} fill="#db6228" fillOpacity=".08" stroke="#db6228" strokeWidth=".004" strokeDasharray=".015 .01" />
      {drawing.guides.map(({ id, ...line }, index) => <line key={`${id}-${index}`} {...line} stroke="#2472bc" strokeWidth=".008" data-rail={id} />)}
    </g>}
    <path d={path} fill="#172b3d" data-testid={source ? 'preset-source-ink' : 'preset-master-ink'} />
    {!source && overlay && <path d={corpusRecordingPath(master.sourceOperations)} fill="none" stroke="#d46234" strokeWidth=".003" opacity=".65" data-testid="preset-before-overlay" />}
  </svg>
}

function Editor({ input, showGuides }: { input: ApprovedNotoInput; showGuides: boolean }) {
  const master = useMemo(() => createNotoBoundMaster(input), [input])
  const original = useMemo(() => renderNotoBoundMaster(master), [master])
  const [edits, setEdits] = useState<RailEdits>({})
  const [selected, setSelected] = useState('CH:right')
  const [overlay, setOverlay] = useState(false)
  const [error, setError] = useState('')
  const drawing = useMemo(() => renderNotoBoundMaster(master, edits), [master, edits])
  const rail = master.rails.find((item) => item.id === selected)!
  const range = railEditRange(master, selected)
  const value = edits[selected] ?? rail.value
  const change = (next: number) => {
    const proposed = { ...edits, [selected]: next }
    if (Math.abs(next - rail.value) < 1e-12) delete proposed[selected]
    try { renderNotoBoundMaster(master, proposed); setEdits(proposed); setError('') }
    catch (failure) { setError(failure instanceof Error ? failure.message : '기준선 변경을 적용할 수 없습니다.') }
  }
  return <>
    <p className={styles.description}>곡률·구멍은 Noto 윤곽에서 가져오고, 제어점을 추출 기준선에 결속했습니다. 기준선만으로 획 문법을 복원한 결과는 아닙니다.</p>
    <div className={styles.comparison}>
      <figure><figcaption>승인 당시 Noto 원본</figcaption><MasterCanvas master={master} drawing={original} source showGuides={showGuides} /></figure>
      <figure><figcaption>기준선 결속 마스터 · 편집 후보</figcaption><MasterCanvas master={master} drawing={drawing} overlay={overlay} showGuides={showGuides} /></figure>
    </div>
    <p className={styles.status} data-testid="preset-edit-status">{Object.keys(edits).length ? `${Object.keys(edits).length}개 기준선 변경 · 편집 결과 미승인` : '변경 없음 · 원본 제어점 좌표 재현'}</p>
    <fieldset className={styles.controls}><legend>기준선을 움직여 형태 확인</legend>
      <label>편집 기준선<select aria-label="편집 기준선" value={selected} onChange={(event) => { setSelected(event.target.value); setError('') }}>{master.rails.filter((item) => item.editable).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <label className={styles.rangeLabel}>{rail.label}<input type="range" aria-label="기준선 위치 조절" min={range.min} max={range.max} step=".001" value={value} onChange={(event) => change(event.target.valueAsNumber)} /></label>
      <label>위치 · 1000 unit 기준<input type="number" aria-label="기준선 위치 수치" min={range.min * 1000} max={range.max * 1000} step="1" value={Number((value * 1000).toFixed(3))} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) change(event.target.valueAsNumber / 1000) }} /></label>
      <small>승인값 {(rail.value * 1000).toFixed(3)} · 변화량 {((value - rail.value) * 1000).toFixed(3)} unit</small>
      <label className={styles.overlay}><input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} />수정 전 겹쳐보기</label>
      <button type="button" disabled={!Object.keys(edits).length} onClick={() => { setEdits({}); setError('') }}>승인 원본으로 복원</button>
    </fieldset>
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    <p className={styles.description}>편집은 임시입니다. 글자 전환·새로고침 시 초기화됩니다. 구간별 제어점 보간 방식이며, 획 두께·접합·자모 간 충돌 자동 보정과 실제 프리셋·OTF 적용은 아직 연결하지 않았습니다.</p>
    <details className={styles.provenance}><summary>연결된 승인 입력 근거</summary><p>승인 기록 SHA {master.approvalSha256}</p><p>첫닿자 payload {master.sourcePayloadSha256.initial}</p><p>홀자 payload {master.sourcePayloadSha256.medial}</p><p>승인 당시 입력을 사용합니다. 최신 배치 전체에 승인을 상속하지 않습니다.</p></details>
  </>
}

export function NotoPresetInspector({ detail, rejected, showGuides }: { detail: CorpusDetail; rejected: boolean; showGuides: boolean }) {
  const connection = useMemo(() => {
    try {
      const result = connectApprovedNotoInput(detail, rejected)
      if (result.input) createNotoBoundMaster(result.input)
      return { ...result, count: approvedNotoInputs().length }
    } catch (failure) { return { input: null, count: 0, reason: failure instanceof Error ? failure.message : '승인 입력을 연결하지 못했습니다.' } }
  }, [detail, rejected])
  return <section className={styles.panel} aria-label="승인 입력과 생성·편집 비교" data-testid="noto-preset-inspector">
    <div className={styles.heading}><div><span>승인 입력 → 마스터 → 기준선 편집</span><h3>같은 글자, 기준선으로 조절하기</h3></div><strong data-testid="preset-connection-status">{connection.input ? '승인 입력 연결됨' : '생성 연결 대기'}</strong></div>
    <p className={styles.description}>연결 대상 {connection.count}자 · 사용자가 확인한 당시의 직접 추출 입력만 사용합니다. 기준선 입력 승인과 생성·편집 결과 승인은 별개입니다.</p>
    {connection.input ? <Editor key={`${detail.identity.character}:${connection.input.sourcePayloadSha256.initial}`} input={connection.input} showGuides={showGuides} /> : <p className={styles.warning}>{connection.reason}</p>}
  </section>
}
