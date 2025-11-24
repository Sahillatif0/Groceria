import jwt from "jsonwebtoken";
export const authSeller = async (req, res, next) => {
  const { sellerToken } = req.cookies;
  if (!sellerToken) {
    return res
      .status(404)
      .json({ success: false, message: "User unAthorized" });
  }
  try {
    const decoded = jwt.verify(sellerToken, process.env.ACCESS_TOKEN_SECRET);

    if (decoded.email === process.env.SELLER_EMAIL) {
      next();
    } else {
      return res
        .status(404)
        .json({ success: false, message: "not authorized" });
    }
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};
