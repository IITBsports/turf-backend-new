const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Banned = sequelize.define('Banned', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  rollno: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  bannedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'banned_users',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['rollno']
    }
  ]
});

module.exports = Banned;