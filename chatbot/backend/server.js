// chatbot/backend/server.js
// Main Express server for AI Chatbot API - ENHANCED VERSION

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const { createLogger, transports, format } = require('winston');

// Load environment variables
dotenv.config();

const app = express();

// ============= VALIDATION UTILS =============
const validateInput = {
  message: (msg) => {
    if (!msg || typeof msg !== 'string') return false;
    if (msg.trim().length === 0) return false;
    if (msg.length > 5000) return false;
    return true;
  },
  userId: (id) => {
    if (!id || typeof id !== 'string') return false;
    if (id.length < 3 || id.length > 100) return false;
    return true;
  },
  conversationId: (id) => {
    if (!id) return true; // optional
    if (typeof id !== 'string') return false;
    return id.length > 0 && id.length < 100;
  }
};

// ============= LOGGER =============
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
  ]
});

// ============= MIDDLEWARE =============
// Security middleware
app.use(helmet());
app.use(compression());
app.use(mongoSanitize());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: message => logger.info(message.trim())
  }
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ============= RATE LIMITING =============
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 messages per minute
  message: 'Too many messages, please wait before sending another.'
});

app.use('/api/', limiter);
app.use('/api/chat', chatLimiter);

// ============= DATABASE SETUP =============
const Database = require('./services/database');
const db = new Database();

db.initialize().catch(err => {
  logger.error('Database initialization failed:', err);
  process.exit(1);
});

// ============= LLM SERVICE =============
const LLMService = require('./services/llmService');
const llm = new LLMService();

// ============= MEMORY SERVICE =============
const MemoryService = require('./services/memoryService');
const memory = new MemoryService(db);

// ============= ROUTES =============

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0-enhanced'
  });
});

// Chat endpoint - ENHANCED WITH VALIDATION
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId, conversationId, sessionId } = req.body;

    // Input validation
    if (!validateInput.message(message)) {
      return res.status(400).json({
        error: 'Invalid message: must be a non-empty string (max 5000 chars)'
      });
    }

    if (!validateInput.userId(userId)) {
      return res.status(400).json({
        error: 'Invalid userId: must be a string (3-100 chars)'
      });
    }

    if (!validateInput.conversationId(conversationId)) {
      return res.status(400).json({
        error: 'Invalid conversationId format'
      });
    }

    logger.info(`Chat message from user ${userId}: ${message.substring(0, 50)}...`);

    // Get conversation history for context
    let conversation = null;
    if (conversationId) {
      try {
        conversation = await db.getConversation(userId, conversationId);
        if (!conversation) {
          conversation = await db.createConversation(userId);
        }
      } catch (error) {
        logger.warn(`Failed to fetch conversation ${conversationId}, creating new:`, error);
        conversation = await db.createConversation(userId);
      }
    } else {
      conversation = await db.createConversation(userId);
    }

    // Retrieve contextual memory (previous conversations)
    let contextMemory = [];
    try {
      contextMemory = await memory.retrieveContext(userId, message);
    } catch (error) {
      logger.warn('Memory retrieval failed, continuing without context:', error);
    }

    // Build context for LLM
    const context = {
      userId,
      conversationId: conversation.id,
      history: conversation.messages || [],
      contextMemory: contextMemory || [],
      timestamp: new Date().toISOString()
    };

    // Save user message
    try {
      await db.saveMessage(conversation.id, {
        role: 'user',
        content: message.substring(0, 5000),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to save user message:', error);
    }

    // Get response from LLM
    let response;
    try {
      response = await llm.generateResponse(message, context);
    } catch (error) {
      logger.error('LLM generation error:', error);
      // Provide helpful error message to user
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        throw new Error('Authentication error with LLM service');
      } else if (error.message.includes('429') || error.message.includes('rate')) {
        throw new Error('LLM service rate limited, please try again later');
      } else if (error.message.includes('timeout')) {
        throw new Error('LLM service timeout, please try again');
      }
      throw error;
    }

    // Save assistant message
    try {
      await db.saveMessage(conversation.id, {
        role: 'assistant',
        content: response.substring(0, 5000),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to save assistant message:', error);
    }

    // Update memory embeddings
    try {
      await memory.updateEmbedding(userId, message.substring(0, 5000), response.substring(0, 5000));
    } catch (error) {
      logger.warn('Memory update failed:', error);
    }

    res.json({
      success: true,
      conversationId: conversation.id,
      message: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Chat endpoint error:', error);
    res.status(500).json({
      error: 'Failed to process chat message',
      message: error.message || 'Unknown error'
    });
  }
});

// Get conversation history
app.get('/api/conversations/:userId/:conversationId', async (req, res) => {
  try {
    const { userId, conversationId } = req.params;

    if (!validateInput.userId(userId) || !validateInput.conversationId(conversationId)) {
      return res.status(400).json({
        error: 'Invalid userId or conversationId'
      });
    }

    const conversation = await db.getConversation(userId, conversationId);

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      conversation
    });

  } catch (error) {
    logger.error('Get conversation error:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation'
    });
  }
});

// List conversations for user
app.get('/api/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);

    if (!validateInput.userId(userId)) {
      return res.status(400).json({
        error: 'Invalid userId'
      });
    }

    const conversations = await db.getConversations(userId, limit, skip);

    res.json({
      success: true,
      conversations,
      total: conversations.length
    });

  } catch (error) {
    logger.error('List conversations error:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversations'
    });
  }
});

// Clear conversation
app.delete('/api/conversations/:userId/:conversationId', async (req, res) => {
  try {
    const { userId, conversationId } = req.params;

    if (!validateInput.userId(userId) || !validateInput.conversationId(conversationId)) {
      return res.status(400).json({
        error: 'Invalid userId or conversationId'
      });
    }

    await db.deleteConversation(userId, conversationId);

    res.json({
      success: true,
      message: 'Conversation deleted'
    });

  } catch (error) {
    logger.error('Delete conversation error:', error);
    res.status(500).json({
      error: 'Failed to delete conversation'
    });
  }
});

// Search memory
app.post('/api/memory/search', async (req, res) => {
  try {
    const { userId, query } = req.body;

    if (!validateInput.userId(userId) || !query || query.length === 0) {
      return res.status(400).json({
        error: 'Missing or invalid userId, query'
      });
    }

    if (query.length > 1000) {
      return res.status(400).json({
        error: 'Query too long (max 1000 chars)'
      });
    }

    const results = await memory.search(userId, query);

    res.json({
      success: true,
      results
    });

  } catch (error) {
    logger.error('Memory search error:', error);
    res.status(500).json({
      error: 'Failed to search memory'
    });
  }
});

// Clear user memory
app.delete('/api/memory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!validateInput.userId(userId)) {
      return res.status(400).json({
        error: 'Invalid userId'
      });
    }

    await memory.clearUserMemory(userId);

    res.json({
      success: true,
      message: 'User memory cleared'
    });

  } catch (error) {
    logger.error('Clear memory error:', error);
    res.status(500).json({
      error: 'Failed to clear memory'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

// ============= GRACEFUL SHUTDOWN =============
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      await db.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database:', error);
    }
    process.exit(0);
  });
});

// ============= START SERVER =============
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Chatbot API server running on port ${PORT}`);
  logger.info(`CORS enabled for: ${process.env.CORS_ORIGIN || 'localhost'}`);
  logger.info(`LLM Provider: ${process.env.LLM_PROVIDER || 'openrouter'}`);
  logger.info(`Database: ${process.env.DATABASE_TYPE || 'mongodb'}`);
  logger.info('🚀 Server is ready to accept connections');
});

module.exports = app;
