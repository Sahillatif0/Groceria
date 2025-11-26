import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { dummyProducts } from "../assets/assets";
import axios from "axios";
import { io } from "socket.io-client";

axios.defaults.withCredentials = true;
axios.defaults.baseURL = import.meta.env.VITE_BACKEND_URL;

export const AppContext = createContext();
export const AppContextProvider = ({ children }) => {
  const currency = import.meta.env.VITE_CURRENCY;
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isSeller, setIsSeller] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showUserLogin, setShowUserLogin] = useState(false);
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sellerProfile, setSellerProfile] = useState(null);
  const [sellerProducts, setSellerProducts] = useState([]);
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const connectSocket = useCallback(() => {
    if (!backendUrl) {
      return null;
    }

    if (socketRef.current) {
      return socketRef.current;
    }

    const instance = io(backendUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    const handleConnect = () => {
      setSocket(instance);
    };

    const handleDisconnect = () => {
      setSocket(null);
      if (socketRef.current === instance) {
        socketRef.current = null;
      }
    };

    instance.on("connect", handleConnect);
    instance.on("disconnect", handleDisconnect);
    instance.on("connect_error", (error) => {
      console.warn("Socket connection error", error?.message ?? error);
    });

    socketRef.current = instance;

    return instance;
  }, [backendUrl]);

  const disconnectSocket = useCallback(() => {
    const instance = socketRef.current;
    if (!instance) {
      return;
    }

    instance.removeAllListeners();
    instance.disconnect();
    socketRef.current = null;
    setSocket(null);
  }, []);

  // fetching seller status
  const fetchSeller = async () => {
    try {
      const { data } = await axios.get("/api/seller/is-auth");
      if (data.success) {
        setIsSeller(true);
        setIsAdmin(data.user?.role === "admin");
        setSellerProfile(data.sellerProfile ?? null);
      } else {
        setIsSeller(false);
        setIsAdmin(false);
        setSellerProfile(null);
        setSellerProducts([]);
      }
    } catch (error) {
      setIsSeller(false);
      setIsAdmin(false);
      setSellerProfile(null);
      setSellerProducts([]);
    }
  };

  const fetchUser = async () => {
    try {
      const { data } = await axios.get("/api/user/is-auth");

      if (data.success) {
        setUser(data.user);
        setCartItems(data.user.cartItems);
        const role = data.user?.role;
        setIsSeller(role === "seller" || role === "admin");
        setIsAdmin(role === "admin");
      }
    } catch (error) {
      setUser(null);
      setIsSeller(false);
      setIsAdmin(false);
      setSellerProfile(null);
      setSellerProducts([]);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data } = await axios.get("/api/product/list");

      if (data.success) {
        setProducts(data.products);
      } else {
        toast.error(data.message);
        setProducts(dummyProducts);
      }
    } catch (error) {
      toast.error(error.message);
      setProducts(dummyProducts);
    }
  };

  const fetchSellerProducts = async () => {
    try {
      const { data } = await axios.get("/api/product/mine");
      if (data.success) {
        setSellerProducts(data.products ?? []);
      } else {
        toast.error(data.message);
        setSellerProducts([]);
      }
    } catch (error) {
      toast.error(error.message);
      setSellerProducts([]);
    }
  };

  const addToCart = async (itemId) => {
    let cartData = structuredClone(cartItems);
    if (cartData[itemId]) {
      cartData[itemId] += 1;
    } else {
      cartData[itemId] = 1;
    }
    setCartItems(cartData);
    toast.success("Product added to cart");
  };

  const updateCartItem = (itemId, quantity) => {
    let cartData = structuredClone(cartItems);
    cartData[itemId] = quantity;
    setCartItems(cartData);
    toast.success("Updated to cart");
  };

  const removeFromCart = (itemId) => {
    let cartData = structuredClone(cartItems);
    if (cartData[itemId]) {
      if (cartData[itemId] === 1) {
        delete cartData[itemId];
      } else {
        cartData[itemId] -= 1;
      }
    }
    toast.success("Removed from cart");
    setCartItems(cartData);
  };

  const getCartCount = () => {
    let totalCount = 0;
    for (const item in cartItems) {
      totalCount += cartItems[item];
    }
    return totalCount;
  };

  const getCartAmount = () => {
    let totalAmount = 0;
    for (const items in cartItems) {
      let itemInfo = products.find((product) => product._id === items);
      if (cartItems[items] > 0) {
        totalAmount += itemInfo.offerPrice * cartItems[items];
      }
    }

    return Math.floor(totalAmount * 100) / 100;
  };

  useEffect(() => {
    fetchUser();
    fetchSeller();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!backendUrl) {
      return;
    }

    if (user || sellerProfile) {
      connectSocket();
    }
  }, [backendUrl, connectSocket, user, sellerProfile]);

  useEffect(() => {
    if (!user && !sellerProfile) {
      disconnectSocket();
    }
  }, [disconnectSocket, user, sellerProfile]);

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, [disconnectSocket]);

  useEffect(() => {
    const updateCart = async () => {
      try {
        const { data } = await axios.post("/api/cart/update", { cartItems });
        if (!data.success) {
          toast.error(data.message);
        }
      } catch (error) {
        toast.error(error.message);
      }
    };

    if (user) {
      updateCart();
    }
  }, [cartItems]);

  const value = {
    navigate,
    user,
    setUser,
    setIsSeller,
    isSeller,
    isAdmin,
    setIsAdmin,
    sellerProfile,
    setSellerProfile,
    showUserLogin,
    setShowUserLogin,
    products,
    sellerProducts,
    setSellerProducts,
    currency,
    addToCart,
    updateCartItem,
    removeFromCart,
    cartItems,
    searchQuery,
    setSearchQuery,
    getCartAmount,
    getCartCount,
    axios,
    fetchProducts,
    fetchSellerProducts,
    setCartItems,
    socket,
    connectSocket,
    disconnectSocket,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const UseAppContext = () => {
  return useContext(AppContext);
};
