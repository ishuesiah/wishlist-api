/*******************************************************************
 * server.js
 * 
 * A minimal Express + MySQL API for a wishlist table.
 * With added admin functionality.
 *******************************************************************/

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const adminRoutes = require('./admin-routes'); // Import the admin routes

// Create the Express app
const app = express();

// Allow JSON bodies in requests
app.use(express.json());

// Allow cross-origin requests (e.g., from your Shopify store domain)
app.use(cors());

// Set up the database connection pool using your Kinsta credentials
const pool = mysql.createPool({
  host: 'northamerica-northeast1-001.proxy.kinsta.app',
  port: 30904,
  user: 'hemlockandoak',
  password: 'wV0]pW3I*',
  database: 'wishlist'
});

// Make the pool available to route handlers
app.locals.pool = pool;

/********************************************************************
 * Simple root route to confirm server is running
 ********************************************************************/
app.get('/', (req, res) => {
  res.send('Wishlist API is up and running!');
});

/********************************************************************
 * Admin routes - Add this for the admin interface
 ********************************************************************/
app.use('/admin', adminRoutes);

/********************************************************************
 * POST /api/wishlist/add
 * Inserts a new wishlist item into the database.
 * Expects a JSON body with at least { "user_id": "...", "product_id": "..." }
 * Optional "variant_id".
 ********************************************************************/
app.post('/api/wishlist/add', async (req, res) => {
  try {
    const { user_id, product_id, variant_id } = req.body;
    
    // Basic validation
    if (!user_id || !product_id) {
      return res.status(400).json({ error: 'Missing user_id or product_id' });
    }

    // Insert the wishlist item
    const sql = `
      INSERT INTO wishlist (user_id, product_id, variant_id)
      VALUES (?, ?, ?)
    `;
    await pool.execute(sql, [user_id, product_id, variant_id || null]);

    return res.json({ success: true });
  } catch (error) {
    console.error('Error adding wishlist item:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/********************************************************************
 * POST /api/wishlist/remove
 * Removes a wishlist item for the specified user.
 * Expects a JSON body with { "user_id": "...", "product_id": "..." }
 * Optionally also "variant_id" if you're storing that as well.
 ********************************************************************/
app.post('/api/wishlist/remove', async (req, res) => {
  try {
    const { user_id, product_id, variant_id } = req.body;

    if (!user_id || !product_id) {
      return res.status(400).json({ error: 'Missing user_id or product_id' });
    }

    // Build a query that optionally checks variant_id if it's provided
    let sql = 'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?';
    const params = [user_id, product_id];

    if (variant_id) {
      sql += ' AND variant_id = ?';
      params.push(variant_id);
    }

    await pool.execute(sql, params);

    return res.json({ success: true });
  } catch (error) {
    console.error('Error removing wishlist item:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/********************************************************************
 * GET /api/wishlist/:user_id
 * Retrieves all wishlist items for a specific user.
 * Example: /api/wishlist/1234
 ********************************************************************/
app.get('/api/wishlist/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id parameter' });
    }

    const sql = `
      SELECT id, product_id, variant_id, created_at
      FROM wishlist
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    const [rows] = await pool.execute(sql, [user_id]);

    return res.json({ wishlist: rows });
  } catch (error) {
    console.error('Error fetching wishlist items:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/********************************************************************
 * Start the server
 ********************************************************************/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wishlist API listening on port ${PORT}`);
  console.log(`Admin interface available at http://localhost:${PORT}/admin`);
});