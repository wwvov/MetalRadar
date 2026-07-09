import { useMemo, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ChevronDown, Building2, X, Check } from "lucide-react";
import { useWatchlist } from "@/providers/watchlist-context";

interface CompanySelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function CompanySelector({
  selectedIds,
  onChange,
}: CompanySelectorProps) {
  const { follows } = useWatchlist();
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedCompanies = useMemo(
    () => follows.filter((c) => selectedSet.has(c.id)),
    [follows, selectedSet]
  );

  const toggleCompany = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const clearAll = () => onChange([]);

  return (
    <div className="w-full">
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          className={cn(
            "group flex w-full min-h-9 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm transition-colors outline-none select-none",
            "hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "data-[popup-open]:border-ring data-[popup-open]:ring-3 data-[popup-open]:ring-ring/50",
            "dark:bg-input/30 dark:hover:bg-input/50"
          )}
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {selectedIds.length > 0 ? (
              <span className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                {selectedCompanies.slice(0, 3).map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-xs font-medium shrink-0"
                  >
                    {c.name}
                    <span
                      role="button"
                      aria-label={`移除 ${c.name}`}
                      className="hover:bg-emerald-200 rounded-sm -mr-1 p-0.5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(selectedIds.filter((id) => id !== c.id));
                      }}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  </span>
                ))}
                {selectedIds.length > 3 && (
                  <span className="text-xs text-slate-500 shrink-0">
                    等 {selectedIds.length} 家
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">请选择关注公司</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground shrink-0 transition-transform",
              open && "rotate-180"
            )}
          />
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            side="bottom"
            sideOffset={6}
            align="start"
            className="isolate z-50 w-(--anchor-width)"
          >
            <PopoverPrimitive.Popup
              className={cn(
                "relative isolate z-50 max-h-80 w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
                "origin-(--transform-origin) duration-100",
                "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
                "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
                "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
              )}
            >
              {/* 顶部操作栏 */}
              <div className="flex items-center justify-between border-b px-3 py-2 bg-slate-50/60">
                <span className="text-xs font-medium text-slate-600">
                  共 {follows.length} 家 · 已选 {selectedIds.length} 家
                </span>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={selectedIds.length === 0}
                  className="text-xs text-slate-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-slate-500"
                >
                  清空
                </button>
              </div>

              {/* 公司列表 */}
              {follows.length === 0 ? (
                <div className="flex items-center justify-center px-3 py-8 text-sm text-slate-500">
                  暂无关注公司，请先到「我的关注」添加企业。
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {follows.map((company) => {
                    const checked = selectedSet.has(company.id);
                    return (
                      <label
                        key={company.id}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm",
                          "hover:bg-slate-50",
                          checked && "bg-emerald-50/50"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleCompany(company.id)}
                        />
                        <span
                          className={cn(
                            "flex-1 truncate",
                            checked
                              ? "text-emerald-700 font-medium"
                              : "text-slate-700"
                          )}
                        >
                          {company.name}
                        </span>
                        <span className="text-xs text-slate-400 font-mono shrink-0">
                          {company.id}
                        </span>
                        {checked && (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}
