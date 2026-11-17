import { MONTHS } from "./types";

type Props = {
  month: number;
  year: number;
  years: number[];
  loading?: boolean;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onSubmit: () => void;
};

export function StatementFilters({
  month,
  year,
  years,
  loading,
  onMonthChange,
  onYearChange,
  onSubmit,
}: Props) {
  const yearOptions = years.length ? years : [year];

  return (
    <form
      className="acct-stmt-filters"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <select
        className="acct-stmt-select acct-stmt-select-month"
        value={month}
        onChange={(e) => onMonthChange(Number(e.target.value))}
        aria-label="Month"
      >
        {MONTHS.map((label, index) => (
          <option key={label} value={index + 1}>
            {label}
          </option>
        ))}
      </select>
      <select
        className="acct-stmt-select acct-stmt-select-year"
        value={year}
        onChange={(e) => onYearChange(Number(e.target.value))}
        aria-label="Year"
      >
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button type="submit" className="acct-stmt-submit" disabled={loading}>
        {loading ? "LOADING…" : "SUBMIT"}
      </button>
    </form>
  );
}
