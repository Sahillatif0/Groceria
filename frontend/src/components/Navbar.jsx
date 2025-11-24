import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import toast from "react-hot-toast";
import { assets } from "../assets/assets";
import { UseAppContext } from "../context/AppContext";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const {
    user,
    setUser,
    setShowUserLogin,
    navigate,
    searchQuery,
    setSearchQuery,
    getCartCount,
    axios,
    isSeller,
    setIsSeller,
    isAdmin,
    setIsAdmin,
    setSellerProfile,
    setSellerProducts,
  } = UseAppContext();

  useEffect(() => {
    if (searchQuery.length > 0) {
      navigate("/product");
    }
  }, [searchQuery, navigate]);

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };

  const logout = async () => {
    const shouldLogoutSeller = isSeller;
    try {
      const { data } = await axios.get("/api/user/logout");
      if (!data.success) {
        toast.error(data.message || "Logout failed");
        return;
      }

      setUser(null);
      setIsSeller(false);
      setIsAdmin(false);
      setSellerProfile(null);
      setSellerProducts([]);
      toast.success("Logged out successfully");
      navigate("/");
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      if (shouldLogoutSeller) {
        try {
          await axios.get("/api/seller/logout");
        } catch {
          // Seller sessions are best effort during logout
        }
      }
    }
  };

  const toggleMobileMenu = () => {
    setOpen((prev) => !prev);
  };

  const closeMobileMenu = () => setOpen(false);

  return (
    <nav className="sticky top-0 z-50 bg-white shadow">
      <div className="flex items-center justify-between py-3 px-4 sm:px-8">
        <div className="flex items-center gap-6">
          <NavLink to="/" onClick={closeMobileMenu}>
            <img className="h-9" src={assets.logo} alt="Logo" />
          </NavLink>
          <div className="hidden sm:flex items-center gap-6 text-sm">
            <NavLink to="/" className="hover:text-primary transition">
              Home
            </NavLink>
            <NavLink to="/product" className="hover:text-primary transition">
              Product
            </NavLink>
            <NavLink to="/" className="hover:text-primary transition">
              Contact
            </NavLink>
          </div>
        </div>

        <div className="hidden lg:flex items-center text-sm gap-2 border border-gray-300 px-3 rounded-full">
          <input
            value={searchQuery}
            onChange={handleSearchChange}
            className="py-1.5 w-52 bg-transparent outline-none placeholder-gray-500"
            type="text"
            placeholder="Search products"
          />
          <img src={assets.search_icon} alt="search" className="w-4 h-4" />
        </div>

        <div className="flex items-center gap-4">
          <div
            onClick={() => navigate("/cart")}
            className="relative cursor-pointer"
            aria-label="Cart"
          >
            <img src={assets.nav_cart_icon} alt="cart" />
            <span className="absolute -top-2 -right-3 text-xs text-white bg-primary w-[18px] h-[18px] rounded-full flex items-center justify-center">
              {getCartCount()}
            </span>
          </div>

          {user ? (
            <div className="hidden sm:block">
              <div className="relative group">
                <img
                  src={assets.profile_icon}
                  className="w-10 cursor-pointer"
                  alt="Profile"
                />
                <ul className="hidden group-hover:block absolute top-10 right-0 bg-white shadow border border-gray-200 py-2.5 w-40 rounded-md text-sm z-40">
                  <li
                    onClick={() => navigate("/my-orders")}
                    className="px-3 py-2 hover:bg-primary/10 cursor-pointer"
                  >
                    My Orders
                  </li>
                  {(isSeller || isAdmin) && (
                    <li
                      onClick={() => navigate("/seller")}
                      className="px-3 py-2 hover:bg-primary/10 cursor-pointer"
                    >
                      Seller Dashboard
                    </li>
                  )}
                  {isAdmin && (
                    <li
                      onClick={() => navigate("/admin")}
                      className="px-3 py-2 hover:bg-primary/10 cursor-pointer"
                    >
                      Admin Dashboard
                    </li>
                  )}
                  <li
                    onClick={logout}
                    className="px-3 py-2 hover:bg-primary/10 cursor-pointer"
                  >
                    Logout
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowUserLogin(true)}
              className="hidden sm:block px-8 py-2 bg-primary hover:bg-secondary-dull transition text-white rounded-full text-sm"
            >
              Login
            </button>
          )}

          <button
            onClick={toggleMobileMenu}
            aria-label="Menu"
            className="sm:hidden"
          >
            <img src={assets.menu_icon} alt="menu" />
          </button>
        </div>
      </div>

      {open && (
        <div className="sm:hidden border-t border-gray-200 bg-white px-5 py-4 flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2 border border-gray-300 px-3 rounded-full">
            <input
              value={searchQuery}
              onChange={handleSearchChange}
              className="py-1.5 w-full bg-transparent outline-none placeholder-gray-500"
              type="text"
              placeholder="Search products"
            />
            <img src={assets.search_icon} alt="search" className="w-4 h-4" />
          </div>

          <NavLink to="/" onClick={closeMobileMenu} className="py-1">
            Home
          </NavLink>
          <NavLink to="/product" onClick={closeMobileMenu} className="py-1">
            Product
          </NavLink>
          <NavLink to="/" onClick={closeMobileMenu} className="py-1">
            Contact
          </NavLink>

          {user && (
            <>
              <NavLink
                to="/my-orders"
                onClick={closeMobileMenu}
                className="py-1"
              >
                My Orders
              </NavLink>
              {(isSeller || isAdmin) && (
                <NavLink
                  to="/seller"
                  onClick={closeMobileMenu}
                  className="py-1"
                >
                  Seller Dashboard
                </NavLink>
              )}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={closeMobileMenu}
                  className="py-1"
                >
                  Admin Dashboard
                </NavLink>
              )}
            </>
          )}

          {!user ? (
            <button
              onClick={() => {
                setShowUserLogin(true);
                closeMobileMenu();
              }}
              className="px-6 py-2 mt-2 bg-primary hover:bg-secondary-dull transition text-white rounded-full text-sm"
            >
              Login
            </button>
          ) : (
            <button
              onClick={() => {
                closeMobileMenu();
                logout();
              }}
              className="px-6 py-2 mt-2 bg-primary hover:bg-secondary-dull transition text-white rounded-full text-sm"
            >
              Logout
            </button>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
