/**
 * CFF CharStrings에 전역 서브루틴을 붙여 파일을 줄인다. 윤곽은 한 점도 안 바뀐다.
 *
 * 한글 11,172자는 같은 자소 조각이 수천 번 되풀이된다. 되풀이되는 명령 조각을 서브루틴으로 한 번만 두고
 * 글자는 그 번호를 부른다. compreffor 방식을 줄인 것이다.
 *
 * 1. 연산자 최적화 — 가로 · 세로선은 `hlineto` · `vlineto`, 이어지는 직선 · 곡선은 한 연산자로 묶는다.
 * 2. 숫자 단위 토큰 — 서브루틴 경계가 명령 중간이어도 된다(Type 2 스택은 서브루틴 호출을 건너 이어진다).
 * 3. 접미사 배열 + LCP 구간 → 반복되는 토큰 열 후보. 점수 상위 `maxCandidates`개만 쓴다.
 * 4. 글리프마다 DP로 "토큰 그대로 / 서브루틴 호출" 중 최소 바이트를 고른다.
 *    시장 라운드: 호출 비용에 "몸통 크기 ÷ 사용 횟수"를 얹고, 후보는 매번 다 다시 경쟁한다.
 *    정리 라운드: 손해 보는 서브루틴을 버리고 진짜 호출 비용으로 다시 고른다.
 * 5. 중첩 — 서브루틴 몸통도 더 짧은 서브루틴을 부른다. 깊이는 Type 2 한도(10) 안.
 * 6. 확인 — 결과를 서브루틴을 풀어 다시 펼쳐 1의 결과와 바이트가 같은지 본다. 다르면 멈춘다.
 *
 * 모르는 연산자(힌트 · 5바이트 수 등)가 있으면 멈춘다. 부르는 쪽은 서브루틴 없이 원래 CharStrings를 쓴다.
 */

export interface SubroutinizeOptions {
  /** 후보 상한. 클수록 조금 더 작아지고 느려진다(플랜 D0: 20만). */
  maxCandidates?: number
}

export interface SubroutinizedCharStrings {
  charStrings: Uint8Array[]
  globalSubrs: Uint8Array[]
}

const RMOVETO = 21
const HMOVETO = 22
const VMOVETO = 4
const RLINETO = 5
const HLINETO = 6
const VLINETO = 7
const RRCURVETO = 8
const ENDCHAR = 14
const RETURN = 11
const CALLGSUBR = 29
/** 한 연산자에 묶는 인자 수. 스택 한도 48에서 폭 · 서브루틴 번호 자리를 남긴다. */
const MAX_ARGS = 40
/** Type 2 서브루틴 호출 깊이 한도는 10. 글리프 자신이 한 층이다. */
const MAX_SUBR_DEPTH = 9
/** INDEX 개수는 2바이트. */
const MAX_SUBRS = 65535
const MARKET_ROUNDS = 4
const PRUNE_ROUNDS = 3
/** 서브루틴 하나를 두는 값: 몸통 끝 `return` 1바이트 + INDEX 오프셋 약 2바이트. */
const SUBR_OVERHEAD = 3

function numberBytes(v: number): number {
  return v >= -107 && v <= 107 ? 1 : v >= -1131 && v <= 1131 ? 2 : 3
}

function pushNumber(v: number, out: number[]): void {
  if (v >= -107 && v <= 107) out.push(v + 139)
  else if (v >= 108 && v <= 1131) { const w = v - 108; out.push((w >> 8) + 247, w & 255) }
  else if (v >= -1131 && v <= -108) { const w = -v - 108; out.push((w >> 8) + 251, w & 255) }
  else if (v >= -32768 && v <= 32767) out.push(28, (v >> 8) & 255, v & 255)
  else throw new Error(`CharString 정수 범위 밖: ${v}`)
}

