import StoreSetting from "../models/StoreSetting.js";
import { success, failure } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// GET /api/store/settings
export const getStoreSettings = asyncHandler(async (req, res) => {
  let settings = await StoreSetting.findOne();
  if (!settings) {
    settings = await StoreSetting.create({});
  }
  return success(res, 200, "Store settings fetched", settings);
});

// PUT /api/store/settings
export const updateStoreSettings = asyncHandler(async (req, res) => {
  const { storeName, storeEmail, primaryPhone, secondaryPhone, whatsappOne, whatsappTwo } = req.body;

  let settings = await StoreSetting.findOne();
  if (!settings) {
    settings = new StoreSetting({});
  }

  // Optional fields handling (allows clearing out or partial updates)
  settings.storeName = storeName !== undefined ? String(storeName).slice(0, 120) : settings.storeName;
  settings.storeEmail = storeEmail !== undefined ? String(storeEmail).slice(0, 120) : settings.storeEmail;
  settings.primaryPhone = primaryPhone !== undefined ? String(primaryPhone).slice(0, 30) : settings.primaryPhone;
  settings.secondaryPhone = secondaryPhone !== undefined ? String(secondaryPhone).slice(0, 30) : settings.secondaryPhone;
  settings.whatsappOne = whatsappOne !== undefined ? String(whatsappOne).slice(0, 30) : settings.whatsappOne;
  settings.whatsappTwo = whatsappTwo !== undefined ? String(whatsappTwo).slice(0, 30) : settings.whatsappTwo;

  const updated = await settings.save();
  return success(res, 200, "Store settings updated successfully", updated);
});