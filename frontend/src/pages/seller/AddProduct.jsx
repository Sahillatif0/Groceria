import React, { useState } from "react";
import { assets, categories } from "../../assets/assets";
import { UseAppContext } from "../../context/AppContext";
import toast from "react-hot-toast";

const AddProduct = () => {
  const [files, setFiles] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const { axios, fetchSellerProducts } = UseAppContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const onSubmitHandler = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const productData = {
        name,
        description: description.split("\n"),
        category,
        price: Number(price),
        offerPrice: Number(offerPrice),
      };

      const formData = new FormData();
      formData.append("productData", JSON.stringify(productData));

      for (let i = 0; i < files.length; i++) {
        formData.append("images", files[i]);
      }

      const { data } = await axios.post("/api/product/add", formData);
      if (data.success) {
        toast.success(data.message);
        setName("");
        setDescription("");
        setCategory("");
        setPrice("");
        setOfferPrice("");
        setFiles([]);
        fetchSellerProducts();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="no-scrollbar flex-1 h-[95vh] overflow-y-auto bg-gray-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 md:px-10">
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-white to-primary/10 p-[1px] shadow-lg">
          <form
            onSubmit={onSubmitHandler}
            className="flex flex-col gap-6 rounded-[calc(theme(borderRadius.2xl)-1px)] bg-white/95 p-6 backdrop-blur md:p-10"
          >
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Create Product
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 md:text-3xl">
                Showcase something fresh
              </h2>
              <p className="text-sm text-gray-500">
                Upload crisp imagery, craft compelling copy, and keep pricing transparent.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Product media</p>
              <p className="text-xs text-gray-500">
                Add up to four photos. The first one will be used as the cover image.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array(4)
                  .fill("")
                  .map((_, index) => (
                    <label
                      key={index}
                      htmlFor={`image${index}`}
                      className="relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 transition hover:border-primary hover:bg-primary/5"
                    >
                      <input
                        onChange={(e) => {
                          const updatedFiles = [...files];
                          updatedFiles[index] = e.target.files?.[0];
                          setFiles(updatedFiles);
                        }}
                        accept="image/*"
                        type="file"
                        id={`image${index}`}
                        hidden
                      />
                      {files[index] ? (
                        <img
                          className="h-full w-full rounded-xl object-cover"
                          src={URL.createObjectURL(files[index])}
                          alt={`preview-${index}`}
                        />
                      ) : (
                        <>
                          <img
                            src={assets.upload_area}
                            alt="Upload"
                            className="h-12 w-12 opacity-70"
                          />
                          <span className="text-xs font-medium text-gray-600">
                            Upload image
                          </span>
                        </>
                      )}
                    </label>
                  ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="product-name">
                  Product name
                </label>
                <input
                  onChange={(e) => setName(e.target.value)}
                  value={name}
                  id="product-name"
                  type="text"
                  placeholder="Organic Strawberry Spread"
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="category">
                  Category
                </label>
                <select
                  onChange={(e) => setCategory(e.target.value)}
                  value={category}
                  id="category"
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select category</option>
                  {categories.map((item, index) => (
                    <option key={index} value={item.path}>
                      {item.path}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-medium text-gray-700"
                htmlFor="product-description"
              >
                Product description
              </label>
              <textarea
                onChange={(e) => setDescription(e.target.value)}
                value={description}
                id="product-description"
                rows={5}
                placeholder={"List key features, sourcing details, or preparation tips"}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              ></textarea>
              <p className="text-xs text-gray-500">
                Tip: Separate bullet points with a new line. We’ll format it for you.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="product-price">
                  Full price
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    $
                  </span>
                  <input
                    onChange={(e) => setPrice(e.target.value)}
                    value={price}
                    id="product-price"
                    type="number"
                    min="0"
                    placeholder="19.99"
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pl-8 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="offer-price">
                  Offer price
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    $
                  </span>
                  <input
                    onChange={(e) => setOfferPrice(e.target.value)}
                    value={offerPrice}
                    id="offer-price"
                    type="number"
                    min="0"
                    placeholder="15.99"
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pl-8 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Keep discounts realistic to build customer trust.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl bg-gray-50 px-4 py-5 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-gray-800">Preview savings</p>
                <p>
                  Full price: <span className="font-medium">${price || "0.00"}</span>
                </p>
                <p>
                  Offer price: <span className="font-medium">${offerPrice || "0.00"}</span>
                </p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-secondary-dull disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                    Publishing...
                  </span>
                ) : (
                  "Publish product"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddProduct;
