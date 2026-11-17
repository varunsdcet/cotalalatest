import { cleanSummary, formatMoney, type StatementOrder } from "./types";

type Props = {
  order: StatementOrder;
  index: number;
  selected: boolean;
  onSelect: (id: number) => void;
};

export function StatementRow({ order, index, selected, onSelect }: Props) {
  const shade = index % 2 === 0 ? "even" : "odd";

  return (
    <tr
      className={`acct-stmt-row ${shade} ${selected ? "selected" : ""}`}
      onClick={() => onSelect(order.id)}
    >
      <td className="acct-stmt-cell acct-stmt-col-id">{order.id}</td>
      <td className="acct-stmt-cell acct-stmt-col-status">{order.status}</td>
      <td className="acct-stmt-cell acct-stmt-col-date">{order.date}</td>
      <td className="acct-stmt-cell acct-stmt-col-summary">{cleanSummary(order.summary)}</td>
      <td className="acct-stmt-cell acct-stmt-col-total">{formatMoney(order.total)}</td>
      <td className="acct-stmt-cell acct-stmt-col-balance">{formatMoney(order.balance)}</td>
    </tr>
  );
}
