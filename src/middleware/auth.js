// src/middleware/auth.js
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    return res.status(401).json({ error: "Invalid token" });
  }
  
  const data = JSON.parse(Buffer.from(parts[1], "base64").toString());
  req.user = { id: data.sub, email: data.email, role: "admin" };
  console.log("🔐 Auth:", req.user.email);
  next();
}

export async function authenticateOrHeader(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authenticate(req, res, next);
  }
  const phone = req.headers["x-user-phone"];
  if (phone) {
    req.user = { id: null, phone, email: null, role: "customer" };
    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
}
