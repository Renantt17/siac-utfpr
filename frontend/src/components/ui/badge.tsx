import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-800',
        warning: 'bg-yellow-100 text-yellow-900',
        success: 'bg-green-100 text-green-800',
        danger: 'bg-red-100 text-red-800',
        info: 'bg-blue-100 text-blue-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export function Alert({
  variant = 'info',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: 'info' | 'success' | 'warning' | 'danger' }) {
  const styles = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    success: 'border-green-200 bg-green-50 text-green-900',
    warning: 'border-yellow-300 bg-yellow-50 text-yellow-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
  }[variant]
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg border p-4 text-sm', styles, className)}
      {...props}
    />
  )
}
