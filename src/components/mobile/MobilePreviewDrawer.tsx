import { useUIStore } from '../../stores/uiStore'
import { PreviewPanel } from '../PreviewPanel/PreviewPanel'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

export function MobilePreviewDrawer() {
  const { activeMobileDrawer, setActiveMobileDrawer } = useUIStore()

  return (
    <Sheet
      open={activeMobileDrawer === 'preview'}
      onOpenChange={(open) => {
        if (!open) setActiveMobileDrawer(null)
      }}
    >
      <SheetContent side="bottom" className="h-[100dvh] overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0 px-4 pt-4">
          <SheetTitle>미리보기</SheetTitle>
          <SheetDescription>입력된 텍스트를 미리보기합니다</SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <PreviewPanel />
        </div>
      </SheetContent>
    </Sheet>
  )
}
