import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../../context/AppContext";

const AdminProducts = () => {
  const { axios, currency } = UseAppContext();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    description: "",
    price: "",
    offerPrice: "",
    inStock: true,
  });
  const [saving, setSaving] = useState(false);

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

  const categoryOptions = useMemo(() => {
    const unique = new Set(products.map((product) => product.category).filter(Boolean));
    return Array.from(unique);
  }, [products]);

  const toggleStock = async (productId, inStock) => {
    try {
      await axios.post("/api/product/stock", { id: productId, inStock });
      toast.success("Stock updated");
      fetchProducts();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const openEditor = (product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name ?? "",
      category: product.category ?? "",
      description: Array.isArray(product.description)
        ? product.description.join("\n")
        : product.description ?? "",
      price: product.price ?? "",
      offerPrice: product.offerPrice ?? "",
      inStock: Boolean(product.inStock),
    });
  };

  const closeEditor = () => {
    if (saving) {
      return;
    }
    setEditingProduct(null);
    setEditForm({
      name: "",
      category: "",
      description: "",
      price: "",
      offerPrice: "",
      inStock: true,
    });
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (!editingProduct || saving) {
      return;
    }

    const trimmedName = editForm.name.trim();
    const trimmedCategory = editForm.category.trim();

    if (!trimmedName) {
      toast.error("Product name is required");
      return;
    }

    if (!trimmedCategory) {
      toast.error("Category is required");
      return;
    }

    setSaving(true);
    try {
      const productId = editingProduct.id || editingProduct._id;
      const payload = {
        name: trimmedName,
        category: trimmedCategory,
        description: editForm.description,
        price: editForm.price,
        offerPrice: editForm.offerPrice,
        inStock: editForm.inStock,
      };

      await axios.patch(`/api/product/${productId}`, payload);
      toast.success("Product updated");
      await fetchProducts();
      setEditingProduct(null);
      setEditForm({
        name: "",
        category: "",
        description: "",
        price: "",
        offerPrice: "",
        inStock: true,
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      setSaving(false);
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
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {!product.isArchived && (
                        <button
                          onClick={() => openEditor(product)}
                          className="rounded border border-primary/40 px-3 py-1 text-xs text-primary hover:bg-primary/10"
                        >
                          Edit
                        </button>
                      )}
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
                    </div>
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
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-10">
          <div className="absolute inset-0" onClick={closeEditor} aria-hidden="true"></div>
          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Edit product
                </p>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingProduct.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="text-sm text-gray-400 transition hover:text-gray-600"
                disabled={saving}
              >
                Close
              </button>
            </div>
            <form onSubmit={submitEdit} className="flex flex-col gap-4 px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">Product name</span>
                  <input
                    value={editForm.name}
                    onChange={(event) => handleEditChange("name", event.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Update product title"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">Category</span>
                  <input
                    value={editForm.category}
                    onChange={(event) => handleEditChange("category", event.target.value)}
                    list="admin-category-options"
                    className="rounded-lg border border-gray-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Category"
                    required
                  />
                  <datalist id="admin-category-options">
                    {categoryOptions.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">Description</span>
                <textarea
                  value={editForm.description}
                  onChange={(event) => handleEditChange("description", event.target.value)}
                  rows={4}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Use new lines for bullet points"
                ></textarea>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">Full price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.price}
                    onChange={(event) => handleEditChange("price", event.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">Offer price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.offerPrice}
                    onChange={(event) => handleEditChange("offerPrice", event.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={editForm.inStock}
                  onChange={(event) => handleEditChange("inStock", event.target.checked)}
                  className="h-4 w-4"
                />
                <span>Available for purchase</span>
              </label>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-secondary-dull disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                      Saving...
                    </span>
                  ) : (
                    "Save changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
