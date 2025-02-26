const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

// Create the Express app
const app = express();

// Increase the JSON payload size limit (if large images are being sent)
app.use(express.json({ limit: '2mb' }));

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

// For debug: test the database connection immediately
(async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Successfully connected to database!');
    
    // Show all tables for debug
    const [tables] = await connection.query('SHOW TABLES');
    console.log('Available tables:', tables.map(t => Object.values(t)[0]));
    
    // Show schema of wishlist table
    const [columns] = await connection.query('DESCRIBE wishlist');
    console.log('Wishlist table structure:');
    columns.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${col.Key}`);
    });
    
    // Show a sample of data from wishlist table
    const [sample] = await connection.query('SELECT * FROM wishlist LIMIT 5');
    console.log('Sample wishlist data:', JSON.stringify(sample, null, 2));
    
    connection.release();
  } catch (err) {
    console.error('❌ Database connection error:', err);
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
 * POST /api/wishlist/add
 * Inserts a new wishlist item into the database.
 * Expects a JSON body with at least { "user_id": "...", "product_id": "..." }
 * Optional fields: variant_id, product_title, product_handle, product_image, 
 * variant_title, variant_image
 ********************************************************************/
app.post('/api/wishlist/add', async (req, res) => {
  try {
    console.log('=== ADD WISHLIST ITEM ===');
    console.log('Received request body:', req.body);
    
    // Extract all possible fields, using defaults for optional ones
    const user_id = req.body.user_id || null;
    const product_id = req.body.product_id || null;
    const product_title = req.body.product_title || null;
    const product_handle = req.body.product_handle || null;
    const product_image = req.body.product_image || null;
    const variant_id = req.body.variant_id || null;
    const variant_title = req.body.variant_title || null;
    const variant_image = req.body.variant_image || null;
    
    // Log each field separately for debugging
    console.log('Extracted fields:');
    console.log('- user_id:', user_id, typeof user_id);
    console.log('- product_id:', product_id, typeof product_id);
    console.log('- product_title:', product_title, typeof product_title);
    console.log('- product_handle:', product_handle, typeof product_handle);
    console.log('- product_image:', product_image, typeof product_image);
    console.log('- variant_id:', variant_id, typeof variant_id);
    console.log('- variant_title:', variant_title, typeof variant_title);
    console.log('- variant_image:', variant_image, typeof variant_image);
    
    // Basic validation
    if (!user_id || !product_id) {
      return res.status(400).json({ error: 'Missing user_id or product_id' });
    }

    // Convert user_id, product_id and variant_id to strings to ensure consistent handling
    const userIdStr = String(user_id);
    const productIdStr = String(product_id);
    // Ensure variant_id is either a string or empty string (not null)
    const variantIdStr = variant_id ? String(variant_id) : '';

    // IMPORTANT: Log the exact user_id we're using, to debug issues
    console.log('Adding wishlist item for user_id:', userIdStr, 'product_id:', productIdStr, 'variant_id:', variantIdStr || 'null');

    // Insert the wishlist item with additional product data
    const sql = `
      INSERT INTO wishlist (
        user_id, 
        product_id, 
        product_title, 
        product_handle, 
        product_image,
        variant_id, 
        variant_title,
        variant_image
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        created_at = CURRENT_TIMESTAMP,
        product_title = VALUES(product_title),
        product_handle = VALUES(product_handle),
        product_image = VALUES(product_image),
        variant_title = VALUES(variant_title),
        variant_image = VALUES(variant_image)
    `;
    
    // Create the parameters array
    const params = [
      userIdStr, 
      productIdStr, 
      product_title, 
      product_handle, 
      product_image,
      variantIdStr || '',  // Ensure empty string instead of null
      variant_title, 
      variant_image
    ];
    
    // Debug - log exact SQL with parameters
    console.log('EXECUTING SQL:', sql.replace(/\n\s+/g, ' ').trim());
    console.log('WITH PARAMS:', params);
    
    try {
      const [result] = await pool.execute(sql, params);
      console.log('Insert result:', result);
    } catch (dbError) {
      console.error('Database error during insert:', dbError);
      
      // Try to get more detailed information about the error
      console.log('Attempting to debug values:');
      for (let i = 0; i < params.length; i++) {
        console.log(`Param ${i}:`, params[i], typeof params[i], params[i] === null ? 'is null' : 'not null');
      }
      
      throw dbError;
    }

    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error adding wishlist item:', error);
    return res.status(500).json({ error: 'Server error: ' + error.message });
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
    console.log('=== REMOVE WISHLIST ITEM ===');
    console.log('Received request body:', req.body);
    
    const { user_id, product_id, variant_id } = req.body;

    // Convert user_id, product_id and variant_id to strings to ensure consistent handling
    const userIdStr = String(user_id);
    const productIdStr = String(product_id);
    const variantIdStr = variant_id ? String(variant_id) : '';

    // IMPORTANT: Log the exact user_id we're using, to debug issues
    console.log('Removing wishlist item for user_id:', userIdStr, 'product_id:', productIdStr, 'variant_id:', variantIdStr || 'null');

    if (!userIdStr || !productIdStr) {
      return res.status(400).json({ error: 'Missing user_id or product_id' });
    }

    // Build a query that optionally checks variant_id if it's provided
    let sql = 'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?';
    const params = [userIdStr, productIdStr];

    if (variantIdStr) {
      sql += ' AND variant_id = ?';
      params.push(variantIdStr);
    }

    // Debug - log exact SQL with parameters
    console.log('EXECUTING SQL:', sql);
    console.log('WITH PARAMS:', params);
    
    const [result] = await pool.execute(sql, params);
    console.log('Delete result:', result);
    
    if (result.affectedRows === 0) {
      console.log('No rows affected, item may not exist');
    }

    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error removing wishlist item:', error);
    return res.status(500).json({ error: 'Server error: ' + error.message });
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

    // Convert user_id to string to ensure consistent handling
    const userIdStr = String(user_id);

    // IMPORTANT: Log the exact user_id we're querying, to debug issues
    console.log('==========================================');
    console.log('WISHLIST REQUEST RECEIVED');
    console.log('Fetching wishlist for user_id:', userIdStr, 'Type:', typeof userIdStr);
    console.log('Request params:', req.params);
    console.log('Request headers:', req.headers);
    console.log('==========================================');

    // Check if this is a direct fetch or cache busting request
    const isDirectFetch = req.headers['x-direct-fetch'] === 'true' || req.query._t || req.query._nocache;
    let connection;
    let rows;
    
    // Query for all columns in wishlist table
    const sqlQuery = `
      SELECT id, user_id, product_id, variant_id, 
             product_title, product_handle, product_image,
             variant_title, variant_image, created_at
      FROM wishlist
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    
    if (isDirectFetch) {
      console.log('DIRECT FETCH DETECTED - Using fresh connection');
      // Create a new connection to ensure no connection pooling cache
      connection = await pool.getConnection();
      [rows] = await connection.execute(sqlQuery, [userIdStr]);
      console.log(`Direct fetch found ${rows.length} items for user ${userIdStr}`);
      connection.release();
    } else {
      // Standard query - now include all new fields
      console.log('EXECUTING SQL:', sqlQuery.replace(/\n\s+/g, ' ').trim());
      console.log('WITH PARAMS:', [userIdStr]);
      
      [rows] = await pool.execute(sqlQuery, [userIdStr]);
      console.log(`Found ${rows.length} wishlist items for user ${userIdStr}`);
    }
    
    // Debug ALL rows for the user_id
    console.log('ALL WISHLIST ITEMS:', JSON.stringify(rows, null, 2));
    
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({ wishlist: rows });
  } catch (error) {
    console.error('Error fetching wishlist items:', error);
    return res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/********************************************************************
 * Special debug endpoint to verify user_id handling
 ********************************************************************/
app.get('/api/debug/wishlist-user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    console.log('Debug endpoint called with user_id:', user_id, 'Type:', typeof user_id);
    
    // Convert to string for consistent handling
    const userIdStr = String(user_id);
    
    // Try to query with this user_id
    const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM wishlist WHERE user_id = ?', [userIdStr]);
    
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.json({ 
      received_user_id: userIdStr,
      timestamp: new Date().toISOString(),
      item_count: rows[0].count
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/********************************************************************
 * Direct SQL diagnostic endpoint to view database contents
 ********************************************************************/
app.get('/api/admin/check-database', async (req, res) => {
  try {
    // Check if there's a secret key in the request to prevent unauthorized access
    const authKey = req.query.key;
    if (authKey !== 'wishlist-check-123') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get all users in the database
    const [users] = await pool.query('SELECT DISTINCT user_id FROM wishlist');
    
    // Get the count of items for each user
    const userCounts = [];
    for (const user of users) {
      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as count FROM wishlist WHERE user_id = ?', 
        [user.user_id]
      );
      userCounts.push({
        user_id: user.user_id,
        items_count: countResult[0].count
      });
    }
    
    // Get a sample of items from the database
    const [sampleItems] = await pool.query('SELECT * FROM wishlist LIMIT 20');
    
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    return res.json({
      total_users: users.length,
      users_with_counts: userCounts,
      sample_items: sampleItems
    });
    
  } catch (error) {
    console.error('Database check error:', error);
    return res.status(500).json({ error: 'Database check failed: ' + error.message });
  }
});

/********************************************************************
 * Start the server
 ********************************************************************/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wishlist API listening on port ${PORT}`);
  console.log(`Server started at: ${new Date().toISOString()}`);
  console.log(`Debug endpoint available at: http://localhost:${PORT}/api/debug/wishlist-user/YOUR_USER_ID`);
  console.log(`Database check endpoint: http://localhost:${PORT}/api/admin/check-database?key=wishlist-check-123`);
});