// server.js - Node.js MySQL API Server
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const PORT = 3000;

// MySQL Configuration
const dbConfig = {
    host: '209.15.97.4',
    user: 'root',
    password: 'dG6%AbDN',
    database: 'inventory',
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Initialize database tables
async function initDatabase() {
    try {
        const connection = await pool.getConnection();
        
        // Create inventory table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS inventory_items (
                id BIGINT PRIMARY KEY,
                category VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10,2) NOT NULL DEFAULT 0,
                initial_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
                used_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
                remaining_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
                created_by VARCHAR(255) NOT NULL,
                created_date DATETIME NOT NULL,
                updated_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        // Create daily reports table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS daily_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                report_date DATE NOT NULL UNIQUE,
                user_name VARCHAR(255) NOT NULL,
                total_items INT NOT NULL DEFAULT 0,
                total_value DECIMAL(15,2) NOT NULL DEFAULT 0,
                used_value DECIMAL(15,2) NOT NULL DEFAULT 0,
                report_data JSON,
                created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        connection.release();
        console.log('✅ Database tables initialized successfully');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}

// API Routes

// Test connection
app.get('/api/test-connection', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.execute('SELECT 1');
        connection.release();
        
        res.json({ 
            success: true, 
            message: 'Database connection successful',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Connection test failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Database connection failed',
            error: error.message 
        });
    }
});

// Get all inventory items
app.get('/api/inventory', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(`
            SELECT * FROM inventory_items 
            ORDER BY category, name
        `);
        connection.release();
        
        res.json({ 
            success: true, 
            items: rows,
            count: rows.length 
        });
        
    } catch (error) {
        console.error('Get inventory failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve inventory',
            error: error.message 
        });
    }
});

// Sync inventory (replace all items)
app.post('/api/inventory/sync', async (req, res) => {
    const { items, user } = req.body;
    
    if (!Array.isArray(items)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Items must be an array' 
        });
    }
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Delete all existing items
        await connection.execute('DELETE FROM inventory_items');
        
        // Insert all new items
        if (items.length > 0) {
            const insertQuery = `
                INSERT INTO inventory_items 
                (id, category, name, price, initial_stock, used_stock, remaining_stock, created_by, created_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            for (const item of items) {
                await connection.execute(insertQuery, [
                    item.id,
                    item.category,
                    item.name,
                    item.price,
                    item.initialStock,
                    item.usedStock,
                    item.remainingStock,
                    item.createdBy || user || 'Unknown',
                    item.createdDate || new Date()
                ]);
            }
        }
        
        await connection.commit();
        connection.release();
        
        res.json({ 
            success: true, 
            message: `Successfully synced ${items.length} items`,
            count: items.length 
        });
        
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Inventory sync failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to sync inventory',
            error: error.message 
        });
    }
});

// Add single inventory item
app.post('/api/inventory/item', async (req, res) => {
    const { item } = req.body;
    
    if (!item || !item.name || !item.category) {
        return res.status(400).json({ 
            success: false, 
            message: 'Item name and category are required' 
        });
    }
    
    try {
        const connection = await pool.getConnection();
        
        const insertQuery = `
            INSERT INTO inventory_items 
            (id, category, name, price, initial_stock, used_stock, remaining_stock, created_by, created_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.execute(insertQuery, [
            item.id || Date.now(),
            item.category,
            item.name,
            item.price || 0,
            item.initialStock || 0,
            item.usedStock || 0,
            item.remainingStock || item.initialStock || 0,
            item.createdBy || 'Unknown',
            item.createdDate || new Date()
        ]);
        
        connection.release();
        
        res.json({ 
            success: true, 
            message: 'Item added successfully' 
        });
        
    } catch (error) {
        console.error('Add item failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add item',
            error: error.message 
        });
    }
});

