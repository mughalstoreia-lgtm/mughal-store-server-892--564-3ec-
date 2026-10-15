import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { failure } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

export const protect = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return failure(res, 401, "Not authorized, no token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return failure(res, 401, "Not authorized, user no longer exists");
    }

    if (!user.isActive) {
      return failure(res, 403, "This account has been deactivated");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return failure(res, 401, "Session expired, please log in again");
    }
    return failure(res, 401, "Not authorized, invalid token");
  }
});

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return failure(res, 403, "You do not have permission to perform this action");
  }
  next();
};
