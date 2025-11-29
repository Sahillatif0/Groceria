import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../../context/AppContext";

const AdminOverview = () => {
  const { axios } = UseAppContext();
  const [metrics, setMetrics] = useState({
    users: 0,
    inactiveUsers: 0,
    sellers: 0,
    activeSellers: 0,
    products: 0,
    archivedProducts: 0,
    orders: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        setLoading(true);
        const [usersRes, sellersRes, productsRes, ordersRes] = await Promise.all([
          axios.get("/api/admin/users"),
          axios.get("/api/admin/sellers"),
          axios.get("/api/admin/products", { params: { includeArchived: true } }),
          axios.get("/api/admin/orders"),
        ]);

        const usersList = usersRes.data.users ?? [];
        const sellersList = sellersRes.data.sellers ?? [];
        const productsList = productsRes.data.products ?? [];
        const ordersList = ordersRes.data.orders ?? [];

        setMetrics({
          users: usersList.length,
          inactiveUsers: usersList.filter((user) => user?.isActive === false).length,
          sellers: sellersList.length,
          activeSellers: sellersList.filter((seller) => seller.status === "active").length,
          products: productsList.filter((product) => product.isArchived === false).length,
          archivedProducts: productsList.filter((product) => product.isArchived === true).length,
          orders: ordersList.length,
        });
      } catch (error) {
        toast.error(error?.response?.data?.message || error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshot();
  }, [axios]);

  return (
    <div className="p-6 md:p-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Admin Overview</h1>
        <p className="text-sm text-gray-500">Quick glance at store health.</p>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">Loading metrics…</p>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Registered Users</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.users}</p>
            <p className="text-xs text-gray-400">
              {metrics.inactiveUsers} inactive
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Sellers</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.sellers}</p>
            <p className="text-xs text-gray-400">
              {metrics.activeSellers} active sellers
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Products</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.products}</p>
            <p className="text-xs text-gray-400">
              {metrics.archivedProducts} archived
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Orders</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.orders}</p>
            <p className="text-xs text-gray-400">All pending + fulfilled orders</p>
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminOverview;
