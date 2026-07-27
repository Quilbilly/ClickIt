import { config } from "../config.js";

export function adminAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : (req.get("x-admin-token") || "").trim();

  if (!token || !config.adminTokens.includes(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}
