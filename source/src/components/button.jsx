import * as React from "react";
import { cn } from "@/lib/utils";

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
        {
          "bg-primary text-white hover:bg-primary/90 h-10 py-3 px-6": variant === "default", // Added padding for distance
          "bg-destructive text-white hover:bg-destructive/90 h-10 py-3 px-6": variant === "destructive", // Added padding for distance
          "border border-input hover:bg-accent hover:text-accent-foreground h-10 py-3 px-6": variant === "outline", // Added padding for distance
          "hover:bg-accent hover:text-accent-foreground h-10 py-3 px-6": variant === "ghost", // Added padding for distance
          "bg-secondary text-white hover:bg-secondary/80 h-10 py-3 px-6": variant === "secondary", // Added padding for distance
          "h-10": size === "default",
          "h-9 px-3 rounded-md": size === "sm",
          "h-11 px-8 rounded-md": size === "lg",
        },
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button };
