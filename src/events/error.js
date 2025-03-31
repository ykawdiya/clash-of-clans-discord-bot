// src/events/error.js
const { system: log } = require('../utils/logger');

module.exports = {
  name: 'error',
  execute(error) {
    log.error('Discord client error:', { error: error.stack || error.message });
  }
};