/** 읽은 숫자와 바이트 수. CharString의 1 · 2 · 3바이트 정수만 안다. */
function readNumber(bytes: Uint8Array, at: number): [number, number] {
  const b0 = bytes[at]
  if (b0 >= 32 && b0 <= 246) return [b0 - 139, 1]
  if (b0 >= 247 && b0 <= 250) return [(b0 - 247) * 256 + bytes[at + 1] + 108, 2]
  if (b0 >= 251 && b0 <= 254) return [-(b0 - 251) * 256 - bytes[at + 1] - 108, 2]
  if (b0 === 28) return [(((bytes[at + 1] << 8) | bytes[at + 2]) << 16) >> 16, 3]
  throw new Error(`서브루틴이 모르는 CharString 수 바이트 ${b0}`)
}

function biasOf(count: number): number {
  return count < 1240 ? 107 : count < 33900 ? 1131 : 32768
}

// ===== 1. 연산자 최적화 =====

/** 프로그램 원소: 숫자는 그대로, 연산자는 `OP_BASE + op`. */
const OP_BASE = 1_000_000

/** CharString 하나를 연산자 최적화한 프로그램으로. 끝의 endchar는 뺀다(글리프 끝에 다시 붙인다). */
export function specializeCharString(bytes: Uint8Array): number[] {
  const commands: Array<{ op: number; args: number[] }> = []
  let args: number[] = []
  let at = 0
  let ended = false
  while (at < bytes.length) {
    const b0 = bytes[at]
    if (b0 >= 32 || b0 === 28) {
      const [value, size] = readNumber(bytes, at)
      args.push(value)
      at += size
      continue
    }
    if (b0 === ENDCHAR) {
      if (at !== bytes.length - 1) throw new Error('endchar 뒤에 바이트가 있다')
      ended = true
      break
    }
    if (b0 !== RMOVETO && b0 !== RLINETO && b0 !== RRCURVETO) throw new Error(`서브루틴이 모르는 CharString 연산자 ${b0}`)
    commands.push({ op: b0, args })
    args = []
    at += 1
  }
  if (!ended) throw new Error('CharString이 endchar로 끝나지 않는다')

  const program: number[] = []
  const emit = (values: number[], op: number) => { program.push(...values, OP_BASE + op) }
  const lineKind = (index: number): 'H' | 'V' | 'R' => {
    const [dx, dy] = commands[index].args
    return dy === 0 ? 'H' : dx === 0 ? 'V' : 'R'
  }
  let i = 0
  while (i < commands.length) {
    const command = commands[i]
    if (command.op === RMOVETO) {
      // 첫 moveto 앞의 홀수 인자는 글리프 폭이다.
      const width = command.args.length === 3 ? [command.args[0]] : []
      const [dx, dy] = command.args.slice(-2)
      if (dy === 0) emit([...width, dx], HMOVETO)
      else if (dx === 0) emit([...width, dy], VMOVETO)
      else emit(command.args, RMOVETO)
      i += 1
    } else if (command.op === RRCURVETO) {
      const run: number[] = []
      while (i < commands.length && commands[i].op === RRCURVETO && run.length + 6 <= MAX_ARGS) { run.push(...commands[i].args); i += 1 }
      emit(run, RRCURVETO)
    } else if (lineKind(i) === 'R') {
      const run: number[] = []
      while (i < commands.length && commands[i].op === RLINETO && lineKind(i) === 'R' && run.length + 2 <= MAX_ARGS) { run.push(...commands[i].args); i += 1 }
      emit(run, RLINETO)
    } else {
      // 가로 · 세로가 번갈아 이어지면 hlineto / vlineto 하나로 묶는다.
      const first = lineKind(i)
      let want = first
      const run: number[] = []
      while (i < commands.length && commands[i].op === RLINETO && lineKind(i) === want && run.length < MAX_ARGS) {
        const [dx, dy] = commands[i].args
        run.push(want === 'H' ? dx : dy)
        want = want === 'H' ? 'V' : 'H'
        i += 1
      }
      emit(run, first === 'H' ? HLINETO : VLINETO)
    }
  }
  // 윤곽 없는 글리프의 폭.
  program.push(...args)
  return program
}

