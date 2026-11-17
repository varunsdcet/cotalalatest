import { StatementRow } from "./StatementRow";
import type { StatementOrder } from "./types";

type Props = {
  orders: StatementOrder[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading?: boolean;
};

export function StatementTable({ orders, selectedId, onSelect, loading }: Props) {
  return (
    <div className="acct-stmt-table-wrap">
      <table className="acct-stmt-table">
        <thead>
          <tr>
            <th className="acct-stmt-col-id">OrderID</th>
            <th className="acct-stmt-col-status">Status</th>
            <th className="acct-stmt-col-date">Date</th>
            <th className="acct-stmt-col-summary">Summary</th>
            <th className="acct-stmt-col-total">Total</th>
            <th className="acct-stmt-col-balance">Balance</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="acct-stmt-empty">
                Loading statement…
              </td>
            </tr>
          ) : orders.length === 0 ? (
            <tr>
              <td colSpan={6} className="acct-stmt-empty">
                No orders found for this period.
              </td>
            </tr>
          ) : (
            orders.map((order, index) => (
              <StatementRow
                key={order.id}
                order={order}
                index={index}
                selected={selectedId === order.id}
                onSelect={onSelect}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
