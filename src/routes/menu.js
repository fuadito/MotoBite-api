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
// ?all=true → admin mode returns all items including hidden ones (for menu management)
// (no param) → customer mode returns only available items for ordering

router.get('/', async (req, res) => {
  try {
    const isAdmin = req.query.all === 'true';
    
    let query = supabase
      .from('menu_items')
      .select('*')
      .order('category',   { ascending: true })
      .order('sort_order', { ascending: true });

      // customers only see available items, admins see everything for management purposes
    if (!isAdmin) {
      query = query.eq('available', true);
    }
    const { data, error } = await query;

    if (error) throw error;

    // Group items by category — same structure as frontend MENU object
    const grouped = {};
    (data || []).forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

      console.log(
      isAdmin
        ? `📋 Admin menu fetch — ${data?.length || 0} total items`
        : `🍗 Customer menu fetch — ${data?.length || 0} available items`
    );

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

    if (typeof available !== 'boolean') {
      return res.status(400).json({ error: 'Available must be boolean' });
    }

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
    if (name !== undefined)        updates.name        = name;
    if (category !== undefined)    updates.category    = category;
    if (price !== undefined)       updates.price       = parseInt(price);
    if (description !== undefined) updates.description = description;
    if (img !== undefined)         updates.img         = img;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

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

    const { data, error } = await supabase
      .from('menu_items')
      .delete()  // ask supabase to return number of deleted rows
      .eq('id', id)
      .select(); // return deleted row(s) to confirm it existed

    if (error) throw error;

    // if nothing was deleted, the ID didn't exist
    if(!data || data.length ===0) {
      console.warn(`⚠️  Attempted to delete non-existent menu item ${id}`);
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    console.log(`🗑️  Menu item ${id} (${data[0]?.name}) deleted`);
    res.json({ success: true });

  } catch (err) {
    console.error('Delete menu item error:', err.message);
    res.status(500).json({ error: 'Could not delete item' });
  }
});


export default router;