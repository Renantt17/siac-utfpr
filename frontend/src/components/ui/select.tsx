import * as React from 'react'
import { cn } from '../../lib/utils'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'mt-1.5 flex h-10 w-full rounded-lg border border-siac-border bg-white px-3 py-2 text-sm text-utfpr-black outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-utfpr-yellow/40 disabled:cursor-not-allowed disabled:bg-gray-100',
      className
    )}
    {...props}
  />
))
Select.displayName = 'Select'
