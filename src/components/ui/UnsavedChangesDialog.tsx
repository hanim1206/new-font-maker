/**
 * 미저장 변경 경고 다이얼로그
 *
 * shadcn AlertDialog 기반. 3단계 선택: 저장 후 계속 / 저장하지 않고 계속 / 취소
 */
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface UnsavedChangesDialogProps {
  open: boolean
  onSaveAndContinue: () => void
  onDiscardAndContinue: () => void
  onCancel: () => void
  saving?: boolean
}

export function UnsavedChangesDialog({
  open,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
  saving = false,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>저장하지 않은 변경사항</AlertDialogTitle>
          <AlertDialogDescription>
            현재 작업에 저장하지 않은 변경사항이 있습니다.
            저장하시겠습니까?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            취소
          </Button>
          <Button
            variant="outline"
            onClick={onDiscardAndContinue}
            disabled={saving}
          >
            저장하지 않고 계속
          </Button>
          <Button onClick={onSaveAndContinue} disabled={saving}>
            {saving ? '저장 중...' : '저장 후 계속'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
