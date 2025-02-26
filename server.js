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
 * Optional "variant_id".
 ********************************************************************/
app.post('/api/wishlist/add', async (req, res) => {
  try {
    const { user_id, product_id, variant_id } = req.body;
    
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

    // Insert the wishlist item
    const sql = `
      INSERT INTO wishlist (user_id, product_id, variant_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP
    `;
    
    // Debug - log exact SQL with parameters
    console.log('EXECUTING SQL:', sql.replace(/\n\s+/g, ' ').trim());
    console.log('WITH PARAMS:', [userIdStr, productIdStr, variantIdStr || null]);
    
    const [result] = await pool.execute(sql, [userIdStr, productIdStr, variantIdStr || null]);
    console.log('Insert result:', result);

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
    console.log('==========================================');

    const sql = `
      SELECT id, product_id, variant_id, created_at
      FROM wishlist
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    
    // Debug - log exact SQL with parameters
    console.log('EXECUTING SQL:', sql.replace(/\n\s+/g, ' ').trim());
    console.log('WITH PARAMS:', [userIdStr]);
    
    // Run the query with the string representation of user_id
    const [rows] = await pool.execute(sql, [userIdStr]);
    console.log(`Found ${rows.length} wishlist items for user ${userIdStr}`);
    
    // Debug ALL rows for the user_id
    console.log('ALL WISHLIST ITEMS:', JSON.stringify(rows, null, 2));

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
 * Start the server
 ********************************************************************/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wishlist API listening on port ${PORT}`);
  console.log(`Server started at: ${new Date().toISOString()}`);
  console.log(`Debug endpoint available at: http://localhost:${PORT}/api/debug/wishlist-user/YOUR_USER_ID`); 
});