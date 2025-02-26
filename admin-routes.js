const express = require('express');
const router = express.Router();

// Admin dashboard route
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    
    // Get wishlist data (with added error handling and pagination)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    
    // Get connection from pool
    const connection = await pool.getConnection();
    
    try {
      // Execute queries
      const [rows] = await connection.execute(`
        SELECT id, user_id, product_id, variant_id, created_at
        FROM wishlist
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);
      
      const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM wishlist');
      const totalItems = countResult[0].total;
      
      // Release connection back to pool
      connection.release();
      
      // User filters
      const userFilter = req.query.user_id || '';
      const productFilter = req.query.product_id || '';
      
      // Generate admin page HTML
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Wishlist Admin</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; position: sticky; top: 0; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .pagination { margin-top: 20px; }
            .pagination a { margin-right: 10px; }
            .actions { display: flex; gap: 10px; }
            .delete-btn { color: red; cursor: pointer; }
            .refresh-btn { margin-bottom: 20px; }
            .filters { margin-bottom: 20px; display: flex; gap: 10px; }
            .filters input { padding: 5px; }
            .filters button { padding: 5px 10px; }
            .dashboard-stats { 
              display: grid; 
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
              gap: 15px; 
              margin-bottom: 20px;
            }
            .stat-card {
              padding: 15px;
              background-color: #f2f2f2;
              border-radius: 5px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .stat-card h3 { margin-top: 0; }
            @media (max-width: 768px) {
              .table-container { overflow-x: auto; }
            }
          </style>
        </head>
        <body>
          <h1>Wishlist Admin Dashboard</h1>
          
          <div class="dashboard-stats">
            <div class="stat-card">
              <h3>Total Items</h3>
              <p>${totalItems}</p>
            </div>
            <div class="stat-card">
              <h3>Current Page</h3>
              <p>${page}</p>
            </div>
            <div class="stat-card">
              <h3>Items Per Page</h3>
              <p>${limit}</p>
            </div>
          </div>
          
          <button class="refresh-btn" onclick="window.location.reload()">Refresh Data</button>
          
          <div class="filters">
            <input type="text" id="user-filter" placeholder="Filter by User ID" value="${userFilter}">
            <input type="text" id="product-filter" placeholder="Filter by Product ID" value="${productFilter}">
            <button onclick="applyFilters()">Apply Filters</button>
            <button onclick="clearFilters()">Clear</button>
          </div>
          
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User ID</th>
                  <th>Product ID</th>
                  <th>Variant ID</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(item => `
                  <tr data-id="${item.id}">
                    <td>${item.id}</td>
                    <td>${item.user_id}</td>
                    <td>${item.product_id}</td>
                    <td>${item.variant_id}</td>
                    <td>${new Date(item.created_at).toLocaleString()}</td>
                    <td class="actions">
                      <span class="delete-btn" onclick="deleteItem(${item.id})">Delete</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="pagination">
            ${page > 1 ? `<a href="?page=${page - 1}&limit=${limit}&user_id=${userFilter}&product_id=${productFilter}">Previous</a>` : ''}
            <span>Page ${page}</span>
            ${rows.length === limit ? `<a href="?page=${page + 1}&limit=${limit}&user_id=${userFilter}&product_id=${productFilter}">Next</a>` : ''}
          </div>
          
          <script>
            // Function to delete an item
            async function deleteItem(id) {
              if (!confirm('Are you sure you want to delete this item?')) {
                return;
              }
              
              try {
                const response = await fetch('/admin/delete/' + id, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                });
                
                const data = await response.json();
                
                if (data.success) {
                  // Remove the row from the table
                  document.querySelector(\`tr[data-id="\${id}"]\`).remove();
                  alert('Item deleted successfully');
                } else {
                  alert('Error: ' + (data.error || 'Failed to delete item'));
                }
              } catch (error) {
                alert('Error: ' + error.message);
              }
            }
            
            // Function to apply filters
            function applyFilters() {
              const userFilter = document.getElementById('user-filter').value;
              const productFilter = document.getElementById('product-filter').value;
              
              let url = window.location.pathname + '?page=1&limit=${limit}';
              if (userFilter) url += '&user_id=' + encodeURIComponent(userFilter);
              if (productFilter) url += '&product_id=' + encodeURIComponent(productFilter);
              
              window.location.href = url;
            }
            
            // Function to clear filters
            function clearFilters() {
              window.location.href = window.location.pathname + '?page=1&limit=${limit}';
            }
            
            // Auto-refresh timer variable
            let autoRefreshTimer;
            
            // Function to start auto-refresh
            function startAutoRefresh() {
              // Clear existing timer if any
              if (autoRefreshTimer) clearInterval(autoRefreshTimer);
              
              // Set new timer for 30 seconds
              autoRefreshTimer = setInterval(() => {
                window.location.reload();
              }, 30000);
            }
            
            // Start auto-refresh when page loads
            startAutoRefresh();
            
            // Pause auto-refresh when user interacts with the page
            document.addEventListener('click', () => {
              clearInterval(autoRefreshTimer);
              // Restart after 5 minutes of inactivity
              setTimeout(startAutoRefresh, 300000);
            });
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    } catch (error) {
      // Make sure connection is released on error
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).send(`
      <h1>Error</h1>
      <p>Failed to load admin dashboard: ${error.message}</p>
      <a href="/admin">Try again</a>
    `);
  }
});

// Filter wishlist items by user or product ID
router.get('/filter', async (req, res) => {
  try {
    const { user_id, product_id } = req.query;
    const pool = req.app.locals.pool;
    
    // Build query based on provided filters
    let sql = 'SELECT * FROM wishlist WHERE 1=1';
    const params = [];
    
    if (user_id) {
      sql += ' AND user_id = ?';
      params.push(user_id);
    }
    
    if (product_id) {
      sql += ' AND product_id = ?';
      params.push(product_id);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    // Execute the query
    const [rows] = await pool.execute(sql, params);
    
    return res.json({ success: true, wishlist: rows });
  } catch (error) {
    console.error('Error filtering wishlist items:', error);
    return res.status(500).json({ success: false, error: 'Server error', details: error.message });
  }
});

// Delete wishlist item endpoint
router.post('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = req.app.locals.pool;
    
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing item ID' });
    }
    
    // Get connection from pool
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Delete the item
      const [result] = await connection.execute('DELETE FROM wishlist WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ success: false, error: 'Item not found' });
      }
      
      await connection.commit();
      connection.release();
      
      console.log(`Admin deleted wishlist item ID: ${id}`);
      return res.json({ success: true });
    } catch (error) {
      // Rollback and release connection on error
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    return res.status(500).json({ success: false, error: 'Server error', details: error.message });
  }
});

module.exports = router;