import express from "express";
import {
  createOrder,
  getOrders,
  getMyOrders,
  getOrder,
  updateMyOrder,
  updateOrderStatus,
  deleteOrder,
} from "../controllers/orderController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// router.use(protect);

// Customer routes (used by storefront)
router.post("/",protect, createOrder);
router.get("/my-orders",protect, getMyOrders);
router.get("/:id",protect, getOrder);
router.put("/:id",protect, updateMyOrder);
router.delete("/:id",protect, deleteOrder);

// Admin routes
router.get("/", protect, authorize("admin"), getOrders);
router.put("/:id/status", protect, authorize("admin"), updateOrderStatus);

export default router;
