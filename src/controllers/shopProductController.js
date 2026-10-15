import Product from "../models/Product.js";
import { success, failure } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isObjectId } from "../utils/validate.js";

// @desc    Get all reviews across all products in the shop
// @route   GET /api/shop/reviews
// @access  Private/Admin
export const getAllStoreReviews = asyncHandler(async (req, res) => {
  const products = await Product.find({ "reviews.0": { $exists: true } }).select("name reviews category");
  
  let allReviews = [];
  products.forEach((product) => {
    product.reviews.forEach((review) => {
      allReviews.push({
        _id: review._id,
        productId: product._id,
        productName: product.name,
        category: product.category,
        name: review.name,
        rating: review.rating,
        comment: review.comment,
        user: review.user,
        createdAt: review.createdAt || review._id.getTimestamp(),
      });
    });
  });

  // Sort by latest reviews first
  allReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return success(res, 200, "All store reviews fetched successfully", allReviews);
});

// @desc    Update a specific review
// @route   PUT /api/shop/reviews/:productId/:reviewId
// @access  Private/Admin
export const updateStoreReview = asyncHandler(async (req, res) => {
  const { productId, reviewId } = req.params;
  const { rating, comment } = req.body;

  const product = await Product.findById(productId);
  if (!product) return failure(res, 404, "Product not found");

  const review = product.reviews.id(reviewId);
  if (!review) return failure(res, 404, "Review not found");

  if (rating !== undefined) {
    const numRating = Number(rating);
    if (numRating < 1 || numRating > 5) {
      return failure(res, 400, "Rating must be between 1 and 5");
    }
    review.rating = numRating;
  }

  if (comment !== undefined) {
    if (!String(comment).trim()) {
      return failure(res, 400, "Comment cannot be empty");
    }
    review.comment = String(comment).trim();
  }

  // Recalculate product average rating
  product.rating =
    product.reviews.reduce((acc, item) => item.rating + acc, 0) /
    product.reviews.length;

  await product.save();
  return success(res, 200, "Review updated successfully", review);
});

// @desc    Delete a specific review
// @route   DELETE /api/shop/reviews/:productId/:reviewId
// @access  Private/Admin
export const deleteStoreReview = asyncHandler(async (req, res) => {
  const { productId, reviewId } = req.params;

  const product = await Product.findById(productId);
  if (!product) return failure(res, 404, "Product not found");

  const review = product.reviews.id(reviewId);
  if (!review) return failure(res, 404, "Review not found");

  product.reviews.pull(reviewId);
  product.numReviews = product.reviews.length;

  if (product.reviews.length > 0) {
    product.rating =
      product.reviews.reduce((acc, item) => item.rating + acc, 0) /
      product.reviews.length;
  } else {
    product.rating = 0;
  }

  await product.save();
  return success(res, 200, "Review deleted successfully");
});

/**
 * Public storefront product endpoints.
 * Accepts frontend query params as sent by ecommerce-app (no frontend changes).
 */

// GET /api/shop/products
export const getPublicProducts = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 100);
  const { search, category, sort, minPrice, maxPrice, availability } = req.query;

  const filter = { isActive: true };

  if (search && String(search).trim()) {
    const q = String(search).trim();
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { brand: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
    ];
  }

  if (category && category !== "all") {
    filter.category = category;
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  // Frontend sends: in_stock | out_of_stock | ""
  if (availability === "in_stock" || availability === "in-stock") {
    filter.stock = { $gt: 0 };
  } else if (availability === "out_of_stock" || availability === "out-of-stock") {
    filter.stock = { $lte: 0 };
  }

  // Frontend sends: newest | price_asc | price_desc | name_asc
  let sortOption = { createdAt: -1 };
  if (sort === "price_asc" || sort === "price-low") sortOption = { price: 1 };
  if (sort === "price_desc" || sort === "price-high") sortOption = { price: -1 };
  if (sort === "name_asc" || sort === "name-asc") sortOption = { name: 1 };
  if (sort === "newest") sortOption = { createdAt: -1 };

  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .select("-__v")
    .sort(sortOption)
    .skip((page - 1) * limit)
    .limit(limit);

  return success(res, 200, "Products fetched successfully", products, {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

/**
 * GET /api/shop/products/:slug
 * Frontend uses MongoDB _id in the URL, not slug.
 * Accept both ObjectId and slug.
 */
export const getPublicProductBySlug = asyncHandler(async (req, res) => {
  const param = req.params.slug;
  let product = null;

  if (isObjectId(param)) {
    product = await Product.findOne({ _id: param, isActive: true });
  }
  if (!product) {
    product = await Product.findOne({ slug: param, isActive: true });
  }

  if (!product) return failure(res, 404, "Product not found");

  // Return shape compatible with storefront (res.data or res.data.product)
  return success(res, 200, "Product fetched successfully", product);
});

// GET /api/shop/categories
export const getPublicCategories = asyncHandler(async (req, res) => {
  const categories = await Product.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        image: { $first: "$images" },
      },
    },
    {
      $project: {
        _id: 0,
        name: "$_id",
        count: 1,
        image: { $arrayElemAt: ["$image", 0] },
      },
    },
    { $sort: { name: 1 } },
  ]);
  return success(res, 200, "Categories fetched successfully", categories);
});

// GET /api/shop/categories/:name
export const getPublicCategoryProducts = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 48);
  const name = decodeURIComponent(req.params.name || "");

  const filter = { isActive: true, category: name };
  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  if (total === 0) {
    const exists = await Product.exists({ category: name });
    if (!exists) return failure(res, 404, "Category not found");
  }

  return success(res, 200, "Category products fetched successfully", products, {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

// GET /api/shop/spotlight
export const getSpotlightProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ isActive: true, stock: { $gt: 0 } }).sort({
    createdAt: -1,
  });
  if (!product) return success(res, 200, "No spotlight product available", null);
  return success(res, 200, "Spotlight product fetched successfully", product);
});