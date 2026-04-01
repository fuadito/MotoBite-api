// src/middleware/adminOnly.js
// Protects admin routes — only allows users with role 'admin'
// Must be used AFTER authenticate middleware

export function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    console.warn(`🚫 Admin access denied for ${req.user.email || req.user.phone} (role: ${req.user.role})`);
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}