// Update inventory item
app.put('/api/inventory/item/:id', async (req, res) => {
    const { id } = req.params;
    const { item } = req.body;
    
    try {
        const connection = await pool.getConnection();
        
        const updateQuery = `
            UPDATE inventory_items 
            SET category = ?, name = ?, price = ?, initial_stock = ?, 
                used_stock = ?, remaining_stock = ?, updated_date = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        
        const [result] = await connection.execute(updateQuery, [
            item.category,
            item.name,
            item.price,
            item.initialStock,
            item.usedStock,
            item.remainingStock,
            id
        ]);
        
        connection.release();
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Item updated successfully' 
        });
        
    } catch (error) {
        console.error('Update item failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update item',
            error: error.message 
        });
    }
});

// Delete inventory item
app.delete('/api/inventory/item/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const connection = await pool.getConnection();
        
        const [result] = await connection.execute(
            'DELETE FROM inventory_items WHERE id = ?',
            [id]
        );
        
        connection.release();
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Item deleted successfully' 
        });
        
    } catch (error) {
        console.error('Delete item failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete item',
            error: error.message 
        });
    }
});

// Save daily report
app.post('/api/daily-reports', async (req, res) => {
    const { date, user, totalItems, totalValue, usedValue, items } = req.body;
    
    if (!date || !user) {
        return res.status(400).json({ 
            success: false, 
            message: 'Date and user are required' 
        });
    }
    
    try {
        const connection = await pool.getConnection();
        
        // Check if report for this date already exists
        const [existing] = await connection.execute(
            'SELECT id FROM daily_reports WHERE report_date = ?',
            [date]
        );
        
        if (existing.length > 0) {
            // Update existing report
            await connection.execute(`
                UPDATE daily_reports 
                SET user_name = ?, total_items = ?, total_value = ?, 
                    used_value = ?, report_data = ?, updated_date = CURRENT_TIMESTAMP
                WHERE report_date = ?
            `, [user, totalItems, totalValue, usedValue, JSON.stringify(items), date]);
            
            res.json({ 
                success: true, 
                message: 'Daily report updated successfully' 
            });
        } else {
            // Insert new report
            await connection.execute(`
                INSERT INTO daily_reports 
                (report_date, user_name, total_items, total_value, used_value, report_data)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [date, user, totalItems, totalValue, usedValue, JSON.stringify(items)]);
            
            res.json({ 
                success: true, 
                message: 'Daily report saved successfully' 
            });
        }
        
        connection.release();
        
    } catch (error) {
        console.error('Save daily report failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to save daily report',
            error: error.message 
        });
    }
});

// Get daily reports
app.get('/api/daily-reports', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT * FROM daily_reports 
            ORDER BY report_date DESC
        `);
        
        connection.release();
        
        // Parse JSON data
        const reports = rows.map(row => ({
            ...row,
            report_data: row.report_data ? JSON.parse(row.report_data) : []
        }));
        
        res.json({ 
            success: true, 
            reports: reports 
        });
        
    } catch (error) {
        console.error('Get daily reports failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve daily reports',
            error: error.message 
        });
    }
});

// Get daily report by date
app.get('/api/daily-reports/:date', async (req, res) => {
    const { date } = req.params;
    
    try {
        const connection = await pool.getConnection();
        
        const [rows] = await connection.execute(
            'SELECT * FROM daily_reports WHERE report_date = ?',
            [date]
        );
        
        connection.release();
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Report not found for this date' 
            });
        }
        
        const report = {
            ...rows[0],
            report_data: rows[0].report_data ? JSON.parse(rows[0].report_data) : []
        };
        
        res.json({ 
            success: true, 
            report: report 
        });
        
    } catch (error) {
        console.error('Get daily report failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to retrieve daily report',
            error: error.message 
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error.message 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'API endpoint not found' 
    });
});

// Start server
async function startServer() {
    try {
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📊 API Base URL: http://localhost:${PORT}/api`);
            console.log(`🔗 Database: ${dbConfig.host}:3306/${dbConfig.database}`);
            console.log('✅ Server ready for connections');
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

startServer();