import Product from "../models/Product.js";
import { success, failure } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isNonEmptyString, isPositiveNumber } from "../utils/validate.js";

// GET /api/products
export const getProducts = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const { search, category, stock, status, sort } = req.query;

  const filter = {};

  if (search && String(search).trim()) {
    const q = String(search).trim();
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
      { brand: { $regex: q, $options: "i" } },
    ];
  }

  if (category && category !== "all") filter.category = category;
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (stock === "in") filter.stock = { $gt: 0 };
  if (stock === "out") filter.stock = { $lte: 0 };
  if (stock === "low") filter.stock = { $gt: 0, $lte: 10 };

  let sortOption = { createdAt: -1 };
  if (sort === "price_asc") sortOption = { price: 1 };
  if (sort === "price_desc") sortOption = { price: -1 };
  if (sort === "name_asc") sortOption = { name: 1 };
  if (sort === "stock_asc") sortOption = { stock: 1 };

  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
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

// GET /api/products/:id
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return failure(res, 404, "Product not found");
  return success(res, 200, "Product fetched successfully", product);
});

// POST /api/products
export const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    price,
    discountPrice,
    category,
    brand,
    sku,
    stock,
    images,
    isActive,
  } = req.body;

  if (!isNonEmptyString(name, 1, 200)) {
    return failure(res, 400, "Product name is required (max 200 chars)");
  }
  if (!isNonEmptyString(description, 1, 10000)) {
    return failure(res, 400, "Description is required");
  }
  if (price === undefined || !isPositiveNumber(price) || Number(price) <= 0) {
    return failure(res, 400, "Valid price is required");
  }
  if (!isNonEmptyString(category, 1, 100)) {
    return failure(res, 400, "Category is required");
  }
  if (!isNonEmptyString(sku, 1, 50)) {
    return failure(res, 400, "SKU is required");
  }
  if (stock === undefined || !isPositiveNumber(stock)) {
    return failure(res, 400, "Valid stock quantity is required");
  }

  const dPrice = discountPrice !== undefined && discountPrice !== "" ? Number(discountPrice) : 0;
  if (dPrice > Number(price)) {
    return failure(res, 400, "Discount price cannot exceed price");
  }

  const imgs = Array.isArray(images) ? images.filter(Boolean).slice(0, 50) : [];
  if (imgs.length === 0) {
    return failure(res, 400, "At least one image is required");
  }

  const product = await Product.create({
    name: name.trim(),
    description: description.trim(),
    price: Number(price),
    discountPrice: dPrice,
    category: category.trim(),
    brand: brand ? String(brand).trim() : "",
    sku: String(sku).trim().toUpperCase(),
    stock: Number(stock),
    images: imgs,
    isActive: isActive !== false,
  });

  return success(res, 201, "Product created successfully", product);
});

// PUT /api/products/:id
export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return failure(res, 404, "Product not found");

  const {
    name,
    description,
    price,
    discountPrice,
    category,
    brand,
    sku,
    stock,
    images,
    isActive,
  } = req.body;

  if (name !== undefined) {
    if (!isNonEmptyString(name, 1, 200)) return failure(res, 400, "Invalid product name");
    product.name = name.trim();
  }
  if (description !== undefined) {
    if (!isNonEmptyString(description, 1, 10000)) return failure(res, 400, "Invalid description");
    product.description = description.trim();
  }
  if (price !== undefined) {
    if (!isPositiveNumber(price) || Number(price) <= 0) return failure(res, 400, "Invalid price");
    product.price = Number(price);
  }
  if (discountPrice !== undefined) {
    const d = discountPrice === "" || discountPrice === null ? 0 : Number(discountPrice);
    if (Number.isNaN(d) || d < 0) return failure(res, 400, "Invalid discount price");
    if (d > product.price) return failure(res, 400, "Discount price cannot exceed price");
    product.discountPrice = d;
  }
  if (category !== undefined) {
    if (!isNonEmptyString(category, 1, 100)) return failure(res, 400, "Invalid category");
    product.category = category.trim();
  }
  if (brand !== undefined) product.brand = String(brand).trim();
  if (sku !== undefined) {
    if (!isNonEmptyString(sku, 1, 50)) return failure(res, 400, "Invalid SKU");
    product.sku = String(sku).trim().toUpperCase();
  }
  if (stock !== undefined) {
    if (!isPositiveNumber(stock)) return failure(res, 400, "Invalid stock");
    product.stock = Number(stock);
  }
  if (images !== undefined) {
    if (!Array.isArray(images) || images.filter(Boolean).length === 0) {
      return failure(res, 400, "At least one image is required");
    }
    product.images = images.filter(Boolean).slice(0, 50);
  }
  if (isActive !== undefined) product.isActive = Boolean(isActive);

  await product.save();
  return success(res, 200, "Product updated successfully", product);
});

// DELETE /api/products/:id
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return failure(res, 404, "Product not found");
  return success(res, 200, "Product deleted successfully");
});

// GET /api/products/categories/list
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Product.distinct("category");
  return success(res, 200, "Categories fetched successfully", categories);
});

// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private
export const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const product = await Product.findById(req.params.id);

  if (product) {
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      res.status(400);
      throw new Error('Product already reviewed');
    }

    const review = {
      name: req.user.name,
      rating: Number(rating),
      comment,
      user: req.user._id,
    };

    product.reviews.push(review);
    product.numReviews = product.reviews.length;
    product.rating =
      product.reviews.reduce((acc, item) => item.rating + acc, 0) /
      product.reviews.length;

    await product.save();
    res.status(201).json({ message: 'Review added successfully' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});