import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-white/10 bg-white/[0.07] text-foreground shadow-sm hover:bg-white/[0.14] hover:border-white/20 hover:shadow-md",
        primary:
          "border-violet-500/30 bg-violet-600 text-white shadow-md shadow-violet-500/20 hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98]",
        outline:
          "border-border bg-transparent text-foreground shadow-sm hover:bg-muted hover:border-white/20 hover:shadow-md dark:border-white/10",
        secondary:
          "border-white/8 bg-white/[0.04] text-secondary-foreground shadow-sm hover:bg-white/[0.1] hover:border-white/15",
        ghost:
          "border-transparent bg-transparent text-violet-400 hover:bg-violet-500/15 hover:text-violet-300 hover:border-violet-500/20",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive shadow-sm hover:bg-destructive/20 hover:border-destructive/40",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5 text-base",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
