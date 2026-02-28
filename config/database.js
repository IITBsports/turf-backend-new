const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'turf_booking',
  process.env.DB_USER || 'turfuser',
  process.env.DB_PASSWORD || 'turf123456',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 10,
      min: 1,
      acquire: 30000,
      idle: 10000
    },
    timezone: '+05:30' // IST timezone
  }
);

async function connectToDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✓ MySQL Database connected successfully');
    
    // Sync all models with database
    await sequelize.sync({ alter: true }); 
    console.log('✓ Database models synchronized');
    
    return sequelize;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    throw error;
  }
}

module.exports = { sequelize, connectToDatabase };