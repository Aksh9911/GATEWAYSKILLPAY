const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Middleware to validate user status before allowing recharge
 * Checks if user status is 1 (active) in the users table
 */
const validateUserStatus = async (req, res, next) => {
  const userId = req.body.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId is required'
    });
  }

  try {
    // Query users table to check status
    const sql = 'SELECT status FROM users WHERE id = ? LIMIT 1';
    const [results] = await db.execute(sql, [userId]);

    if (results && results.length > 0) {
      const userStatus = results[0].status;
      
      logger.info('User status check', {
        operation: 'user_status_validation',
        user_id: userId,
        status: userStatus
      });

      if (userStatus !== 1) {
        logger.warn('User not allowed to recharge - invalid status', {
          operation: 'user_status_denied',
          user_id: userId,
          status: userStatus
        });

        return res.status(403).json({
          success: false,
          error: 'Not allowed to recharge - user account is not active'
        });
      }

      // User status is 1, proceed with the request
      req.userStatus = userStatus;
      next();
    } else {
      // User not found in database
      logger.warn('User not found in database', {
        operation: 'user_not_found',
        user_id: userId
      });

      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
  } catch (error) {
    logger.error('Error validating user status', {
      operation: 'user_status_validation_error',
      user_id: userId,
      error: error.message
    });

    return res.status(500).json({
      success: false,
      error: 'Error validating user status'
    });
  }
};

module.exports = {
  validateUserStatus
};
