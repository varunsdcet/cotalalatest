export type StatementOrder = {
  id: number;
  status: string;
  date: string;
  summary: string;
  total: number;
  balance: number;
};

export type StatementLink = {
  year: number;
  url: string;
};

export type StatementTotals = {
  grand_total: number;
  balance: number;
};

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function filterStatementOrders(
  orders: StatementOrder[],
  year: number,
  month?: number,
): StatementOrder[] {
  return orders.filter((order) => {
    const match = order.date.match(/^(\d{4})\/(\d{1,2})\//);
    if (!match) return true;
    const orderYear = Number(match[1]);
    const orderMonth = Number(match[2]);
    if (orderYear !== year) return false;
    if (month && month >= 1 && month <= 12) return orderMonth === month;
    return true;
  });
}

export function computeStatementTotals(orders: StatementOrder[]): StatementTotals {
  return orders.reduce(
    (acc, order) => ({
      grand_total: acc.grand_total + order.total,
      balance: acc.balance + order.balance,
    }),
    { grand_total: 0, balance: 0 },
  );
}

export function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export function cleanSummary(summary: string) {
  return summary
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*$/g, "")
    .trim();
}
