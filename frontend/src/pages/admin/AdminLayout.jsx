import { Link, NavLink, Outlet } from "react-router-dom";
import toast from "react-hot-toast";
import { assets } from "../../assets/assets";
import { UseAppContext } from "../../context/AppContext";

const navLinks = [
  { label: "Overview", path: "/admin" },
  { label: "Users", path: "/admin/users" },
  { label: "Sellers", path: "/admin/sellers" },
  { label: "Products", path: "/admin/products" },
  { label: "Orders", path: "/admin/orders" },
];

const AdminLayout = () => {
  const {
    user,
    axios,
    navigate,
    setUser,
    setIsAdmin,
    setIsSeller,
    setSellerProfile,
    setSellerProducts,
  } = UseAppContext();

  const logout = async () => {
    try {
      await axios.get("/api/user/logout");
    } catch (error) {
      console.error("Admin logout failed", error.message);
    }

    try {
      await axios.get("/api/seller/logout");
    } catch (error) {
      // ignore seller logout error for admins without seller cookie
    }

    setUser(null);
    setIsAdmin(false);
    setIsSeller(false);
    setSellerProfile(null);
    setSellerProducts([]);
    toast.success("Logged out");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 md:px-8 border-b border-gray-200 py-3 bg-white">
        <Link to="/">
          <img src={assets.logo} alt="Logo" className="w-36" />
        </Link>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{user?.name}</span>
          <button
            onClick={logout}
            className="border rounded-full px-4 py-1 text-sm hover:bg-gray-100"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-48 md:w-64 border-r border-gray-200 bg-white">
          <nav className="flex flex-col">
            {navLinks.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/admin"}
                className={({ isActive }) =>
                  `px-4 py-3 text-sm md:text-base border-l-4 ${
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
