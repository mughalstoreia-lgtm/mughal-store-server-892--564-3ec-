import User from "../models/User.js";
import { success, failure } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// GET /api/users
export const getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const { search, role, status } = req.query;

  const filter = {};
  if (search && String(search).trim()) {
    const q = String(search).trim();
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }
  if (role && role !== "all") filter.role = role;
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return success(res, 200, "Users fetched successfully", users, {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

// GET /api/users/:id
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return failure(res, 404, "User not found");
  return success(res, 200, "User fetched successfully", user);
});

// PUT /api/users/:id
export const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, isActive, avatar, phone } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) return failure(res, 404, "User not found");

  // Protect admin accounts from deactivation by non-self logic on frontend;
  // still validate role values here.
  if (role !== undefined && !["admin", "user"].includes(role)) {
    return failure(res, 400, "Invalid role");
  }

  if (name !== undefined) user.name = String(name).trim().slice(0, 100);
  if (email !== undefined) user.email = String(email).toLowerCase().trim();
  if (role !== undefined) user.role = role;
  if (isActive !== undefined) user.isActive = Boolean(isActive);
  if (avatar !== undefined) user.avatar = String(avatar).slice(0, 500);
  if (phone !== undefined) user.phone = String(phone).slice(0, 30);

  await user.save();
  return success(res, 200, "User updated successfully", user);
});

// DELETE /api/users/:id
export const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === String(req.user._id)) {
    return failure(res, 400, "You cannot delete your own account");
  }

  const user = await User.findById(req.params.id);
  if (!user) return failure(res, 404, "User not found");

  if (user.role === "admin") {
    return failure(res, 400, "Admin accounts cannot be deleted");
  }

  await user.deleteOne();
  return success(res, 200, "User deleted successfully");
});
