/*******************************************************************
 * admin-routes.js
 * 
 * Routes for a simple database admin interface that can be added to 
 * your existing Express API.
 *******************************************************************/

const express = require('express');
const router = express.Router();

// Create a basic admin page
router.get('/', async (req, res) => {
  try {
    // Generate a simple HTML page
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Wishlist Database Admin</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 1200px; margin: 0 auto; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .nav { margin-bottom: 20px; }
          .nav a { margin-right: 15px; }
          h1, h2 { color: #333; }
        </style>
      </head>
      <body>
        <h1>Wishlist Database Admin</h1>
        <div class="nav">
          <a href="/admin">Tables</a>
          <a href="/admin/wishlist">View Wishlist Table</a>
        </div>
        <h2>Available Tables</h2>
        <ul>
          <li><a href="/admin/wishlist">wishlist</a></li>
        </ul>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Admin page error:', error);
    res.status(500).send('Server error');
  }
});

// View the wishlist table
router.get('/wishlist', async (req, res) => {
  try {
    // Get database connection from the pool
    const connection = await req.app.locals.pool.getConnection();
    
    try {
      // Get all rows from the wishlist table
      const [rows] = await connection.query('SELECT * FROM wishlist ORDER BY created_at DESC LIMIT 1000');
      
      // Generate HTML table with the results
      let tableHtml = `
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>User ID</th>
              <th>Product ID</th>
              <th>Variant ID</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      // Add rows to the table
      rows.forEach(row => {
        tableHtml += `
          <tr>
            <td>${row.id}</td>
            <td>${row.user_id}</td>
            <td>${row.product_id}</td>
            <td>${row.variant_id || 'NULL'}</td>
            <td>${row.created_at}</td>
          </tr>
        `;
      });
      
      tableHtml += `
          </tbody>
        </table>
      `;
      
      // Complete HTML page
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Wishlist Table</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 1200px; margin: 0 auto; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .nav { margin-bottom: 20px; }
            .nav a { margin-right: 15px; }
            h1, h2 { color: #333; }
          </style>
        </head>
        <body>
          <h1>Wishlist Table</h1>
          <div class="nav">
            <a href="/admin">Back to Tables</a>
          </div>
          <h2>Total Records: ${rows.length}</h2>
          ${tableHtml}
        </body>
        </html>
      `;
      
      res.send(html);
    } finally {
      // Release the connection back to the pool
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching wishlist data:', error);
    res.status(500).send('Server error fetching wishlist data');
  }
});

module.exports = router;