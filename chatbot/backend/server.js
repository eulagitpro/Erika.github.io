// chatbot/backend/server.js
// Main Express server for AI Chatbot API

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
const memory = new MemoryService();

// ============= ROUTES =============

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId, conversationId, sessionId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({
        error: 'Missing required fields: message, userId'
      });
    }

    logger.info(`Chat message from user ${userId}: ${message.substring(0, 50)}...`);

    // Get conversation history for context
    let conversation = null;
    if (conversationId) {
      conversation = await db.getConversation(userId, conversationId);
    } else {
      conversation = await db.createConversation(userId);
    }

    // Retrieve contextual memory (previous conversations)
    const contextMemory = await memory.retrieveContext(userId, message);

    // Build context for LLM
    const context = {
      userId,
      conversationId: conversation.id,
      history: conversation.messages || [],
      contextMemory,
      timestamp: new Date().toISOString()
    };

    // Save user message
    await db.saveMessage(conversation.id, {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Get response from LLM
    const response = await llm.generateResponse(message, context);

    // Save assistant message
    await db.saveMessage(conversation.id, {
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString()
    });

    // Update memory embeddings
    await memory.updateEmbedding(userId, message, response);

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
      message: error.message
    });
  }
});

// Get conversation history
app.get('/api/conversations/:userId/:conversationId', async (req, res) => {
  try {
    const { userId, conversationId } = req.params;

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
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;

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

    if (!userId || !query) {
      return res.status(400).json({
        error: 'Missing required fields: userId, query'
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

// ============= START SERVER =============
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Chatbot API server running on port ${PORT}`);
  logger.info(`CORS enabled for: ${process.env.CORS_ORIGIN || 'localhost'}`);
  logger.info(`LLM Provider: ${process.env.LLM_PROVIDER || 'openrouter'}`);
  logger.info(`Database: ${process.env.DATABASE_TYPE || 'mongodb'}`);
});

module.exports = app;
