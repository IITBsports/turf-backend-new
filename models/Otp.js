const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Otp = sequelize.define('Otp', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  otp: {
    type: DataTypes.STRING(6),
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: () => new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
  },
  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'otps',
  timestamps: true,
  indexes: [
    {
      fields: ['email', 'otp']
    }
  ],
  hooks: {
    // Automatically delete expired OTPs before querying
    beforeFind: async (options) => {
      if (!options.where) {
        options.where = {};
      }
      // Add condition to only fetch non-expired OTPs
      options.where.expiresAt = {
        [sequelize.Sequelize.Op.gt]: new Date()
      };
    }
  }
});

module.exports = Otp;