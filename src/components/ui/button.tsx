"use client";

import { cn } from "@/lib/utils/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", isLoading, children, disabled, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center font-headline font-medium uppercase tracking-wide transition-all focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
          {
            // Primary - Electric Lime gradient
            "bg-primary-container text-on-primary rounded-md hover:bg-primary-dim active:scale-95":
              variant === "primary",
            // Secondary - Cyan container
            "bg-secondary-container text-on-secondary-container rounded-md hover:opacity-90 active:scale-95":
              variant === "secondary",
            // Tertiary - text only with underline on hover
            "text-primary bg-transparent hover:underline":
              variant === "tertiary",
            // Ghost - transparent with subtle bg on hover
            "text-on-surface-variant bg-transparent hover:bg-surface-container rounded-md":
              variant === "ghost",
          },
          {
            "px-3 py-1.5 text-xs": size === "sm",
            "px-5 py-2.5 text-sm": size === "md",
            "px-8 py-3.5 text-base": size === "lg",
          },
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
