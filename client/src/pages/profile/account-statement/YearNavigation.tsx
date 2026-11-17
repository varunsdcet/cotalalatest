import { Printer } from "lucide-react";
import type { StatementLink } from "./types";

type Props = {
  years: number[];
  activeYear: number;
  links: StatementLink[];
  onYearSelect: (year: number) => void;
};

export function YearNavigation({ years, activeYear, links, onYearSelect }: Props) {
  const linkForYear = (year: number) => links.find((l) => l.year === year)?.url;

  return (
    <nav className="acct-stmt-year-nav" aria-label="Statement years">
      {years.map((year) => {
        const printUrl = linkForYear(year);
        const active = year === activeYear;
        return (
          <div key={year} className={`acct-stmt-year-tab ${active ? "active" : ""}`}>
            {printUrl ? (
              <a
                href={printUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="acct-stmt-year-print"
                title={`Print ${year} statement`}
                onClick={(e) => e.stopPropagation()}
              >
                <Printer className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="acct-stmt-year-print muted">
                <Printer className="h-3.5 w-3.5" />
              </span>
            )}
            <button type="button" className="acct-stmt-year-btn" onClick={() => onYearSelect(year)}>
              {year}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
