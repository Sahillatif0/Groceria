import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../../context/AppContext";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Active", value: "active" },
  { label: "Suspended", value: "suspended" },
];

const AdminSellers = () => {
  const { axios } = UseAppContext();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    password: "",
    displayName: "",
    status: "pending",
  });

  const fetchSellers = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/admin/sellers");
      if (data.success) {
        setSellers(data.sellers ?? []);
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
    fetchSellers();
  }, []);

  const handleStatusChange = async (sellerId, status) => {
    try {
      await axios.patch(`/api/admin/sellers/${sellerId}/status`, { status });
      toast.success("Seller status updated");
      fetchSellers();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const handleDelete = async (sellerId) => {
    const confirmDelete = window.confirm(
      "Suspend this seller? Their access will be revoked."
    );
    if (!confirmDelete) return;

    try {
      await axios.delete(`/api/admin/sellers/${sellerId}`);
      toast.success("Seller suspended");
      fetchSellers();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      const { data } = await axios.post("/api/admin/sellers", formState);
      if (data?.credentials?.password) {
        toast.success(
          `Seller created. Temp password: ${data.credentials.password}`
        );
      } else {
        toast.success("Seller profile saved");
      }
      setFormState({ name: "", email: "", password: "", displayName: "", status: "pending" });
      fetchSellers();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Sellers</h1>
        <p className="text-sm text-gray-500">Review and manage seller access.</p>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">Create Seller</h2>
        <form onSubmit={handleCreate} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1 text-sm">
            <label className="font-medium">Full Name</label>
            <input
              value={formState.name}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, name: event.target.value }))
              }
              required
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="Jane Doe"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label className="font-medium">Email</label>
            <input
              type="email"
              value={formState.email}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, email: event.target.value }))
              }
              required
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="seller@example.com"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label className="font-medium">Temporary Password</label>
            <input
              type="text"
              value={formState.password}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, password: event.target.value }))
              }
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="Leave blank to auto-generate"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label className="font-medium">Display Name</label>
            <input
              value={formState.displayName}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, displayName: event.target.value }))
              }
              required
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="Storefront"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label className="font-medium">Status</label>
            <select
              value={formState.status}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, status: event.target.value }))
              }
              className="rounded border border-gray-300 px-3 py-2"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end justify-end md:col-span-2">
            <button
              type="submit"
              className="rounded bg-primary px-5 py-2 text-sm font-medium text-white shadow hover:bg-secondary-dull"
            >
              Save Seller
            </button>
          </div>
        </form>
      </section>

      {loading ? (
        <p className="text-sm text-gray-500">Loading sellers…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Seller
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Email
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
              {sellers.map((seller) => (
                <tr key={seller.sellerId}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">
                      {seller.displayName}
                    </div>
                    <div className="text-xs text-gray-500">
                      User: {seller.user?.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">{seller.user?.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                        seller.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : seller.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {seller.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {STATUS_OPTIONS.filter((option) => option.value !== seller.status).map(
                      (option) => (
                        <button
                          key={option.value}
                          onClick={() => handleStatusChange(seller.sellerId, option.value)}
                          className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                        >
                          Set {option.label}
                        </button>
                      )
                    )}
                    <button
                      onClick={() => handleDelete(seller.sellerId)}
                      className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Suspend
                    </button>
                  </td>
                </tr>
              ))}
              {sellers.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    No sellers yet.
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

export default AdminSellers;
