import express from "express";
import { getStoreSettings, updateStoreSettings } from "../controllers/settingController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router.get("/settings", getStoreSettings);
router.put("/settings", protect, authorize("admin"), updateStoreSettings);

export default router;
