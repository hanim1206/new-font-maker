#!/usr/bin/env bash
# 클라우드 세션이 시작될 때 의존성과 e2e 브라우저를 깐다(`.claude/settings.json`의 SessionStart 훅).
# 로컬에서는 아무것도 하지 않는다. 플랜 `docs/plans/2026-10-03_자동-개선-루프-세팅.md`.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# `npm ci`의 prepare가 `core.hooksPath`를 `.githooks`로 잡는다(pre-push 스모크).
[ -d node_modules ] || npm ci --no-audit --no-fund

# 클라우드에는 크롬이 없다. Playwright 내장 브라우저를 깔고 `E2E_CHANNEL=chromium`으로 돈다.
npx playwright install chromium >/dev/null 2>&1 || echo "[session-start] Playwright 브라우저를 못 깔았다 — e2e · 스모크는 돌지 않는다" >&2

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export E2E_CHANNEL=chromium' >> "$CLAUDE_ENV_FILE"
fi
exit 0
