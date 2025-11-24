import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../../context/AppContext";

const ORDER_STATUSES = [
  "Order Placed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Cancelled by Admin",
];

const AdminOrders = () => {
  const { axios, currency } = UseAppContext();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const fetchOrders = async (include = includeCancelled) => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/admin/orders", {
        params: include ? { includeCancelled: true } : {},
      });
      if (data.success) {
        setOrders(data.orders ?? []);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [includeCancelled]);

  const updateStatus = async (orderId, status) => {
    try {
      await axios.patch(`/api/admin/orders/${orderId}/status`, { status });
      toast.success("Order updated");
      fetchOrders();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const cancelOrder = async (orderId, hard = false) => {
    const confirmText = hard
      ? "Permanently remove this order record?"
      : "Cancel this order? Payment will be marked as cancelled.";

    if (!window.confirm(confirmText)) {
      return;
    }

    try {
      await axios.delete(`/api/admin/orders/${orderId}`, {
        params: hard ? { hard: true } : {},
      });
      toast.success(hard ? "Order deleted" : "Order cancelled");
      fetchOrders();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-gray-500">Track fulfilment and payments.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={(event) => setIncludeCancelled(event.target.checked)}
          />
          Show cancelled
        </label>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">Loading orders…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Order
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Customer
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Amount
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((order) => {
                const isCancelled = order.status
                  .toLowerCase()
                  .includes("cancel");

                return (
                  <tr key={order.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{order.id}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {order.userId}
                    </td>
                    <td className="px-4 py-3">
                      {currency}
                      {order.amount}
                      <div className="text-xs text-gray-500">
                        {order.isPaid ? "Paid" : "Pending"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={order.status}
                        onChange={(event) =>
                          updateStatus(order.id, event.target.value)
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        {ORDER_STATUSES.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {statusOption}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => cancelOrder(order.id, false)}
                        className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isCancelled}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => cancelOrder(order.id, true)}
                        className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
