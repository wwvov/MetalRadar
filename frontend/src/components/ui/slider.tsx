"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      step={step}
      className={cn(
        "relative flex w-full touch-none items-center select-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-200"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-emerald-500"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className={cn(
          "block size-4 shrink-0 rounded-full border border-slate-300 bg-white shadow-sm transition-colors",
          "hover:bg-slate-50 hover:border-slate-400",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