function programElementBytes(element: number): number[] {
  if (element >= OP_BASE) return [element - OP_BASE]
  const out: number[] = []
  pushNumber(element, out)
  return out
}

// ===== 3. 접미사 배열 · LCP =====

/** 배가 + 계수 정렬. O(n log n). */
function suffixArray(s: Int32Array, alphabet: number): Int32Array {
  const n = s.length
  const sa = new Int32Array(n)
  const sa2 = new Int32Array(n)
  let rank = new Int32Array(n)
  let next = new Int32Array(n)
  let count = new Int32Array(Math.max(alphabet, n) + 1)
  for (let i = 0; i < n; i += 1) count[s[i]] += 1
  for (let i = 1; i < count.length; i += 1) count[i] += count[i - 1]
  for (let i = n - 1; i >= 0; i -= 1) sa[--count[s[i]]] = i
  let classes = 1
  rank[sa[0]] = 0
  for (let i = 1; i < n; i += 1) {
    if (s[sa[i]] !== s[sa[i - 1]]) classes += 1
    rank[sa[i]] = classes - 1
  }
  for (let k = 1; classes < n; k <<= 1) {
    let p = 0
    for (let i = n - k; i < n; i += 1) sa2[p++] = i
    for (let i = 0; i < n; i += 1) if (sa[i] >= k) sa2[p++] = sa[i] - k
    count = new Int32Array(classes + 1)
    for (let i = 0; i < n; i += 1) count[rank[i]] += 1
    for (let i = 1; i <= classes; i += 1) count[i] += count[i - 1]
    for (let i = n - 1; i >= 0; i -= 1) sa[--count[rank[sa2[i]]]] = sa2[i]
    next[sa[0]] = 0
    classes = 1
    for (let i = 1; i < n; i += 1) {
      const a = sa[i]
      const b = sa[i - 1]
      const ra = a + k < n ? rank[a + k] : -1
      const rb = b + k < n ? rank[b + k] : -1
      if (rank[a] !== rank[b] || ra !== rb) classes += 1
      next[a] = classes - 1
    }
    ;[rank, next] = [next, rank]
  }
  return sa
}

/** Kasai. lcp[i] = sa[i]과 sa[i-1]의 공통 접두 길이. */
function lcpArray(s: Int32Array, sa: Int32Array): Int32Array {
  const n = s.length
  const rank = new Int32Array(n)
  const lcp = new Int32Array(n)
  for (let i = 0; i < n; i += 1) rank[sa[i]] = i
  let h = 0
  for (let i = 0; i < n; i += 1) {
    if (rank[i] > 0) {
      const j = sa[rank[i] - 1]
      while (i + h < n && j + h < n && s[i + h] === s[j + h]) h += 1
      lcp[rank[i]] = h
      if (h > 0) h -= 1
    } else {
      h = 0
    }
  }
  return lcp
}

// ===== 본체 =====

interface Candidate {
  /** 토큰 수. */
  length: number
  /** 접미사 배열에서 이 후보가 나타나는 구간 [lo, hi]. */
  lo: number
  hi: number
  bytes: number
  score: number
}

