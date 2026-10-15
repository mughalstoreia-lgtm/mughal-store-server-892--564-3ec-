import sendEmail from "../utils/sendemail.js";
import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import { success, failure } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { isEmail, isNonEmptyString } from "../utils/validate.js";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!isNonEmptyString(name, 1, 100)) {
    return failure(res, 400, "Name is required (max 100 characters)");
  }
  if (!email || !isEmail(email)) {
    return failure(res, 400, "Valid email is required");
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return failure(res, 400, "Password must be at least 6 characters long");
  }

  const userExists = await User.findOne({ email: email.toLowerCase().trim() });
  if (userExists) {
    return failure(res, 400, "User with this email already exists");
  }

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: "user",
    isActive: true,
  });

  const token = generateToken(user._id);

  return success(res, 201, "Account registered successfully", {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      isGoogleUser: user.isGoogleUser || false,
    },
  });
});

// POST /api/auth/google
export const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken || typeof idToken !== "string") {
    return failure(res, 400, "Google ID Token is required");
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch {
    return failure(res, 401, "Invalid Google Token");
  }

  const { email, name, picture, email_verified } = ticket.getPayload();

  if (!email_verified) {
    return failure(res, 400, "Google email is not verified");
  }

  let user = await User.findOne({ email: email.toLowerCase() });

  if (user) {
    if (!user.isActive) {
      return failure(res, 403, "This account has been deactivated");
    }
    if (!user.isGoogleUser && user.role.toLowerCase() !== "admin") {
      user.isGoogleUser = true;
      if (!user.avatar && picture) user.avatar = picture;
      await user.save();
    }
  } else {
    const randomPassword =
      Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);

    user = await User.create({
      name: name || email.split("@")[0],
      email: email.toLowerCase(),
      avatar: picture || "",
      password: randomPassword,
      role: "user",
      isActive: true,
      isGoogleUser: true,
    });
  }

  const token = generateToken(user._id);

  return success(res, 200, "Google login successful", {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      isGoogleUser: user.isGoogleUser,
    },
  });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return failure(res, 400, "Email and password are required");
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    "+password"
  );

  if (!user) {
    return failure(res, 401, "Invalid email or password");
  }

  if (!user.isActive) {
    return failure(res, 403, "This account has been deactivated");
  }

  if (user.isGoogleUser && user.role.toLowerCase() !== "admin") {
    return failure(
      res,
      400,
      "This account was created with Google. Please use 'Continue with Google' to sign in."
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return failure(res, 401, "Invalid email or password");
  }

  const token = generateToken(user._id);

  return success(res, 200, "Login successful", {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      isGoogleUser: user.isGoogleUser,
    },
  });
});

// POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email || !isEmail(email)) {
    return failure(res, 400, "Valid email is required");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    return failure(res, 404, "No account found with that email");
  }

  if (user.isGoogleUser && user.role.toLowerCase() !== "admin") {
    return failure(
      res,
      400,
      "This account is linked with Google Sign-In. You do not need a password to log in."
    );
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/auth/reset-password?token=${resetToken}`;

  const message = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your Mughal Store account.</p>
      <p>Please click the button below to reset your password. This link is valid for 10 minutes:</p>
      <a href="${resetUrl}" style="background-color: #d97706; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0;">Reset Password</a>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;

  try {
    await sendEmail({
      email: user.email,
      subject: "Mughal Store - Password Reset",
      message,
    });
    return success(res, 200, "Password reset link sent to your email");
  } catch {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return failure(res, 500, "Email could not be sent. Please try again.");
  }
});

// POST /api/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || typeof token !== "string") {
    return failure(res, 400, "Token is required");
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return failure(res, 400, "Password must be at least 6 characters long");
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return failure(res, 400, "Invalid or expired reset token");
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  return success(res, 200, "Password reset successful. You can now log in.");
});

// GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  return success(res, 200, "Current user fetched", {
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    avatar: req.user.avatar,
    phone: req.user.phone || "",
    isGoogleUser: req.user.isGoogleUser || false,
  });
});

// POST /api/auth/logout
export const logout = asyncHandler(async (req, res) => {
  return success(res, 200, "Logged out successfully");
});

// PUT /api/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, avatar, phone } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) return failure(res, 404, "User not found");

  if (name !== undefined) {
    if (!isNonEmptyString(name, 1, 100)) {
      return failure(res, 400, "Name must be 1–100 characters");
    }
    user.name = name.trim();
  }
  if (avatar !== undefined) user.avatar = String(avatar).slice(0, 500);
  if (phone !== undefined) user.phone = String(phone).slice(0, 30);

  await user.save();

  return success(res, 200, "Profile updated successfully", {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    phone: user.phone,
    isGoogleUser: user.isGoogleUser || false,
  });
});

// PUT /api/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (req.user.isGoogleUser && req.user.role.toLowerCase() !== "admin") {
    return failure(
      res,
      400,
      "Google accounts use OAuth authentication and cannot change passwords."
    );
  }

  if (!currentPassword || !newPassword) {
    return failure(res, 400, "Current and new password are required");
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return failure(res, 400, "New password must be at least 6 characters");
  }

  const user = await User.findById(req.user._id).select("+password");
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return failure(res, 401, "Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  return success(res, 200, "Password changed successfully");
});
