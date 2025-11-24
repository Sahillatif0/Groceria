import jwt from "jsonwebtoken";

export const authUser = async (req, res, next) => {
  const { token } = req.cookies;
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "User is unauthorized" });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (decodedToken.id) {
      req.user = decodedToken.id;
    } else {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token payload" });
    }

    next();
  } catch (error) {
    res
      .status(401)
      .json({ success: false, message: "Access token expired or invalid" });
  }
};
