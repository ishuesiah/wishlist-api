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
app.use(cors({
  origin: '*', // Allow all origins (consider restricting this in production)
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Enable more detailed error logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Set up the database connection pool using your Kinsta credentials
const pool = mysql.createPool({
  host: 'northamerica-northeast1-001.proxy.kinsta.app',
  port: 30904,
  user: 'hemlockandoak',
  password: 'wV0]pW3I*',
  database: 'wishlist',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Make the pool available to route handlers
app.locals.pool = pool;

// Test database connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to the database');
    connection.release();
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
})();

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
    
    // Log the request data for debugging
    console.log('Add wishlist item request:', { user_id, product_id, variant_id });
    
    // Basic validation
    if (!user_id || !product_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id or product_id' });
    }

    // Always use empty string instead of null for variant_id to match database schema
    const variantValue = variant_id || '';

    // Check if this item already exists to avoid duplicates
    const checkSql = `
      SELECT id FROM wishlist 
      WHERE user_id = ? AND product_id = ? AND variant_id = ?
    `;
    const [existing] = await pool.execute(checkSql, [user_id, product_id, variantValue]);

    if (existing && existing.length > 0) {
      console.log('Item already exists in wishlist');
      return res.json({ success: true, message: 'Item already in wishlist' });
    }

    // Insert the wishlist item
    const sql = `
      INSERT INTO wishlist (user_id, product_id, variant_id)
      VALUES (?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [user_id, product_id, variantValue]);
    console.log('Item added to wishlist, ID:', result.insertId);

    return res.json({ success: true });
  } catch (error) {
    console.error('Error adding wishlist item:', error);
    return res.status(500).json({ success: false, error: 'Server error', details: error.message });
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
    
    // Log the request data for debugging
    console.log('Remove wishlist item request:', { user_id, product_id, variant_id });

    if (!user_id || !product_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id or product_id' });
    }

    // Always use empty string instead of null for variant_id to match database schema
    const variantValue = variant_id || '';

    // Build a query that uses empty string instead of null
    const sql = 'DELETE FROM wishlist WHERE user_id = ? AND product_id = ? AND variant_id = ?';
    const params = [user_id, product_id, variantValue];

    const [result] = await pool.execute(sql, params);
    console.log('Items removed from wishlist:', result.affectedRows);

    return res.json({ success: true });
  } catch (error) {
    console.error('Error removing wishlist item:', error);
    return res.status(500).json({ success: false, error: 'Server error', details: error.message });
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
    console.log('Fetching wishlist for user:', user_id);
    
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id parameter' });
    }

    // Set cache-control header to prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const sql = `
      SELECT id, user_id, product_id, variant_id, created_at
      FROM wishlist
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    
    // Execute the query with proper error handling
    const [rows] = await pool.execute(sql, [user_id]);
    
    console.log(`Found ${rows.length} wishlist items for user ${user_id}`);
    
    // Debug log the first few items
    if (rows.length > 0) {
      console.log('First item:', JSON.stringify(rows[0]));
    }

    return res.json({ success: true, wishlist: rows });
  } catch (error) {
    console.error('Error fetching wishlist items:', error);
    return res.status(500).json({ success: false, error: 'Server error', details: error.message });
  }
});

/********************************************************************
 * GET /api/debug/pool
 * Returns information about the pool state (for debugging)
 ********************************************************************/
app.get('/api/debug/pool', (req, res) => {
  const poolStats = {
    threadId: pool.threadId,
    config: {
      connectionLimit: pool.config.connectionLimit,
      host: pool.config.host,
      port: pool.config.port,
      database: pool.config.database,
      user: pool.config.user
    }
  };
  
  res.json(poolStats);
});

/********************************************************************
 * Error handling middleware
 ********************************************************************/
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Server error', details: err.message });
});

/********************************************************************
 * Start the server
 ********************************************************************/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wishlist API listening on port ${PORT}`);
  console.log(`Admin interface available at http://localhost:${PORT}/admin`);
});

// Handle graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  console.log('Closing database pool...');
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (err) {
    console.error('Error closing database pool:', err);
  }
  process.exit(0);
}