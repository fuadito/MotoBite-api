// src/routes/menu.js

// Routes:
//   GET    /api/menu              — get full menu (customer)
//   PATCH  /api/menu/:id          — toggle item available/hidden
//   POST   /api/menu              — add new menu item (admin)
//   PUT    /api/menu/:id          — edit existing item (admin)
//   DELETE /api/menu/:id          — delete item (admin)


import express from 'express';
import supabase from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';

const router = express.Router();


// GET /api/menu
// Returns all available menu items grouped by category
// Called by renderMenu() in the frontend

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('available', true)
      .order('category',   { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // Group items by category — same structure as frontend MENU object
    const grouped = {};
    (data || []).forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    res.json(grouped);

  } catch (err) {
    console.error('Get menu error:', err.message);
    res.status(500).json({ error: 'Could not fetch menu' });
  }
});

// PATCH /api/menu/:id
// Toggle item available or hidden
// Called by toggleMenuItem() in admin frontend

router.patch('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { available } = req.body;

    const { error } = await supabase
      .from('menu_items')
      .update({ available })
      .eq('id', id);

    if (error) throw error;

    console.log(`🍗 Menu item ${id} → ${available ? 'visible' : 'hidden'}`);
    res.json({ success: true });

  } catch (err) {
    console.error('Toggle menu error:', err.message);
    res.status(500).json({ error: 'Could not update item' });
  }
});


// POST /api/menu
// Add a brand new menu item
// Called from admin panel when introducing a new item

router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, category, price, description, img, sort_order } = req.body;

    // Validate required fields
    if (!name || !category || !price) {
      return res.status(400).json({ error: 'Name, category and price are required' });
    }

    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        name,
        category,
        price:       parseInt(price),
        description: description  || null,
        img:         img          || null,
        sort_order:  sort_order   || 999,
        available:   true
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ New menu item added: ${name} (${category}) — KES ${price}`);
    res.json({ success: true, item: data });

  } catch (err) {
    console.error('Add menu item error:', err.message);
    res.status(500).json({ error: 'Could not add item' });
  }
});


// PUT /api/menu/:id
// Edit an existing menu item — name, price, description, image
// Called from admin panel

router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, description, img } = req.body;

    const updates = {};
    if (name)        updates.name        = name;
    if (category)    updates.category    = category;
    if (price)       updates.price       = parseInt(price);
    if (description) updates.description = description;
    if (img)         updates.img         = img;

    const { error } = await supabase
      .from('menu_items')
      .update(updates)
      .eq('id', id);

    if (error) throw error;

    console.log(`✏️  Menu item ${id} updated`);
    res.json({ success: true });

  } catch (err) {
    console.error('Edit menu item error:', err.message);
    res.status(500).json({ error: 'Could not edit item' });
  }
});

// DELETE /api/menu/:id
// Permanently delete a menu item

router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id);

    if (error) throw error;

    console.log(`🗑️  Menu item ${id} deleted`);
    res.json({ success: true });

  } catch (err) {
    console.error('Delete menu item error:', err.message);
    res.status(500).json({ error: 'Could not delete item' });
  }
});


export default router;