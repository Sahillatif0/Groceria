import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../../context/AppContext";

const AdminProducts = () => {
  const { axios, currency } = UseAppContext();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/admin/products", {
        params: { includeArchived: true },
      });
      if (data.success) {
        setProducts(data.products ?? []);
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
    fetchProducts();
  }, []);

  const toggleStock = async (productId, inStock) => {
    try {
      await axios.post("/api/product/stock", { id: productId, inStock });
      toast.success("Stock updated");
      fetchProducts();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const archiveProduct = async (productId, hard = false) => {
    const confirmText = hard
      ? "Permanently delete this product? This action cannot be undone."
      : "Archive this product? It will be hidden from customers.";

    if (!window.confirm(confirmText)) {
      return;
    }

    try {
      await axios.delete(`/api/admin/products/${productId}`, {
        params: hard ? { hard: true } : {},
      });
      toast.success(hard ? "Product deleted" : "Product archived");
      fetchProducts();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Products</h1>
        <p className="text-sm text-gray-500">Monitor storefront inventory.</p>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">Loading products…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Product
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Pricing
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Availability
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map((product) => (
                <tr key={product.id || product._id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{product.name}</div>
                    <div className="text-xs text-gray-500 capitalize">
                      {product.category}
                    </div>
                    {product.isArchived && (
                      <div className="mt-1 text-xs text-red-500">Archived</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      {currency}
                      {product.offerPrice}
                    </div>
                    <div className="text-xs text-gray-500 line-through">
                      {currency}
                      {product.price}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={product.inStock}
                        onChange={(event) =>
                          toggleStock(product.id || product._id, event.target.checked)
                        }
                        disabled={product.isArchived}
                      />
                      <span className="text-xs text-gray-600">
                        {product.inStock ? "In stock" : "Out of stock"}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {!product.isArchived && (
                      <button
                        onClick={() => archiveProduct(product.id || product._id, false)}
                        className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                      >
                        Archive
                      </button>
                    )}
                    <button
                      onClick={() => archiveProduct(product.id || product._id, true)}
                      className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    No products available.
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

export default AdminProducts;
