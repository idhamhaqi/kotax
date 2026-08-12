const jwt = require('jsonwebtoken');
  const jwtConfig = require('../config/jwt');

  // Verify JWT token from cookie
  function verifyToken(req, res, next) {
      const token = req.cookies?.token;

      // Helper function to check if request expects JSON
      const isJsonRequest = () => {
          return req.xhr || (req.headers?.accept && req.headers.accept.indexOf('json') > -1);
      };

      if (!token) {
          if (isJsonRequest()) {
              return res.status(401).json({ success: false, message: 'No token provided' });
          }
          return res.redirect('/login');
      }

      try {
          const decoded = jwt.verify(token, jwtConfig.secret);
          req.userId = decoded.userId;
          next();
      } catch (error) {
          if (isJsonRequest()) {
              return res.status(401).json({ success: false, message: 'Invalid token' });
          }
          res.clearCookie('token');
          return res.redirect('/login');
      }
  }

  // Check if user is already logged in
  function checkAuth(req, res, next) {
      const token = req.cookies?.token;

      if (token) {
          try {
              jwt.verify(token, jwtConfig.secret);
              return res.redirect('/dashboard');
          } catch (error) {
              res.clearCookie('token');
          }
      }
      next();
  }

  module.exports = { verifyToken, checkAuth };