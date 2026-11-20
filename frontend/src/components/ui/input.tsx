import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '../../lib/utils'

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('block text-sm font-semibold text-gray-800', className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'mt-1.5 flex h-10 w-full rounded-lg border border-siac-border bg-white px-3 py-2 text-sm text-utfpr-black outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-utfpr-yellow/40 disabled:cursor-not-allowed disabled:bg-gray-100',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'mt-1.5 flex w-full rounded-lg border border-siac-border bg-white px-3 py-2 text-sm text-utfpr-black outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-utfpr-yellow/40 disabled:cursor-not-allowed disabled:bg-gray-100',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
