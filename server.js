/*******************************************************************
 * server.js
 * 
 * A minimal Express + MySQL API for a wishlist table.
 * Replace the credentials below with your own.
 * Then run: 
 *    npm install express mysql2 cors
 *    node server.js
 *******************************************************************/

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

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
    
    // Check if we need to alter the table to add new columns
    const requiredColumns = [
      'product_title VARCHAR(255)',
      'product_handle VARCHAR(255)',
      'product_image VARCHAR(512)',
      'variant_title VARCHAR(255)',
      'variant_image VARCHAR(512)'
    ];
    
    // Convert columns to lowercase for case-insensitive comparison
    const existingColumns = columns.map(col => col.Field.toLowerCase());
    
    for (const columnDef of requiredColumns) {
      const columnName = columnDef.split(' ')[0].toLowerCase();
      if (!existingColumns.includes(columnName)) {
        try {
          console.log(`Adding missing column: ${columnName}`);
          await connection.query(`ALTER TABLE wishlist ADD COLUMN ${columnDef}`);
          console.log(`✅ Added column ${columnName} successfully`);
        } catch (err) {
          console.error(`❌ Error adding column ${columnName}:`, err.message);
        }
      }
    }
    
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
    const { 
      user_id, 
      product_id, 
      product_title, 
      product_handle, 
      product_image,
      variant_id, 
      variant_title,
      variant_image
    } = req.body;
    
    // Basic validation
    if (!user_id || !product_id) {
      return res.status(400).json({ error: 'Missing user_id or product_id' });
    }

    // Convert user_id, product_id and variant_id to strings to ensure consistent handling
    const userIdStr = String(user_id);
    const productIdStr = String(product_id);
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
    
    // Debug - log exact SQL with parameters
    console.log('EXECUTING SQL:', sql.replace(/\n\s+/g, ' ').trim());
    console.log('WITH PARAMS:', [
      userIdStr, 
      productIdStr, 
      product_title || null,
      product_handle || null,
      product_image || null,
      variantIdStr || null,
      variant_title || null,
      variant_image || null
    ]);
    
    const [result] = await pool.execute(sql, [
      userIdStr, 
      productIdStr, 
      product_title || null,
      product_handle || null,
      product_image || null,
      variantIdStr || null,
      variant_title || null,
      variant_image || null
    ]);
    console.log('Insert result:', result);

    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
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
    
    if (isDirectFetch) {
      console.log('DIRECT FETCH DETECTED - Using fresh connection');
      // Create a new connection to ensure no connection pooling cache
      connection = await pool.getConnection();
      [rows] = await connection.execute(
        'SELECT id, product_id, product_title, product_handle, product_image, variant_id, variant_title, variant_image, created_at FROM wishlist WHERE user_id = ?', 
        [userIdStr]
      );
      console.log(`Direct fetch found ${rows.length} items for user ${userIdStr}`);
      connection.release();
    } else {
      // Standard query - now include all new fields
      const sql = `
        SELECT id, product_id, product_title, product_handle, product_image, 
               variant_id, variant_title, variant_image, created_at
        FROM wishlist
        WHERE user_id = ?
        ORDER BY created_at DESC
      `;
      
      console.log('EXECUTING SQL:', sql.replace(/\n\s+/g, ' ').trim());
      console.log('WITH PARAMS:', [userIdStr]);
      
      [rows] = await pool.execute(sql, [userIdStr]);
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
    return res.status(500).json({ error: 'Server error' });
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
    return res.status(500).json({ error: 'Server error' });
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
    return res.status(500).json({ error: 'Database check failed' });
  }
});

/********************************************************************
 * Force direct wishlist endpoint to bypass any caching
 ********************************************************************/
app.get('/api/admin/force-wishlist/:actual_user_id', async (req, res) => {
  try {
    const { actual_user_id } = req.params;
    const secretKey = req.query.key || '';
    
    // Simple security check - require a secret key
    if (secretKey !== 'custom-secret-12345') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    if (!actual_user_id) {
      return res.status(400).json({ error: 'Missing user_id parameter' });
    }

    // Convert user_id to string to ensure consistent handling
    const userIdStr = String(actual_user_id);
    
    console.log('FORCE ENDPOINT: Fetching wishlist for user_id:', userIdStr);

    // Direct database query with minimal processing - include all columns
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM wishlist WHERE user_id = ?', [userIdStr]);
    connection.release();
    
    console.log(`FORCE ENDPOINT: Found ${rows.length} wishlist items`);
    
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({ 
      wishlist: rows,
      diagnostic: {
        user_id_provided: userIdStr,
        query_time: new Date().toISOString(),
        row_count: rows.length
      }
    });
  } catch (error) {
    console.error('Error in force wishlist endpoint:', error);
    return res.status(500).json({ error: 'Server error' });
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
  console.log(`Force direct wishlist endpoint: http://localhost:${PORT}/api/admin/force-wishlist/YOUR_USER_ID?key=custom-secret-12345`);
  console.log(`Database check endpoint: http://localhost:${PORT}/api/admin/check-database?key=wishlist-check-123`);
});