export function subroutinizeCharStrings(input: readonly Uint8Array[], options: SubroutinizeOptions = {}): SubroutinizedCharStrings {
  const maxCandidates = options.maxCandidates ?? 200_000

  // 1 · 2. 연산자 최적화 → 토큰 id
  const tokenIdOf = new Map<number, number>()
  const tokenBytes: number[][] = []
  const programs = input.map((bytes) => specializeCharString(bytes))
  const glyphTokens = programs.map((program) => Int32Array.from(program, (element) => {
    let id = tokenIdOf.get(element)
    if (id === undefined) {
      id = tokenBytes.length
      tokenIdOf.set(element, id)
      tokenBytes.push(programElementBytes(element))
    }
    return id
  }))
  const alphabet = tokenBytes.length

  // 전체 토큰 열. 글리프 끝마다 고유 구분자를 둬 글리프를 넘는 반복을 막는다.
  const total = glyphTokens.reduce((sum, tokens) => sum + tokens.length + 1, 0)
  const seq = new Int32Array(total)
  const glyphStart = new Int32Array(glyphTokens.length)
  {
    let p = 0
    glyphTokens.forEach((tokens, index) => {
      glyphStart[index] = p
      seq.set(tokens, p)
      p += tokens.length
      seq[p++] = alphabet + index
    })
  }
  const byteLength = (id: number) => (id < alphabet ? tokenBytes[id].length : 0)
  const prefixBytes = new Float64Array(total + 1)
  for (let i = 0; i < total; i += 1) prefixBytes[i + 1] = prefixBytes[i] + byteLength(seq[i])

  // 3. 후보: LCP 구간마다 (길이, 나타나는 구간)
  const sa = suffixArray(seq, alphabet + glyphTokens.length)
  const lcp = lcpArray(seq, sa)
  let candidates: Candidate[] = []
  {
    const stack: Array<{ h: number; lo: number }> = [{ h: 0, lo: 0 }]
    for (let i = 1; i <= total; i += 1) {
      const h = i < total ? lcp[i] : 0
      let lo = i - 1
      while (stack.length > 0 && stack[stack.length - 1].h > h) {
        const top = stack.pop()!
        lo = top.lo
        const frequency = i - top.lo
        const bytes = prefixBytes[sa[top.lo] + top.h] - prefixBytes[sa[top.lo]]
        const score = frequency * (bytes - 3) - (bytes + 1 + 3)
        if (score > 0) candidates.push({ length: top.h, lo: top.lo, hi: i - 1, bytes, score })
      }
      if (stack.length === 0 || stack[stack.length - 1].h < h) stack.push({ h, lo })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  if (candidates.length > maxCandidates) candidates = candidates.slice(0, maxCandidates)
  const candidateCount = candidates.length

  // 자리마다 거기서 시작하는 후보(연결 리스트)
  let markCount = 0
  for (const candidate of candidates) markCount += candidate.hi - candidate.lo + 1
  const head = new Int32Array(total).fill(-1)
  const nextMark = new Int32Array(markCount)
  const markCandidate = new Int32Array(markCount)
  {
    let m = 0
    candidates.forEach((candidate, ci) => {
      for (let k = candidate.lo; k <= candidate.hi; k += 1) {
        const position = sa[k]
        markCandidate[m] = ci
        nextMark[m] = head[position]
        head[position] = m
        m += 1
      }
    })
  }

  // 4. 글리프마다 DP
  const alive = new Uint8Array(candidateCount).fill(1)
  let usage = new Int32Array(candidateCount)
  let choice: Int32Array[] = []
  let callCost = new Float64Array(candidateCount)
  const runDp = (cost: Float64Array) => {
    usage = new Int32Array(candidateCount)
    choice = []
    for (let gi = 0; gi < glyphTokens.length; gi += 1) {
      const start = glyphStart[gi]
      const n = glyphTokens[gi].length
      const dp = new Float64Array(n + 1)
      const pick = new Int32Array(n).fill(-1)
      for (let i = n - 1; i >= 0; i -= 1) {
        let best = byteLength(seq[start + i]) + dp[i + 1]
        let bestCandidate = -1
        for (let m = head[start + i]; m !== -1; m = nextMark[m]) {
          const ci = markCandidate[m]
          if (!alive[ci]) continue
          const c = cost[ci] + dp[i + candidates[ci].length]
          if (c < best) { best = c; bestCandidate = ci }
        }
        dp[i] = best
        pick[i] = bestCandidate
      }
      for (let i = 0; i < n;) {
        const ci = pick[i]
        if (ci >= 0) { usage[ci] += 1; i += candidates[ci].length } else i += 1
      }
      choice.push(pick)
    }
  }
  /** 많이 쓰는 순으로 번호를 매기고 번호 길이로 호출 비용을 정한다. `ids`를 제자리 정렬한다. */
  const rankCosts = (ids: number[], use: ArrayLike<number>) => {
    ids.sort((a, b) => use[b] - use[a])
    const bias = biasOf(ids.length)
    callCost = new Float64Array(candidateCount).fill(numberBytes(ids.length - bias) + 1)
    ids.forEach((ci, index) => { callCost[ci] = numberBytes(index - bias) + 1 })
  }

  let estimate = Float64Array.from(candidates, (candidate) => candidate.hi - candidate.lo + 1)
  for (let round = 0; round < MARKET_ROUNDS; round += 1) {
    const ids: number[] = []
    for (let ci = 0; ci < candidateCount; ci += 1) if (estimate[ci] > 0) ids.push(ci)
    rankCosts(ids, estimate)
    const effective = new Float64Array(candidateCount)
    for (let ci = 0; ci < candidateCount; ci += 1) effective[ci] = callCost[ci] + (candidates[ci].bytes + SUBR_OVERHEAD) / Math.max(estimate[ci], 1)
    runDp(effective)
    estimate = Float64Array.from(usage)
  }
  let order: number[] = []
  for (let round = 0; round < PRUNE_ROUNDS; round += 1) {
    order = []
    for (let ci = 0; ci < candidateCount; ci += 1) {
      if (!alive[ci]) continue
      const net = usage[ci] * (candidates[ci].bytes - callCost[ci]) - (candidates[ci].bytes + SUBR_OVERHEAD)
      if (usage[ci] === 0 || net <= 0) alive[ci] = 0
      else order.push(ci)
    }
    rankCosts(order, usage)
    if (order.length > MAX_SUBRS) {
      for (const ci of order.slice(MAX_SUBRS)) alive[ci] = 0
      order = order.slice(0, MAX_SUBRS)
      rankCosts(order, usage)
    }
    runDp(callCost)
  }
  // 마지막 DP에서 안 쓰인 서브루틴도 번호 자리는 남긴다(번호가 바뀌면 호출 비용이 어긋난다).

  const bias = biasOf(order.length)
  const indexOf = new Int32Array(candidateCount).fill(-1)
  order.forEach((ci, index) => { indexOf[ci] = index })

  // 5. 중첩: 짧은 것부터 몸통을 DP로 다시 쓴다. 더 짧은 것만 부르므로 순환이 없다.
  const depth = new Int32Array(candidateCount)
  const bodyOf = new Map<number, Uint8Array>()
  for (const ci of [...order].sort((a, b) => candidates[a].length - candidates[b].length)) {
    const start = sa[candidates[ci].lo]
    const n = candidates[ci].length
    const dp = new Float64Array(n + 1)
    const pick = new Int32Array(n).fill(-1)
    for (let i = n - 1; i >= 0; i -= 1) {
      let best = byteLength(seq[start + i]) + dp[i + 1]
      let bestCandidate = -1
      for (let m = head[start + i]; m !== -1; m = nextMark[m]) {
        const cj = markCandidate[m]
        const length = candidates[cj].length
        if (indexOf[cj] < 0 || length >= n || i + length > n || depth[cj] >= MAX_SUBR_DEPTH) continue
        const c = callCost[cj] + dp[i + length]
        if (c < best) { best = c; bestCandidate = cj }
      }
      dp[i] = best
      pick[i] = bestCandidate
    }
    const out: number[] = []
    let childDepth = 0
    for (let i = 0; i < n;) {
      const cj = pick[i]
      if (cj >= 0) {
        pushNumber(indexOf[cj] - bias, out)
        out.push(CALLGSUBR)
        childDepth = Math.max(childDepth, depth[cj])
        i += candidates[cj].length
      } else {
        out.push(...tokenBytes[seq[start + i]])
        i += 1
      }
    }
    out.push(RETURN)
    depth[ci] = childDepth + 1
    bodyOf.set(ci, Uint8Array.from(out))
  }
  const globalSubrs = order.map((ci) => bodyOf.get(ci)!)

  const charStrings = glyphTokens.map((tokens, gi) => {
    const pick = choice[gi]
    const out: number[] = []
    for (let i = 0; i < tokens.length;) {
      const ci = pick[i]
      if (ci >= 0) {
        pushNumber(indexOf[ci] - bias, out)
        out.push(CALLGSUBR)
        i += candidates[ci].length
      } else {
        out.push(...tokenBytes[tokens[i]])
        i += 1
      }
    }
    out.push(ENDCHAR)
    return Uint8Array.from(out)
  })

  // 6. 확인: 서브루틴을 풀어 펼친 바이트가 연산자 최적화 결과와 같아야 한다.
  programs.forEach((program, gi) => {
    const expected: number[] = []
    for (const element of program) expected.push(...programElementBytes(element))
    expected.push(ENDCHAR)
    const actual = expandSubroutines(charStrings[gi], globalSubrs)
    if (actual.length !== expected.length || actual.some((b, i) => b !== expected[i])) {
      throw new Error(`서브루틴을 풀어 보니 글리프 ${gi}가 다르다`)
    }
  })

  return { charStrings, globalSubrs }
}

/** 서브루틴 호출을 몸통으로 바꿔 펼친다. 번호 수는 바로 앞 숫자다. */
export function expandSubroutines(charString: Uint8Array, globalSubrs: readonly Uint8Array[], depth = 0): number[] {
  if (depth > MAX_SUBR_DEPTH + 1) throw new Error('서브루틴 깊이 한도를 넘었다')
  const bias = biasOf(globalSubrs.length)
  const out: number[] = []
  let lastNumber: { value: number; size: number } | null = null
  let at = 0
  while (at < charString.length) {
    const b0 = charString[at]
    if (b0 >= 32 || b0 === 28) {
      const [value, size] = readNumber(charString, at)
      out.push(...charString.subarray(at, at + size))
      lastNumber = { value, size }
      at += size
      continue
    }
    if (b0 === CALLGSUBR) {
      if (!lastNumber) throw new Error('서브루틴 번호가 없다')
      out.length -= lastNumber.size
      const body = globalSubrs[lastNumber.value + bias]
      if (!body) throw new Error(`없는 서브루틴 ${lastNumber.value + bias}`)
      if (body[body.length - 1] !== RETURN) throw new Error('서브루틴이 return으로 끝나지 않는다')
      out.push(...expandSubroutines(body.subarray(0, body.length - 1), globalSubrs, depth + 1))
    } else if (b0 === RETURN) {
      throw new Error('서브루틴 중간에 return이 있다')
    } else {
      out.push(b0)
    }
    lastNumber = null
    at += 1
  }
  return out
}

// ===== Worker 주고받기 =====

/** Uint8Array 여러 개를 한 버퍼로. Worker에 넘길 때 복사 없이 옮긴다. */
export interface PackedUint8Arrays {
  bytes: Uint8Array
  /** items[i] = bytes[offsets[i], offsets[i + 1]) */
  offsets: Uint32Array
}

export function packUint8Arrays(items: readonly Uint8Array[]): PackedUint8Arrays {
  const offsets = new Uint32Array(items.length + 1)
  items.forEach((item, index) => { offsets[index + 1] = offsets[index] + item.length })
  const bytes = new Uint8Array(offsets[items.length])
  items.forEach((item, index) => bytes.set(item, offsets[index]))
  return { bytes, offsets }
}

export function unpackUint8Arrays({ bytes, offsets }: PackedUint8Arrays): Uint8Array[] {
  const items: Uint8Array[] = []
  for (let i = 0; i + 1 < offsets.length; i += 1) items.push(bytes.subarray(offsets[i], offsets[i + 1]))
  return items
}
