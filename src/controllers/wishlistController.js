import User from "../models/User.js";
import Product from "../models/Product.js";
import { success, failure } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isObjectId } from "../utils/validate.js";

// GET /api/shop/wishlist
export const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: "wishlist",
    match: { isActive: true },
  });
  return success(res, 200, "Wishlist fetched successfully", user.wishlist || []);
});

// POST /api/shop/wishlist/:productId
export const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!isObjectId(productId)) {
    return failure(res, 400, "Invalid product ID");
  }

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    return failure(res, 404, "Product not found");
  }

  const user = await User.findById(req.user._id);
  if (!user.wishlist.some((id) => id.equals(product._id))) {
    user.wishlist.push(product._id);
    await user.save();
  }
  return success(res, 200, "Added to wishlist");
});

// DELETE /api/shop/wishlist/:productId
export const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!isObjectId(productId)) {
    return failure(res, 400, "Invalid product ID");
  }

  const user = await User.findById(req.user._id);
  user.wishlist = user.wishlist.filter((id) => !id.equals(productId));
  await user.save();
  return success(res, 200, "Removed from wishlist");
});
