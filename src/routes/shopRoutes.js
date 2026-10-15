import express from "express";
import { authorize, protect } from "../middleware/auth.js";
import {
  getPublicProducts,
  getPublicProductBySlug,
  getPublicCategories,
  getPublicCategoryProducts,
  getSpotlightProduct,
  getAllStoreReviews,
  updateStoreReview,
  deleteStoreReview,
} from "../controllers/shopProductController.js";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from "../controllers/wishlistController.js";
import { createProductReview } from "../controllers/productController.js";

const router = express.Router();

// Public products & categories
router.get("/products", getPublicProducts);
router.get("/products/:slug", getPublicProductBySlug);
router.get("/categories", getPublicCategories);
router.get("/categories/:name", getPublicCategoryProducts);
router.get("/spotlight", getSpotlightProduct);

// Wishlist (auth required)
router.get("/wishlist", protect, getWishlist);
router.post("/wishlist/:productId", protect, addToWishlist);
router.delete("/wishlist/:productId", protect, removeFromWishlist);

router.route('/:id/reviews').post(protect, createProductReview);

router.route("/reviews")
  .get(protect, authorize("admin"), getAllStoreReviews);              // Get all store reviews

router.route("/reviews/:productId/:reviewId")
  .put(protect, authorize("admin"), updateStoreReview)                // Update a review
  .delete(protect, authorize("admin"), deleteStoreReview);            // Delete a review

export default router;