#!/usr/bin/env bash
# Vercel Ignored Build Step(`vercel.json`의 `ignoreCommand`). exit 0 = 빌드 건너뜀, exit 1 = 빌드.
# 멈춤 스위치: Vercel 환경 변수 `PAUSE_CLAUDE_PREVIEWS=1`이면 `claude/…` 브랜치 빌드만 건너뛴다.
# main · dev와 그 밖의 브랜치는 언제나 빌드한다. 한글날 배포 앞에 에이전트 빌드가 줄 서지 않게 하는 장치다.
if [ "${PAUSE_CLAUDE_PREVIEWS:-}" = "1" ]; then
  case "${VERCEL_GIT_COMMIT_REF:-}" in
    claude/*) echo "PAUSE_CLAUDE_PREVIEWS=1 — ${VERCEL_GIT_COMMIT_REF} 빌드 건너뜀"; exit 0 ;;
  esac
fi
exit 1
