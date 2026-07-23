"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

/**
 * Sonner toast container.
 *
 * We deliberately do NOT use `next-themes` here — our theme system uses a
 * custom ThemeManager + an inline SSR script (see layout.tsx) that sets
 * <html class="dark"> before React hydrates. Sonner reads the resolved
 * theme from the `data-theme` attribute on <html>, which we also set.
 *
 * Theme is resolved from the documentElement's class list so it stays in
 * sync with the custom ThemeManager without needing a React context.
 */
function useResolvedTheme(): ToasterProps["theme"] {
  // SSR-safe: default to "system"; on the client we read the actual <html> class.
  if (typeof document === "undefined") return "system";
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      richColors
      closeButton
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
