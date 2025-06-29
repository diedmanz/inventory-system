{
  "name": "inventory-mysql-api",
  "version": "1.0.0",
  "description": "MySQL API Server for Inventory Management System",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node test-connection.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.5",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  },
  "keywords": [
    "mysql",
    "api",
    "inventory",
    "express",
    "nodejs"
  ],
  "author": "Your Name",
  "license": "MIT"
}