import { useUIStore } from '../../stores/uiStore'
import { GlobalQuickControls } from '../EditorPanel/GlobalQuickControls'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

export function MobileInspectorDrawer() {
  const { activeMobileDrawer, setActiveMobileDrawer } = useUIStore()

  return (
    <Sheet
      open={activeMobileDrawer === 'inspector'}
      onOpenChange={(open) => {
        if (!open) setActiveMobileDrawer(null)
      }}
    >
      <SheetContent side="bottom" className="max-h-[65dvh] overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0 px-4 pt-4">
          <SheetTitle>글로벌 스타일</SheetTitle>
          <SheetDescription>폰트 전체에 적용되는 스타일 컨트롤</SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <GlobalQuickControls vertical />
        </div>
      </SheetContent>
    </Sheet>
  )
}
