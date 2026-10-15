import mongoose from "mongoose";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import { success, failure } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isObjectId, isNonEmptyString } from "../utils/validate.js";

const VALID_ORDER_STATUSES = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
const VALID_PAYMENT_STATUSES = ["Pending", "Paid", "Failed", "Refunded"];

const isWithin24Hours = (createdAt) => {
  const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  return hours <= 24;
};

/**
 * Server-side unit price (never trust client price for final charge).
 */
const unitPrice = (product) => {
  const d = Number(product.discountPrice);
  const p = Number(product.price);
  if (d > 0 && d < p) return d;
  return p;
};

/**
 * POST /api/orders
 * Accepts storefront payload shape:
 * { items: [{ product, name?, price?, quantity, image? }], shippingAddress, paymentMethod?, subtotal?, shipping?, discount? }
 * Prices & totals are recalculated from DB. Client totals are ignored for security.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const { items, shippingAddress, paymentMethod, shipping: clientShipping } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return failure(res, 400, "Order must contain at least one item");
  }

  if (!shippingAddress || typeof shippingAddress !== "object") {
    return failure(res, 400, "Shipping address is required");
  }

  const { fullName, addressLine1, city, country } = shippingAddress;
  if (!isNonEmptyString(fullName, 1, 120)) {
    return failure(res, 400, "Shipping full name is required");
  }
  if (!isNonEmptyString(addressLine1, 1, 300)) {
    return failure(res, 400, "Shipping address is required");
  }
  if (!isNonEmptyString(city, 1, 100)) {
    return failure(res, 400, "City is required");
  }
  if (!isNonEmptyString(country, 1, 100)) {
    return failure(res, 400, "Country is required");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const productId =
        typeof item.product === "object" ? item.product?._id || item.product?.id : item.product;
      const quantity = Number(item.quantity);

      if (!productId || !isObjectId(String(productId))) {
        throw new Error("Product ID is missing or invalid in order items");
      }
      if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
        throw new Error("Invalid quantity");
      }
      if (quantity > 50) {
        throw new Error("Maximum 50 units per product per order");
      }

      const product = await Product.findOne({ _id: productId, isActive: true }).session(session);
      if (!product) {
        throw new Error(`Product not found or inactive (ID: ${productId})`);
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { _id: productId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true, session }
      );

      if (!updatedProduct) {
        throw new Error(`Product out of stock or not found: ${product.name}`);
      }

      const price = unitPrice(product);
      subtotal += price * quantity;

      orderItems.push({
        product: product._id,
        name: product.name,
        price,
        quantity,
        image: product.images?.[0] || item.image || "",
      });
    }

    // Shipping: prefer client estimate if valid non-negative number, else 0
    // (storefront already computes PKR shipping; admin may send 0)
    let shippingFee = 0;
    if (clientShipping !== undefined && clientShipping !== null) {
      const s = Number(clientShipping);
      if (Number.isNaN(s) || s < 0) {
        throw new Error("Invalid shipping amount");
      }
      shippingFee = s;
    }

    const discount = 0;
    const total = Math.max(subtotal + shippingFee - discount, 0);

    let pm = (paymentMethod || "cash on delivery").toString().toLowerCase().trim();
    if (pm === "cod") pm = "cash on delivery";
    if (!["cash on delivery", "card", "paypal", "bank_transfer"].includes(pm)) {
      pm = "cash on delivery";
    }

    const [order] = await Order.create(
      [
        {
          user: req.user._id,
          items: orderItems,
          shippingAddress: {
            fullName: fullName.trim(),
            phone: String(shippingAddress.phone || "").slice(0, 30),
            addressLine1: addressLine1.trim(),
            addressLine2: String(shippingAddress.addressLine2 || "").slice(0, 200),
            city: city.trim(),
            state: String(shippingAddress.state || "").slice(0, 100),
            postalCode: String(shippingAddress.postalCode || "").slice(0, 20),
            country: country.trim(),
          },
          paymentMethod: pm,
          paymentStatus: "Pending",
          orderStatus: "Pending",
          subtotal,
          discount,
          shipping: shippingFee,
          total,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return success(res, 201, "Order placed successfully", order);
  } catch (error) {
    await session.abortTransaction();
    return failure(res, 400, error.message || "Order failed due to stock issue");
  } finally {
    session.endSession();
  }
});

// GET /api/orders/my-orders
export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  return success(res, 200, "User orders fetched successfully", orders);
});

// PUT /api/orders/:id  (user edit within 24h)
export const updateMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return failure(res, 404, "Order not found");

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return failure(res, 403, "You are not authorized to edit this order");
  }

  if (req.user.role !== "admin" && !isWithin24Hours(order.createdAt)) {
    return failure(res, 400, "Order cannot be edited after 24 hours of placement");
  }

  if (["Shipped", "Delivered", "Cancelled"].includes(order.orderStatus)) {
    return failure(res, 400, `Cannot edit order when it is already ${order.orderStatus}`);
  }

  if (req.body.shippingAddress) {
    const addr = req.body.shippingAddress;
    if (addr.fullName && !isNonEmptyString(addr.fullName, 1, 120)) {
      return failure(res, 400, "Invalid full name");
    }
    if (addr.addressLine1 && !isNonEmptyString(addr.addressLine1, 1, 300)) {
      return failure(res, 400, "Invalid address");
    }
    order.shippingAddress = { ...order.shippingAddress.toObject?.() || order.shippingAddress, ...addr };
  }

  if (req.body.shipping !== undefined) {
    const s = Number(req.body.shipping);
    if (Number.isNaN(s) || s < 0) return failure(res, 400, "Invalid shipping");
    order.shipping = s;
  }

  order.total = order.subtotal + order.shipping - order.discount;
  await order.save();

  return success(res, 200, "Order updated successfully", order);
});

// DELETE /api/orders/:id  (cancel + restore stock)
export const deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return failure(res, 404, "Order not found");

  if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return failure(res, 403, "You do not have permission to delete this order");
  }

  if (req.user.role !== "admin" && !isWithin24Hours(order.createdAt)) {
    return failure(res, 400, "Order cannot be deleted or cancelled after 24 hours");
  }

  if (req.user.role !== "admin" && ["Shipped", "Delivered"].includes(order.orderStatus)) {
    return failure(res, 400, "Cannot cancel an order that is already shipped or delivered");
  }

  if (order.orderStatus !== "Cancelled") {
    for (const item of order.items) {
      const productId = typeof item.product === "object" ? item.product?._id : item.product;
      if (productId && item.quantity > 0) {
        await Product.findByIdAndUpdate(productId, {
          $inc: { stock: Number(item.quantity) },
        });
      }
    }
  }

  await order.deleteOne();
  return success(res, 200, "Order deleted successfully. Stock restored (if needed).");
});

// GET /api/orders  (admin)
export const getOrders = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const { search, orderStatus, paymentStatus } = req.query;

  const filter = {};
  if (orderStatus && orderStatus !== "all") {
    if (!VALID_ORDER_STATUSES.includes(orderStatus)) {
      return failure(res, 400, "Invalid order status filter");
    }
    filter.orderStatus = orderStatus;
  }
  if (paymentStatus && paymentStatus !== "all") {
    if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
      return failure(res, 400, "Invalid payment status filter");
    }
    filter.paymentStatus = paymentStatus;
  }

  if (search && String(search).trim()) {
    const q = String(search).trim();
    const orConditions = [];
    if (isObjectId(q)) orConditions.push({ _id: q });

    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ],
    }).select("_id");

    if (matchingUsers.length) {
      orConditions.push({ user: { $in: matchingUsers.map((u) => u._id) } });
    }

    if (orConditions.length) {
      filter.$or = orConditions;
    } else {
      filter._id = null;
    }
  }

  const total = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return success(res, 200, "Orders fetched successfully", orders, {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

// GET /api/orders/:id
export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "name email phone")
    .populate("items.product", "name images");

  if (!order) return failure(res, 404, "Order not found");

  const ownerId = order.user?._id?.toString() || order.user?.toString();
  if (ownerId !== req.user._id.toString() && req.user.role !== "admin") {
    return failure(res, 403, "Not authorized to view this order");
  }

  return success(res, 200, "Order fetched successfully", order);
});

// PUT /api/orders/:id/status  (admin)
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderStatus, paymentStatus } = req.body;

  if (orderStatus && !VALID_ORDER_STATUSES.includes(orderStatus)) {
    return failure(res, 400, "Invalid order status");
  }
  if (paymentStatus && !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    return failure(res, 400, "Invalid payment status");
  }

  const order = await Order.findById(req.params.id);
  if (!order) return failure(res, 404, "Order not found");

  const previousStatus = order.orderStatus;

  if (orderStatus) order.orderStatus = orderStatus;
  if (paymentStatus) order.paymentStatus = paymentStatus;

  // Restore stock on cancel
  if (orderStatus === "Cancelled" && previousStatus !== "Cancelled") {
    for (const item of order.items) {
      const productId = typeof item.product === "object" ? item.product?._id : item.product;
      if (productId && item.quantity > 0) {
        await Product.findByIdAndUpdate(productId, {
          $inc: { stock: Number(item.quantity) },
        });
      }
    }
  }

  // Re-deduct stock if un-cancelling
  if (previousStatus === "Cancelled" && orderStatus && orderStatus !== "Cancelled") {
    for (const item of order.items) {
      const productId = typeof item.product === "object" ? item.product?._id : item.product;
      const quantity = Number(item.quantity);
      if (productId && quantity > 0) {
        const updated = await Product.findOneAndUpdate(
          { _id: productId, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { new: true }
        );
        if (!updated) {
          order.orderStatus = previousStatus;
          return failure(
            res,
            400,
            `Not enough stock to reactivate order (Product ID: ${productId})`
          );
        }
      }
    }
  }

  await order.save();
  return success(res, 200, "Order status updated successfully", order);
});
