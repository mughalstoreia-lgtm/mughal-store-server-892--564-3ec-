/**
 * Lightweight validation helpers (no extra deps).
 * Returns first error message string, or null if valid.
 */

export const isEmail = (v) =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const isNonEmptyString = (v, min = 1, max = 500) =>
  typeof v === "string" && v.trim().length >= min && v.trim().length <= max;

export const isPositiveNumber = (v) => {
  const n = Number(v);
  return !Number.isNaN(n) && n >= 0;
};

export const isObjectId = (v) =>
  typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);

export const requiredFields = (obj, fields) => {
  for (const f of fields) {
    const val = obj?.[f];
    if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
      return `${f} is required`;
    }
  }
  return null;
};

export const sanitizeString = (v, max = 500) => {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
};
