import { flexRender } from '@tanstack/react-table'
import type { Column, Row, RowData, Table as TableInstance } from '@tanstack/react-table'
import type { HTMLAttributes, ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** 머리 · 칸에 같이 붙는 클래스(너비 · 정렬). */
    className?: string
  }
}

/** shadcn 데이터 표. TanStack 표를 받아 그린다 — 거르기 · 정렬 · 쪽 나누기는 부르는 쪽 표가 한다. */
export function DataTable<T>({ table, empty, onRowClick, rowProps }: {
  table: TableInstance<T>
  empty: ReactNode
  onRowClick?: (row: T) => void
  rowProps?: (row: Row<T>) => HTMLAttributes<HTMLTableRowElement> & Record<`data-${string}`, string | boolean | undefined>
}) {
  const rows = table.getRowModel().rows
  return <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
    <Table>
      <TableHeader className="bg-surface-2">
        {table.getHeaderGroups().map((group) => <TableRow key={group.id} className="hover:bg-transparent">
          {group.headers.map((header) => <TableHead key={header.id} className={header.column.columnDef.meta?.className}>
            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          </TableHead>)}
        </TableRow>)}
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <TableRow className="hover:bg-transparent">
          <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center text-text-dim-5">{empty}</TableCell>
        </TableRow>}
        {rows.map((row) => {
          const extra = rowProps?.(row) ?? {}
          return <TableRow
            key={row.id}
            {...extra}
            className={cn(onRowClick && 'cursor-pointer', extra.className)}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
          >
            {row.getVisibleCells().map((cell) => <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>)}
          </TableRow>
        })}
      </TableBody>
    </Table>
  </div>
}

/** 누르면 오름 → 내림 → 원래 순서로 도는 머리. */
export function SortableHeader<T>({ column, children }: { column: Column<T>; children: ReactNode }) {
  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown
  return <button
    type="button"
    className="-ml-2 inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 font-semibold transition-colors hover:bg-surface-3 hover:text-foreground"
    onClick={column.getToggleSortingHandler()}
    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
  >
    {children}
    <Icon className={cn('size-3.5', !sorted && 'opacity-50')} />
  </button>
}

const PAGE_SIZES = [10, 20, 50]

/** 표 아래 쪽 넘기기. `n명 중 1–20` · 쪽당 줄 수 · 쪽 번호 · 처음/이전/다음/끝. */
export function DataTablePagination<T>({ table, unit }: { table: TableInstance<T>; unit: string }) {
  const { pageIndex, pageSize } = table.getState().pagination
  const total = table.getPrePaginationRowModel().rows.length
  const from = total === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min(total, (pageIndex + 1) * pageSize)
  const pages = Math.max(1, table.getPageCount())
  return <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm text-text-dim-4" data-testid="admin-pagination">
    <span className="tabular-nums">{total}{unit} 중 {from}–{to}</span>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">쪽당</span>
        <Select value={String(pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
          <SelectTrigger className="h-8 w-[4.5rem]" aria-label="쪽당 줄 수"><SelectValue /></SelectTrigger>
          <SelectContent side="top">
            {PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <span className="tabular-nums text-text-dim-3">{pageIndex + 1} / {pages}쪽</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="hidden size-8 sm:inline-flex" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} aria-label="첫 쪽"><ChevronsLeft /></Button>
        <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="이전 쪽"><ChevronLeft /></Button>
        <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="다음 쪽"><ChevronRight /></Button>
        <Button variant="outline" size="icon" className="hidden size-8 sm:inline-flex" onClick={() => table.setPageIndex(pages - 1)} disabled={!table.getCanNextPage()} aria-label="끝 쪽"><ChevronsRight /></Button>
      </div>
    </div>
  </div>
}
