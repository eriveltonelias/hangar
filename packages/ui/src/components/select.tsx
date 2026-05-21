import * as React from "react";
import { cn } from "../lib/utils";

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

export function Select({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("SelectTrigger must be used within Select");
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("SelectValue must be used within Select");
  return <span>{ctx.value || placeholder}</span>;
}

export function SelectContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(SelectContext);
  if (!ctx || !ctx.open) return null;
  return (
    <div
      className={cn(
        "absolute z-[200] mt-1 w-full overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-xl ring-1 ring-border/60",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("SelectItem must be used within Select");
  return (
    <button
      type="button"
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        ctx.value === value && "bg-accent text-accent-foreground",
      )}
      onClick={() => {
        ctx.onValueChange(value);
        ctx.setOpen(false);
      }}
    >
      {children}
    </button>
  );
}
