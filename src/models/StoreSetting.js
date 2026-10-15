import mongoose from "mongoose";

const storeSettingSchema = new mongoose.Schema(
  {
    storeName: { type: String, default: "", trim: true, maxlength: 120 },
    storeEmail: { type: String, default: "", trim: true, maxlength: 120 },
    primaryPhone: { type: String, default: "", trim: true, maxlength: 30 },
    secondaryPhone: { type: String, default: "", trim: true, maxlength: 30 },
    whatsappOne: { type: String, default: "", trim: true, maxlength: 30 },
    whatsappTwo: { type: String, default: "", trim: true, maxlength: 30 },
  },
  { timestamps: true }
);

// export default mongoose.model("StoreSetting", storeSettingSchema);
export default mongoose.models.StoreSetting || mongoose.model("StoreSetting", storeSettingSchema);