const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('turf_booking', 'turfuser', 'turf123456', {
  host: 'localhost',
  dialect: 'mysql'
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✓ Connection successful!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Connection failed:', error);
    process.exit(1);
  }
}

testConnection();