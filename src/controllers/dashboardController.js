import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { success } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// GET /api/dashboard/stats
export const getDashboardStats = asyncHandler(async (req, res) => {
  const [totalOrders, totalProducts, totalUsers] = await Promise.all([
    Order.countDocuments(),
    Product.countDocuments(),
    User.countDocuments(),
  ]);

  const revenueAgg = await Order.aggregate([
    { $match: { orderStatus: "Delivered" } },
    { $group: { _id: null, revenue: { $sum: "$total" } } },
  ]);
  const totalRevenue = revenueAgg[0]?.revenue || 0;

  const recentOrders = await Order.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .limit(5);

  const topSellingAgg = await Order.aggregate([
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.name",
        totalSold: { $sum: "$items.quantity" },
        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
      },
    },
    { $sort: { totalSold: -1 } },
    { $limit: 5 },
  ]);

  const statusSummaryAgg = await Order.aggregate([
    { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
  ]);
  const statusSummary = {
    Pending: 0,
    Processing: 0,
    Shipped: 0,
    Delivered: 0,
    Cancelled: 0,
  };
  statusSummaryAgg.forEach((s) => {
    if (s._id in statusSummary) statusSummary[s._id] = s.count;
  });

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const revenueByMonthAgg = await Order.aggregate([
    { $match: { orderStatus: "Delivered", createdAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        revenue: { $sum: "$total" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const revenueOverview = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(sixMonthsAgo);
    d.setMonth(d.getMonth() + i);
    const match = revenueByMonthAgg.find(
      (r) => r._id.year === d.getFullYear() && r._id.month === d.getMonth() + 1
    );
    revenueOverview.push({
      month: monthNames[d.getMonth()],
      revenue: match ? match.revenue : 0,
    });
  }

  return success(res, 200, "Dashboard stats fetched successfully", {
    totalRevenue,
    totalOrders,
    totalProducts,
    totalUsers,
    recentOrders,
    topSellingProducts: topSellingAgg.map((t) => ({
      name: t._id,
      totalSold: t.totalSold,
      revenue: t.revenue,
    })),
    statusSummary,
    revenueOverview,
  });
});
