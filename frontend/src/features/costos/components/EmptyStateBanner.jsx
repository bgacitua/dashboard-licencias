import { Info } from 'lucide-react'

export function EmptyStateBanner({ message }) {
  if (!message) return null
  return (
    <div className="cx-banner flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
      <Info className="size-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
