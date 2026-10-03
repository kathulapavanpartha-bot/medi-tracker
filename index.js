let app;
try {
  app = require('./server');
} catch (e) {
  app = require('../server');
}

module.exports = app;
