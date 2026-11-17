import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export type FontOption = { id: number | string; family: string; category?: string };

const MAX_VISIBLE = 60;

export default function FontPicker({
  fonts,
  value,
  onChange,
  placeholder = "Choose a font",
}: {
  fonts: FontOption[];
  value: FontOption | null;
  onChange: (font: FontOption) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? fonts.filter((f) => f.family.toLowerCase().includes(q)) : fonts;
    return { total: list.length, visible: list.slice(0, MAX_VISIBLE) };
  }, [fonts, query]);

  return (
    <div className="ma-font-picker" ref={rootRef}>
      <button
        type="button"
        className="form-select ma-font-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={value ? "" : "text-white/50"}>{value?.family || placeholder}</span>
        <ChevronDown className="w-4 h-4 opacity-70" />
      </button>
      {open ? (
        <div className="ma-font-menu">
          <div className="ma-font-search">
            <Search className="w-4 h-4 opacity-60" />
            <input
              autoFocus
              value={query}
              placeholder={`Search ${fonts.length} fonts`}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul role="listbox">
            {matches.visible.map((font) => (
              <li key={String(font.id)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.family === font.family}
                  className={value?.family === font.family ? "active" : ""}
                  onClick={() => {
                    onChange(font);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span>{font.family}</span>
                  {font.category ? <small>{font.category}</small> : null}
                </button>
              </li>
            ))}
            {!matches.visible.length ? <li className="ma-font-empty">No fonts match “{query}”</li> : null}
          </ul>
          {matches.total > MAX_VISIBLE ? (
            <div className="ma-font-more">Showing {MAX_VISIBLE} of {matches.total} — type to narrow down</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
