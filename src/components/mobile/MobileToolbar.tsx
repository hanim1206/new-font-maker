import { useUIStore } from '../../stores/uiStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Sliders, Eye, PanelBottom } from 'lucide-react'
import { NavMenu } from '../NavMenu'
import { SaveButton } from '../SaveButton'

export function MobileToolbar() {
  const {
    activeMobileDrawer,
    toggleMobileDrawer,
  } = useUIStore()

  return (
    <div className="shrink-0 flex items-center px-2 py-1.5 bg-surface border-t border-border-subtle pb-safe-b shadow-[0_-1px_12px_rgb(15_23_42_/_0.04)]">
      <NavMenu />
      <SaveButton />
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'min-w-touch min-h-touch',
            activeMobileDrawer === 'control' && 'bg-primary/20 text-primary'
          )}
          onClick={() => toggleMobileDrawer('control')}
          aria-label="리모콘 패널"
        >
          <PanelBottom className="h-5 w-5" />

        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'min-w-touch min-h-touch',
            activeMobileDrawer === 'preview' && 'bg-primary/20 text-primary'
          )}
          onClick={() => toggleMobileDrawer('preview')}
          aria-label="미리보기 패널"
        >
          <Eye className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'min-w-touch min-h-touch',
            activeMobileDrawer === 'inspector' && 'bg-primary/20 text-primary'
          )}
          onClick={() => toggleMobileDrawer('inspector')}
          aria-label="인스펙터 패널"
        >
          <Sliders className="h-5 w-5" />

        </Button>
      </div>
    </div>
  )
}
