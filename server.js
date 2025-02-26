/*******************************************************************
 * server.js
 * 
 * A minimal Express + MySQL API for a wishlist table.
 * With added admin functionality.
 *******************************************************************/

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv'); // For environment variables
const adminRoutes = require('./admin-routes');
const path = require('path');

// Load environment variables
dotenv.config();

// Create the Express app
const app = express();

// Allow JSON bodies in requests
app.use(express.json());

// Allow cross-origin requests (restrict to your Shopify store domain in production)
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:3000', 'https://yourshopifystore.myshopify.com']; // Add your actual Shopify store domain

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    // Check allowed origins
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Enable detailed request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Get database credentials from environment variables or use defaults for development
const dbConfig = {
  host: process.env.DB_HOST || 'northamerica-northeast1-001.proxy.kinsta.app',
  port: parseInt(process.env.DB_PORT || '30904'),
  user: process.env.DB_USER || 'hemlockandoak',
  password: process.env.DB_PASSWORD || 'wV0]pW3I*',
  database: process.env.DB_NAME || 'wishlist',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
  queueLimit: 0,
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '20000'), // Increased timeout to 20s
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Set up the database connection pool
const pool = mysql.createPool(dbConfig);

// Make the pool available to route handlers
app.locals.pool = pool;

// Test database connection on startup with retry logic
(async () => {
  let connected = false;
  const maxRetries = 5;
  let retries = 0;
  
  while (!connected && retries < maxRetries) {
    try {
      const connection = await pool.getConnection();
      console.log('Successfully connected to the database');
      connection.release();
      connected = true;
    } catch (err) {
      retries++;
      console.error(`Database connection attempt ${retries} failed:`, err);
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
    }
  }
  
  if (!connected) {
    console.error(`Failed to connect to database after ${maxRetries} attempts`);
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

    // Begin transaction to ensure database consistency
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Check if this item already exists to avoid duplicates
      const checkSql = `
        SELECT id FROM wishlist 
        WHERE user_id = ? AND product_id = ? AND variant_id = ?
      `;
      const [existing] = await connection.execute(checkSql, [user_id, product_id, variantValue]);

      if (existing && existing.length > 0) {
        console.log('Item already exists in wishlist');
        await connection.commit();
        connection.release();
        return res.json({ success: true, message: 'Item already in wishlist' });
      }

      // Insert the wishlist item
      const sql = `
        INSERT INTO wishlist (user_id, product_id, variant_id)
        VALUES (?, ?, ?)
      `;
      const [result] = await connection.execute(sql, [user_id, product_id, variantValue]);
      console.log('Item added to wishlist, ID:', result.insertId);

      await connection.commit();
      connection.release();
      
      return res.json({ 
        success: true, 
        message: 'Item added to wishlist', 
        id: result.insertId 
      });
    } catch (error) {
      // Rollback transaction on error
      await connection.rollback();
      connection.release();
      throw error;  // Re-throw to be caught by the outer catch block
    }
  } catch (error) {
    console.error('Error adding wishlist item:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error', 
      details: error.message 
    });
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

    return res.json({ 
      success: true, 
      message: 'Item removed from wishlist',
      affectedRows: result.affectedRows 
    });
  } catch (error) {
    console.error('Error removing wishlist item:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error', 
      details: error.message 
    });
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

    return res.json({ 
      success: true, 
      wishlist: rows 
    });
  } catch (error) {
    console.error('Error fetching wishlist items:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error', 
      details: error.message 
    });
  }
});

/********************************************************************
 * POST /api/wishlist/check
 * Checks if a specific product is in a user's wishlist
 * Expects a JSON body with { "user_id": "...", "product_id": "..." }
 ********************************************************************/
app.post('/api/wishlist/check', async (req, res) => {
  try {
    const { user_id, product_id, variant_id } = req.body;
    
    if (!user_id || !product_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id or product_id' });
    }

    // Always use empty string instead of null for variant_id to match database schema
    const variantValue = variant_id || '';

    const sql = `
      SELECT id FROM wishlist 
      WHERE user_id = ? AND product_id = ? AND variant_id = ?
    `;
    
    const [rows] = await pool.execute(sql, [user_id, product_id, variantValue]);
    
    return res.json({ 
      success: true, 
      inWishlist: rows.length > 0 
    });
  } catch (error) {
    console.error('Error checking wishlist item:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error', 
      details: error.message 
    });
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
      user: pool.config.user,
      // Never expose password
    }
  };
  
  res.json(poolStats);
});

/********************************************************************
 * Health check endpoint
 ********************************************************************/
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const connection = await pool.getConnection();
    await connection.execute('SELECT 1');
    connection.release();
    
    res.json({ 
      status: 'ok', 
      database: 'connected', 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    });
  }
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