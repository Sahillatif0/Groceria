import Navbar from "./components/Navbar";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import { Toaster } from "react-hot-toast";
import Footer from "./components/Footer";
import { UseAppContext } from "./context/AppContext";
import Login from "./components/Login";
import AllProducts from "./pages/AllProducts";
import ProductCategory from "./pages/ProductCategory";
import ProductDetails from "./pages/ProductDetails";
import ShoppingCart from "./pages/ShoppingCart";
import Address from "./pages/Address";
import MyOrders from "./pages/MyOrders";
import SellerLogin from "./components/seller/SellerLogin";
import SellerLayout from "./pages/seller/SellerLayout";
import AddProduct from "./pages/seller/AddProduct";
import ProductList from "./pages/seller/ProductList";
import Orders from "./pages/seller/Orders";
import Loading from "./components/Loading";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSellers from "./pages/admin/AdminSellers";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminOrders from "./pages/admin/AdminOrders";
import Messages from "./pages/seller/Messages";

const App = () => {
  const location = useLocation();
  const hideChrome =
    location.pathname.startsWith("/seller") ||
    location.pathname.startsWith("/admin");
  const { showUserLogin, isSeller, isAdmin } = UseAppContext();
  return (
    <div className="text-default min-h-screen text-gray-700 bg-white">
      {hideChrome ? null : <Navbar />}
      {showUserLogin ? <Login></Login> : null}
      <Toaster />
      <div
        className={`${hideChrome ? "" : "px-6 md:px-16 lg:px-24 xl:px-32"}`}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/product" element={<AllProducts />} />
          <Route path="/product/:category" element={<ProductCategory />} />
          <Route path="/product/:category/:id" element={<ProductDetails />} />
          <Route path="/cart" element={<ShoppingCart />} />
          <Route path="/add-address" element={<Address />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/loader" element={<Loading />} />

          <Route
            path="/seller"
            element={isSeller ? <SellerLayout></SellerLayout> : <SellerLogin />}
          >
            <Route index element={<AddProduct />} />
            {/* <Route path="add-product" element={<AddProduct />} /> */}
            <Route path="product-list" element={<ProductList></ProductList>} />
            <Route path="orders" element={<Orders></Orders>} />
            <Route path="messages" element={<Messages />} />
          </Route>

          <Route
            path="/admin"
            element={isAdmin ? <AdminLayout /> : <Navigate to="/" replace />}
          >
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="sellers" element={<AdminSellers />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="orders" element={<AdminOrders />} />
          </Route>
        </Routes>
      </div>
      {!hideChrome && <Footer></Footer>}
    </div>
  );
};

export default App;
