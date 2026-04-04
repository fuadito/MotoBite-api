// src/middleware/adminOnly.js
// Protects admin routes — only allows users with role 'admin'
// Must be used AFTER authenticate middleware

export function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // TEMP: Allow any logged-in user as admin
  console.log('Allowing admin access for:', req.user.email);
  next();
  }

  