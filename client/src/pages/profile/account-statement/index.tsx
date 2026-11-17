import { useCallback, useEffect, useState } from "react";
import { getPortalAccountStatement } from "@/lib/api";
import { QuickLinksButton } from "./QuickLinksButton";
import { StatementFilters } from "./StatementFilters";
import { StatementTable } from "./StatementTable";
import type { StatementLink, StatementOrder, StatementTotals } from "./types";
import { computeStatementTotals, filterStatementOrders, formatMoney } from "./types";
import { YearNavigation } from "./YearNavigation";
import "./account-statement.css";

const DEFAULT_YEAR = new Date().getFullYear();
const DEFAULT_MONTH = new Date().getMonth() + 1;

export default function AccountStatement() {
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [activeYear, setActiveYear] = useState(DEFAULT_YEAR);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [links, setLinks] = useState<StatementLink[]>([]);
  const [orders, setOrders] = useState<StatementOrder[]>([]);
  const [totals, setTotals] = useState<StatementTotals | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyResults = useCallback(
    (rawOrders: StatementOrder[], nextYear: number, nextMonth: number | null) => {
      const filtered = filterStatementOrders(rawOrders, nextYear, nextMonth ?? undefined);
      setOrders(filtered);
      setTotals(filtered.length ? computeStatementTotals(filtered) : { grand_total: 0, balance: 0 });
      setActiveYear(nextYear);
      setActiveMonth(nextMonth);
      setYear(nextYear);
      if (nextMonth) setMonth(nextMonth);
      if (filtered.length) {
        setSelectedId((prev) => (prev && filtered.some((o) => o.id === prev) ? prev : filtered[0].id));
      } else {
        setSelectedId(null);
      }
    },
    [],
  );

  const loadStatement = useCallback(
    async (nextYear: number, nextMonth: number | null) => {
      try {
        setLoading(true);
        setError(null);
        const res = await getPortalAccountStatement({
          year: nextYear,
          month: nextMonth ?? undefined,
        });
        if (!res.status || !res.data) {
          setError(res.msg || "Unable to load account statement");
          setOrders([]);
          setTotals(null);
          return;
        }
        const data = res.data;
        setYears(data.years?.length ? data.years : [nextYear]);
        setLinks(data.statement_links || []);
        applyResults(data.orders || [], nextYear, nextMonth);
      } catch (err) {
        console.error(err);
        setError("Unable to load account statement");
        setOrders([]);
        setTotals(null);
      } finally {
        setLoading(false);
      }
    },
    [applyResults],
  );

  useEffect(() => {
    void loadStatement(DEFAULT_YEAR, null);
  }, [loadStatement]);

  const handleSubmit = () => {
    void loadStatement(year, month);
  };

  const handleYearSelect = (nextYear: number) => {
    void loadStatement(nextYear, null);
  };

  const handleYearChange = (nextYear: number) => {
    setYear(nextYear);
  };

  const handleMonthChange = (nextMonth: number) => {
    setMonth(nextMonth);
  };

  return (
    <div className="acct-stmt-page">
      <div className="acct-stmt-top">
        <div className="acct-stmt-top-left">
          <h1 className="acct-stmt-title">
            <span className="acct-stmt-title-text">ACCOUNT STATEMENT</span>
          </h1>
          <YearNavigation
            years={years.length ? years : [activeYear]}
            activeYear={activeYear}
            links={links}
            onYearSelect={handleYearSelect}
          />
        </div>
        <QuickLinksButton />
      </div>

      <StatementFilters
        month={month}
        year={year}
        years={years.length ? years : [year]}
        loading={loading}
        onMonthChange={handleMonthChange}
        onYearChange={handleYearChange}
        onSubmit={handleSubmit}
      />

      {error ? <p className="acct-stmt-error">{error}</p> : null}

      <StatementTable
        orders={orders}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loading}
      />

      {totals && orders.length > 0 ? (
        <div className="acct-stmt-totals">
          <span>
            {activeMonth
              ? `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][activeMonth - 1]} ${activeYear}`
              : `Year ${activeYear}`}
          </span>
          <span>Grand Total: {formatMoney(totals.grand_total)}</span>
          <span>Balance: {formatMoney(totals.balance)}</span>
        </div>
      ) : null}
    </div>
  );
}
