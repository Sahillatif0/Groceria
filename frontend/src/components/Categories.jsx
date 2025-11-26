import React from "react";
import { categories } from "../assets/assets";
import { UseAppContext } from "../context/AppContext";

const Categories = () => {
  const { navigate } = UseAppContext();

  const handleNavigate = (path) => {
    navigate(`/product/${path.toLowerCase()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="mt-16 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-2xl font-semibold md:text-3xl">Shop by category</p>
          <p className="text-sm text-gray-500">
            Explore fresh picks and essentials tailored to every need.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {categories.map((category) => (
          <button
            key={category.path}
            type="button"
            onClick={() => handleNavigate(category.path)}
            className="group relative flex h-40 flex-col items-center justify-between overflow-hidden rounded-2xl border border-transparent bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70"
            style={{ backgroundColor: category.bgColor }}
            aria-label={`Browse ${category.text}`}
          >
            <span className="inline-flex items-center justify-center rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              {category.path}
            </span>
            <img
              src={category.image}
              alt={category.text}
              className="max-h-20 w-auto transition duration-200 group-hover:scale-110"
            />
            <span className="flex w-full items-center justify-between text-sm font-semibold text-gray-800">
              {category.text}
              <span className="text-primary transition group-hover:translate-x-1">&gt;</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default Categories;
