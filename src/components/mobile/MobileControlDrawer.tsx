import { useUIStore } from '../../stores/uiStore'
import { ControlPanel } from '../ControlPanel/ControlPanel'
import { Sheet, SheetContent } from '@/components/ui/sheet'

export function MobileControlDrawer() {
  const { activeMobileDrawer, setActiveMobileDrawer } = useUIStore()

  return (
    <Sheet
      open={activeMobileDrawer === 'control'}
      onOpenChange={(open) => {
        if (!open) setActiveMobileDrawer(null)
      }}
    >
      <SheetContent side="bottom" className="h-[100dvh] overflow-hidden flex flex-col p-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ControlPanel />
        </div>
      </SheetContent>
    </Sheet>
  )
}
