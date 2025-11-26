import React from "react";
import { UseAppContext } from "../context/AppContext";
import toast from "react-hot-toast";

const MODES = [
  { key: "user", label: "Customer" },
  { key: "seller", label: "Seller" },
  { key: "admin", label: "Admin" },
];

const Login = () => {
  const {
    setShowUserLogin,
    setUser,
    setIsSeller,
    setIsAdmin,
    setSellerProfile,
    axios,
    navigate,
  } = UseAppContext();
  const [state, setState] = React.useState("login");
  const [loginMode, setLoginMode] = React.useState("user");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");

  const onSubmitHandler = async (event) => {
    try {
      event.preventDefault();
      if (loginMode === "seller") {
        const endpoint = state === "register" ? "/api/seller/register" : "/api/seller/login";
        const payload =
          state === "register"
            ? { name, email, password, displayName }
            : { email, password };

        const { data } = await axios.post(endpoint, payload);

        if (!data.success) {
          toast.error(data.message);
          return;
        }

        toast.success(data.message);
        setUser(data.user);
        setSellerProfile(data.sellerProfile ?? null);
        setIsSeller(
          data.user?.role === "seller" || data.user?.role === "admin"
        );
        setIsAdmin(data.user?.role === "admin");
        navigate("/seller");
        setShowUserLogin(false);
        return;
      }

      const { data } = await axios.post(`/api/user/${state}`, {
        name,
        email,
        password,
      });

      if (!data.success) {
        toast.error(data.message);
        return;
      }

      if (loginMode === "admin" && data.user?.role !== "admin") {
        toast.error("Admin account required");
        return;
      }

      toast.success(data.message);
      setUser(data.user);
      setIsSeller(
        data.user?.role === "seller" || data.user?.role === "admin"
      );
      setIsAdmin(data.user?.role === "admin");
      setSellerProfile(null);
      navigate(loginMode === "admin" ? "/admin" : "/");
      setShowUserLogin(false);
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const handleModeChange = (mode) => {
    setLoginMode(mode);
    setState("login");
    setName("");
    setEmail("");
    setPassword("");
    setDisplayName("");
  };

  const canRegister = loginMode !== "admin";
  const isRegistering = canRegister && state === "register";

  const headingLabel =
    loginMode === "user"
      ? "User"
      : loginMode === "seller"
      ? "Seller"
      : "Admin";

  return (
    <div
      onClick={() => setShowUserLogin(false)}
      className="fixed top-0 bottom-0 left-0 right-0 z-30 flex items-center text-sm text-gray-600 bg-black/50"
    >
      <form
        onSubmit={onSubmitHandler}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-4 m-auto items-start p-8 py-12 w-80 sm:w-[352px] rounded-lg shadow-xl border border-gray-200 bg-white"
      >
        <div className="flex w-full gap-2">
          {MODES.map((mode) => (
            <button
              type="button"
              key={mode.key}
              onClick={() => handleModeChange(mode.key)}
              className={`w-full rounded-md border px-3 py-2 text-sm transition ${
                loginMode === mode.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 hover:border-primary/60"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <p className="text-2xl font-medium m-auto">
          <span className="text-primary">{headingLabel}</span>{" "}
          {isRegistering ? "Sign Up" : "Login"}
        </p>
        {isRegistering && (
          <div className="w-full">
            <p>Name</p>
            <input
              onChange={(e) => setName(e.target.value)}
              value={name}
              placeholder="Your full name"
              className="border border-gray-200 rounded w-full p-2 mt-1 outline-primary"
              type="text"
              required
            />
          </div>
        )}
        {isRegistering && loginMode === "seller" && (
          <div className="w-full">
            <p>Display Name</p>
            <input
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
              placeholder="store or brand name"
              className="border border-gray-200 rounded w-full p-2 mt-1 outline-primary"
              type="text"
            />
          </div>
        )}
        <div className="w-full ">
          <p>Email</p>
          <input
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            placeholder="you@example.com"
            className="border border-gray-200 rounded w-full p-2 mt-1 outline-primary"
            type="email"
            required
          />
        </div>
        <div className="w-full ">
          <p>Password</p>
          <input
            onChange={(e) => setPassword(e.target.value)}
            value={password}
            placeholder="Enter your password"
            className="border border-gray-200 rounded w-full p-2 mt-1 outline-primary"
            type="password"
            required
          />
        </div>
        {canRegister && (
          isRegistering ? (
            <p>
              Already have account?{" "}
              <span
                onClick={() => setState("login")}
                className="text-primary cursor-pointer"
              >
                click here
              </span>
            </p>
          ) : (
            <p>
              Need an account?{" "}
              <span
                onClick={() => setState("register")}
                className="text-primary cursor-pointer"
              >
                click here
              </span>
            </p>
          )
        )}
        <button className="bg-primary hover:bg-secondary-dull transition-all text-white w-full py-2 rounded-md cursor-pointer">
          {isRegistering ? "Create Account" : "Login"}
        </button>

        {/* ye jo he wo bich wali line he */}
        {/* <div class="flex items-center gap-4 w-full my-3">
          <div class="w-full h-px bg-gray-300/90"></div>
          <p class="w-full text-nowrap text-sm text-gray-500/90">
            or sign in with email
          </p>
          <div class="w-full h-px bg-gray-300/90"></div>
        </div>

        {/* ye google wala button he */}
        {/* <button
          type="button"
          class="w-full flex items-center gap-2 justify-center bg-white border border-primary py-2.5 rounded-full text-gray-800 hover:bg-gray-100/50 outline-primary"
        >
          <img
            class="h-4 w-4"
            src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/login/googleFavicon.png"
            alt="googleFavicon"
          />
          Log in with Google
        </button> */}
      </form>
    </div>
  );
};

export default Login;
