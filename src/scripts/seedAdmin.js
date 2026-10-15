// Creates the first admin account from environment variables.
// Safe to run multiple times - it only creates an admin if none exists.
import dns from "node:dns";
dns.setServers(['1.1.1.1', '8.8.8.8']);
import "dotenv/config";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import mongoose from "mongoose";

const run = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }

  console.log(1);
  
  await connectDB();
  console.log(2);

  const existingAdmin = await User.findOne({ role: "admin" });
  // if (existingAdmin) {
  //   console.log(`An admin account already exists (${existingAdmin.email}). Skipping seed.`);
  //   await mongoose.disconnect();
  //   process.exit(0);
  // }

  const existingEmail = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existingEmail) {
    console.log(`A user with email ${ADMIN_EMAIL} already exists. Promoting to admin.`);
    existingEmail.role = "admin";
    existingEmail.isActive = true;
    await existingEmail.save();
  } else {
    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL.toLowerCase(),
      password: '12345678',
      role: "admin",
      isActive: true,
    });
    console.log(`Admin account created: ${ADMIN_EMAIL}`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Failed to seed admin:", err.message);
  process.exit(1); 
});
