import express from 'express';
import { logger } from '../utils/logger.js';

/**
 * Create health check router
 */
export function createHealthRouter() {
  const router = express.Router();

  // Basic health check
  router.get('/', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0'
    });
  });

  // Detailed health check
  router.get('/detailed', (req, res) => {
    const memUsage = process.memoryUsage();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
      },
      process: {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Readiness probe
  router.get('/ready', (req, res) => {
    // Add any readiness checks here (database connections, etc.)
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  });

  // Liveness probe
  router.get('/live', (req, res) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}
