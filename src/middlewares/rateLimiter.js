const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Build a per-user rate limit key from request body.
 * Uses userId so users on the same network/IP are limited independently.
 */
const getUserRateLimitKey = (req) => {
  const userId = req.body?.userId;
  if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
    return `user:${String(userId).trim()}`;
  }
  return null;
};

/**
 * Create a rate limiter for recharge endpoints
 * Limits requests per userId to prevent spamming of recharge functionality
 */
const createRechargeRateLimiter = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each user to 5 recharge requests per windowMs
    keyGenerator: (req) => getUserRateLimitKey(req) || 'user:anonymous',
    message: {
      success: false,
      error: 'Too many recharge attempts. Please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn('Rate limit exceeded for recharge endpoint', {
        user_id: req.body?.userId,
        ip: req.ip,
        user_agent: req.get('user-agent'),
        path: req.path,
        body: req.body
      });
      
      res.status(429).json({
        success: false,
        error: 'Too many recharge attempts. Please try again later.',
        retryAfter: '15 minutes'
      });
    }
  });
};

/**
 * Create a stricter rate limiter for order creation
 * Limits requests per userId to prevent spamming of order creation API
 */
const createOrderRateLimiter = () => {
  return rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3, // Limit each user to 3 order creation requests per windowMs
    keyGenerator: (req) => getUserRateLimitKey(req) || 'user:anonymous',
    message: {
      success: false,
      error: 'Too many order creation attempts. Please try again later.',
      retryAfter: '5 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded for order creation', {
        user_id: req.body?.userId,
        ip: req.ip,
        user_agent: req.get('user-agent'),
        path: req.path,
        body: req.body
      });
      
      res.status(429).json({
        success: false,
        error: 'Too many order creation attempts. Please try again later.',
        retryAfter: '5 minutes'
      });
    }
  });
};

module.exports = {
  createRechargeRateLimiter,
  createOrderRateLimiter
};
