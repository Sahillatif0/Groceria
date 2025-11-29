import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../../context/AppContext";
import { categories as categoryOptions } from "../../assets/assets";

const EDIT_FORM_TEMPLATE = {
  name: "",
  category: "",
  description: "",
  price: "",
  offerPrice: "",
  inStock: true,
};

const MAX_IMAGES = 6;

const ProductList = () => {
  const { sellerProducts, currency, axios, fetchSellerProducts } = UseAppContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [viewMode, setViewMode] = useState("grid");
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState(() => ({ ...EDIT_FORM_TEMPLATE }));
  const [isSaving, setIsSaving] = useState(false);
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  const availableCategories = useMemo(() => {
    const unique = new Set(
      sellerProducts
        .map((product) => product.category)
        .filter((category) => typeof category === "string" && category.length > 0)
    );
    return Array.from(unique);
  }, [sellerProducts]);

  useEffect(() => {
    fetchSellerProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const releaseNewImagePreviews = (items) => {
    items.forEach((item) => {
      if (item?.preview) {
        URL.revokeObjectURL(item.preview);
      }
    });
  };

  const resetEditorState = () => {
    releaseNewImagePreviews(newImages);
    setNewImages([]);
    setExistingImages([]);
    setEditingProduct(null);
    setEditForm({ ...EDIT_FORM_TEMPLATE });
  };

  const toggleStock = async (id, inStock) => {
    try {
      const { data } = await axios.post("/api/product/stock", { id, inStock });
      if (data.success) {
        fetchSellerProducts();
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const openEditor = (product) => {
    releaseNewImagePreviews(newImages);
    setNewImages([]);
    setExistingImages(
      Array.isArray(product.image)
        ? product.image.filter(
            (url) => typeof url === "string" && url.trim().length > 0
          )
        : typeof product.image === "string" && product.image.trim().length > 0
        ? [product.image.trim()]
        : []
    );
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
    if (isSaving) {
      return;
    }
    resetEditorState();
  };

  const handleFormChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const removeExistingImage = (index) => {
    setExistingImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const removeNewImage = (index) => {
    setNewImages((prev) => {
      if (index < 0 || index >= prev.length) {
        return prev;
      }

      const target = prev[index];
      if (target?.preview) {
        URL.revokeObjectURL(target.preview);
      }

      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleNewImageSelect = (event) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }

    const currentCount = existingImages.length + newImages.length;
    const availableSlots = MAX_IMAGES - currentCount;

    if (availableSlots <= 0) {
      toast.error(`You can upload up to ${MAX_IMAGES} images per product.`);
      event.target.value = "";
      return;
    }

    const limitedFiles = files.slice(0, availableSlots);
    if (limitedFiles.length < files.length) {
      toast.error(`Only ${availableSlots} more image${availableSlots === 1 ? "" : "s"} allowed.`);
    }

    const mappedFiles = limitedFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setNewImages((prev) => [...prev, ...mappedFiles]);
    event.target.value = "";
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (!editingProduct || isSaving) {
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

    const filteredExistingImages = existingImages.filter(
      (url) => typeof url === "string" && url.trim().length > 0
    );

    const targetId = editingProduct._id || editingProduct.id;
    if (!targetId) {
      toast.error("Unable to identify product");
      return;
    }

    setIsSaving(true);
    try {
      const basePayload = {
        name: trimmedName,
        category: trimmedCategory,
        description: editForm.description,
        price: editForm.price,
        offerPrice: editForm.offerPrice,
        inStock: editForm.inStock,
        existingImages: filteredExistingImages,
      };

      const formData = new FormData();
      formData.append("productData", JSON.stringify(basePayload));
      newImages.forEach((item) => {
        if (item?.file) {
          formData.append("images", item.file);
        }
      });

      await axios.patch(`/api/product/${targetId}`, formData);

      toast.success("Product updated");
      await fetchSellerProducts();
      resetEditorState();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProduct = async (product) => {
    const productId = product?._id || product?.id;
    if (!productId) {
      toast.error("Unable to identify product");
      return;
    }

    const confirmation = window.confirm(
      `Remove "${product?.name ?? "this product"}" from your catalog?`
    );

    if (!confirmation) {
      return;
    }

    try {
      setDeletingId(productId);
      const { data } = await axios.delete(`/api/product/${productId}`);
      if (!data.success) {
        toast.error(data.message || "Unable to remove product");
        return;
      }

      toast.success(data.message || "Product removed");
      if (editingProduct && (editingProduct._id || editingProduct.id) === productId) {
        resetEditorState();
      }
      await fetchSellerProducts();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredProducts = useMemo(() => {
    return sellerProducts
      .filter((product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .filter((product) =>
        categoryFilter === "all" ? true : product.category === categoryFilter
      )
      .filter((product) => {
        if (stockFilter === "all") return true;
        return stockFilter === "in" ? product.inStock : !product.inStock;
      });
  }, [sellerProducts, searchTerm, categoryFilter, stockFilter]);

  const totalImages = existingImages.length + newImages.length;

  return (
    <div className="no-scrollbar flex-1 h-[95vh] overflow-y-auto bg-gray-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-10">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Inventory overview
            </p>
            <h1 className="text-2xl font-semibold text-gray-900 md:text-3xl">
              Your product catalog
            </h1>
            <p className="text-sm text-gray-500">
              Monitor availability, adjust pricing, and keep your storefront fresh.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-white px-4 py-2 text-xs text-primary">
            <span className="font-semibold">{filteredProducts.length}</span>
            products visible
          </div>
        </header>

        <section className="mt-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-4 md:items-center md:gap-4">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Search
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by product name"
                className="w-full bg-transparent py-2 text-sm text-gray-700 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Stock
            </label>
            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All</option>
              <option value="in">In stock</option>
              <option value="out">Out of stock</option>
            </select>
          </div>
        </section>

        <section className="mt-4 flex items-center justify-between rounded-full border border-gray-200 bg-white p-1 shadow-sm">
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setViewMode("grid")}
              type="button"
              className={`rounded-full px-4 py-2 transition ${
                viewMode === "grid"
                  ? "bg-primary text-white shadow"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Grid view
            </button>
            <button
              onClick={() => setViewMode("list")}
              type="button"
              className={`rounded-full px-4 py-2 transition ${
                viewMode === "list"
                  ? "bg-primary text-white shadow"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              List view
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Toggle view to match your workflow preference
          </p>
        </section>

        {filteredProducts.length === 0 ? (
          <section className="mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/70 px-6 py-12 text-center shadow-sm">
            <p className="text-lg font-semibold text-gray-800">
              No matching products yet
            </p>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              Refine your filters or add something new to your storefront to see it here.
            </p>
          </section>
        ) : viewMode === "grid" ? (
          <section className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <article
                key={product._id || product.id}
                className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="relative h-48 w-full overflow-hidden">
                  <img
                    src={product.image?.[0]}
                    alt={product.name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span
                    className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${
                      product.inStock
                        ? "bg-primary/90 text-white"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {product.inStock ? "In stock" : "Out of stock"}
                  </span>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary/70">
                      {product.category}
                    </p>
                    <h2 className="text-lg font-semibold text-gray-900" title={product.name}>
                      <span className="block max-h-14 overflow-hidden text-ellipsis">
                        {product.name}
                      </span>
                    </h2>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-gray-900">
                      {currency}
                      {product.offerPrice}
                    </span>
                    <span className="text-sm text-gray-400 line-through">
                      {currency}
                      {product.price}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleStock(product._id || product.id, !product.inStock)}
                      type="button"
                      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition ${
                        product.inStock
                          ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          : "bg-primary text-white hover:bg-secondary-dull"
                      }`}
                    >
                      {product.inStock ? "Mark out of stock" : "Mark in stock"}
                    </button>
                    <button
                      onClick={() => openEditor(product)}
                      type="button"
                      className="inline-flex items-center justify-center rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
                    >
                      Edit details
                    </button>
                    <button
                      onClick={() => deleteProduct(product)}
                      type="button"
                      disabled={deletingId === (product._id || product.id)}
                      className="inline-flex items-center justify-center rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === (product._id || product.id)
                        ? "Removing..."
                        : "Remove"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full table-auto text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-6 py-4">Product</th>
                  <th className="hidden px-6 py-4 md:table-cell">Category</th>
                  <th className="hidden px-6 py-4 md:table-cell">Pricing</th>
                  <th className="px-6 py-4 text-center">Stock</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-600">
                {filteredProducts.map((product) => (
                  <tr key={product._id || product.id} className="transition hover:bg-gray-50/70">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image?.[0]}
                          alt={product.name}
                          className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                        />
                        <div>
                          <p className="text-sm font-semibold text-gray-900" title={product.name}>
                            <span className="block max-h-12 overflow-hidden text-ellipsis">
                              {product.name}
                            </span>
                          </p>
                          <p className="text-xs text-gray-400">
                            {Array.isArray(product.description)
                              ? product.description[0] || "No description yet."
                              : product.description || "No description yet."}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-6 py-4 md:table-cell">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {product.category}
                      </span>
                    </td>
                    <td className="hidden px-6 py-4 md:table-cell">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">
                          {currency}
                          {product.offerPrice}
                        </span>
                        <span className="text-xs text-gray-400 line-through">
                          {currency}
                          {product.price}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          onChange={() => toggleStock(product._id || product.id, !product.inStock)}
                          checked={product.inStock}
                          type="checkbox"
                          className="peer sr-only"
                        />
                        <div className="flex h-8 w-14 items-center rounded-full bg-gray-200 transition peer-checked:bg-primary">
                          <span className="ml-1 inline-block h-6 w-6 transform rounded-full bg-white shadow transition peer-checked:translate-x-6"></span>
                        </div>
                      </label>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditor(product)}
                          type="button"
                          className="rounded-full border border-primary/40 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/10"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteProduct(product)}
                          type="button"
                          disabled={deletingId === (product._id || product.id)}
                          className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === (product._id || product.id)
                            ? "Removing..."
                            : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

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
                disabled={isSaving}
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
                    onChange={(event) => handleFormChange("name", event.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Update product title"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">Category</span>
                  <input
                    value={editForm.category}
                    onChange={(event) => handleFormChange("category", event.target.value)}
                    list="seller-category-options"
                    className="rounded-lg border border-gray-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Category"
                    required
                  />
                  <datalist id="seller-category-options">
                    {availableCategories.map((cat) => (
                      <option key={`current-${cat}`} value={cat} />
                    ))}
                    {categoryOptions.map((item) => (
                      <option key={`preset-${item.path}`} value={item.path} />
                    ))}
                  </datalist>
                </label>
              </div>

              <section className="rounded-xl border border-dashed border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    Product images
                  </span>
                  <span className="text-xs text-gray-500">
                    {totalImages}/{MAX_IMAGES}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  The first image appears as the cover on your storefront.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {existingImages.map((image, index) => (
                    <div
                      key={`existing-${index}`}
                      className="relative overflow-hidden rounded-lg border border-gray-200"
                    >
                      <img
                        src={image}
                        alt="Existing product"
                        className="h-32 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(index)}
                        className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-black"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {newImages.map((item, index) => (
                    <div
                      key={`new-${index}`}
                      className="relative overflow-hidden rounded-lg border border-gray-200"
                    >
                      <img
                        src={item.preview}
                        alt="New upload preview"
                        className="h-32 w-full object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-white">
                        New
                      </span>
                      <button
                        type="button"
                        onClick={() => removeNewImage(index)}
                        className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-black"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {totalImages < MAX_IMAGES ? (
                    <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-600 transition hover:border-primary hover:bg-primary/5 hover:text-primary">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={handleNewImageSelect}
                      />
                      <span className="text-sm font-semibold">Add images</span>
                      <span className="text-[10px] text-gray-400">
                        {MAX_IMAGES - totalImages} slot{MAX_IMAGES - totalImages === 1 ? "" : "s"} left
                      </span>
                    </label>
                  ) : null}
                </div>
              </section>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">Description</span>
                <textarea
                  value={editForm.description}
                  onChange={(event) => handleFormChange("description", event.target.value)}
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
                    onChange={(event) => handleFormChange("price", event.target.value)}
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
                    onChange={(event) => handleFormChange("offerPrice", event.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={editForm.inStock}
                  onChange={(event) => handleFormChange("inStock", event.target.checked)}
                  className="h-4 w-4"
                />
                <span>Available for purchase</span>
              </label>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-secondary-dull disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {isSaving ? (
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

export default ProductList;
