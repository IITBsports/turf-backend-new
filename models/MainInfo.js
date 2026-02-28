const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MainInfo = sequelize.define('MainInfo', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  rollno: {
    type: DataTypes.STRING(50),
    allowNull: false,
    index: true
  },
  slot: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'slot',
    validate: {
      min: 1,
      max: 14
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined'),
    defaultValue: 'pending'
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  requestTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'main_info',
  timestamps: true,
  indexes: [
    {
      fields: ['slot', 'date', 'status']
    },
    {
      fields: ['rollno']
    }
  ]
});

module.exports = MainInfo;