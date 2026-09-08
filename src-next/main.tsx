import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LAYOUT_PROFILE_MIGRATION_BACKUP_KEY,
  runLayoutProfileMigrationBootstrap,
} from '../src/services/layoutProfileMigrationBootstrap'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/utils/layoutCalculator'
import '../src/index.css'

const root = createRoot(document.getElementById('root')!)

async function start(): Promise<void> {
  if (window.location.pathname === '/reference-lab') {
    const { ReferenceLabPage } = await import('./ReferenceLabPage')
    root.render(<StrictMode><ReferenceLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/reference-group-lab') {
    const { ReferenceGroupLabPage } = await import('./ReferenceGroupLabPage')
    root.render(<StrictMode><ReferenceGroupLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/font-guide-lab') {
    const { FontGuideLabPage } = await import('./FontGuideLabPage')
    root.render(<StrictMode><FontGuideLabPage /></StrictMode>)
    return
  }

  if (window.location.pathname === '/five-guide-lab') {
    const { FiveGuideLabPage } = await import('./FiveGuideLabPage')
    root.render(<StrictMode><FiveGuideLabPage /></StrictMode>)
    return
  }

  const migration = runLayoutProfileMigrationBootstrap({
    storage: window.localStorage,
    defaultSchemas: DEFAULT_LAYOUT_SCHEMAS,
    presetProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
  })

  if (migration.status === 'blocked') {
    root.render(
      <StrictMode>
        <main role="alert" style={{ maxWidth: 560, margin: '20vh auto', padding: 24, lineHeight: 1.6 }}>
          <h1>레이아웃 데이터를 안전하게 보존했습니다</h1>
          <p>기존 데이터의 자동 이관을 완료하지 못해 편집 화면을 열지 않았습니다.</p>
          <p>{migration.message}</p>
          <p>충돌을 자동으로 해결하거나 어느 쪽 데이터도 임의로 선택하지 않았습니다.</p>
          <p>
            복구용 원본은 <code>{LAYOUT_PROFILE_MIGRATION_BACKUP_KEY}</code> 키에 보존되어 있습니다.
          </p>
        </main>
      </StrictMode>,
    )
    return
  }

  const { default: App } = await import('./App')
  root.render(<StrictMode><App /></StrictMode>)
}

void start()
