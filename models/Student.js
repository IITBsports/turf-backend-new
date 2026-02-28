const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Student = sequelize.define('Student', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  rollno: {
    type: DataTypes.STRING(50),
    allowNull: false,
    index: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  purpose: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  player_roll_no: {
    type: DataTypes.JSON, // Store array of roll numbers
    allowNull: true
  },
  no_of_players: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  slot: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 14
    }
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined'),
    defaultValue: 'pending'
  },
  requestTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'students',
  timestamps: true, // Adds createdAt and updatedAt
  indexes: [
    {
      fields: ['slot', 'date', 'status']
    },
    {
      fields: ['rollno']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = Student;