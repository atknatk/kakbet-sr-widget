import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from '../utils/logger.js';

/**
 * Load configuration from YAML files and environment variables
 */
export async function loadConfig() {
  try {
    // Load base configuration
    const configPath = path.join(process.cwd(), 'config', 'providers.yaml');
    const configFile = await fs.readFile(configPath, 'utf8');
    const config = yaml.load(configFile);

    // Override with environment variables
    if (process.env.SPORTRADAR_BASE_URL) {
      config.providers.sportradar.baseUrl = process.env.SPORTRADAR_BASE_URL;
    }

    if (process.env.CACHE_TTL) {
      config.cache.defaultTtl = parseInt(process.env.CACHE_TTL);
    }

    logger.info('Configuration loaded successfully');
    return config;
  } catch (error) {
    logger.error('Failed to load configuration:', error);
    
    // Fallback to default configuration
    logger.warn('Using fallback configuration');
    return getDefaultConfig();
  }
}

/**
 * Default configuration fallback
 */
function getDefaultConfig() {
  return {
    providers: {
      sportradar: {
        name: 'SportRadar',
        baseUrl: 'https://widgets.sir-sportradar.com',
        widgetTypes: {
          'match.lmtPlus': {
            path: '/{widgetId}/widgetloader',
            assets: ['/assets/**/*']
          },
          'match.preview': {
            path: '/{widgetId}/widgetloader',
            assets: ['/assets/**/*']
          }
        },
        headers: {
          'User-Agent': 'KakBet-Widget-Proxy/1.0',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        cache: {
          scripts: 300, // 5 minutes
          assets: 3600  // 1 hour
        }
      }
    },
    cache: {
      defaultTtl: 300,
      maxKeys: 1000
    },
    security: {
      allowedOrigins: ['*'],
      maxRequestSize: '10mb',
      rateLimit: {
        windowMs: 60000, // 1 minute
        max: 100 // requests per window
      }
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.NODE_ENV === 'production' ? 'json' : 'simple'
    }
  };
}
