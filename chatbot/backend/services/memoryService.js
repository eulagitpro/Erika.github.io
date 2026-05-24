// chatbot/backend/services/memoryService.js
// Contextual memory retrieval using embeddings and vector search

const axios = require('axios');
const { createLogger } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info'
});

class MemoryService {
  constructor() {
    this.vectorProvider = process.env.VECTOR_PROVIDER || 'none';
    this.vectorModel = process.env.VECTOR_MODEL || 'all-MiniLM-L6-v2';
    this.db = null;
  }

  setDatabase(db) {
    this.db = db;
  }

  /**
   * Retrieve contextual memory based on user message
   * Returns similar conversations or facts from previous interactions
   */
  async retrieveContext(userId, userMessage, topK = 3) {
    try {
      if (this.vectorProvider === 'none') {
        // Simple keyword matching fallback
        return await this.keywordMatching(userId, userMessage, topK);
      } else if (this.vectorProvider === 'huggingface') {
        return await this.vectorSearch(userId, userMessage, topK);
      }

      return [];
    } catch (error) {
      logger.error('Memory retrieval error:', error);
      return [];
    }
  }

  /**
   * Simple keyword-based matching (no embeddings needed)
   */
  async keywordMatching(userId, userMessage, topK = 3) {
    try {
      if (!this.db) return [];

      const userMemory = await this.db.getMemory(userId);
      if (!userMemory || userMemory.length === 0) return [];

      // Extract keywords from user message
      const keywords = this.extractKeywords(userMessage);

      // Score memories based on keyword overlap
      const scored = userMemory.map(mem => {
        const memoryKeywords = this.extractKeywords(mem.summary || '');
        const score = keywords.filter(k => memoryKeywords.includes(k)).length;
        return { ...mem, score };
      });

      // Return top K matches
      return scored
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      logger.error('Keyword matching error:', error);
      return [];
    }
  }

  /**
   * Vector-based semantic search using HuggingFace embeddings
   */
  async vectorSearch(userId, userMessage, topK = 3) {
    try {
      if (!this.db) return [];

      // Get embedding for user message
      const messageEmbedding = await this.generateEmbedding(userMessage);
      if (!messageEmbedding) return [];

      // Get all user memories
      const userMemory = await this.db.getMemory(userId);
      if (!userMemory || userMemory.length === 0) return [];

      // Score memories by cosine similarity
      const scored = userMemory.map(mem => {
        const memoryEmbedding = mem.embedding;
        if (!memoryEmbedding) return { ...mem, score: 0 };

        const similarity = this.cosineSimilarity(messageEmbedding, memoryEmbedding);
        return { ...mem, score: similarity };
      });

      // Return top K matches
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      logger.error('Vector search error:', error);
      return [];
    }
  }

  /**
   * Generate embedding for text using HuggingFace API
   */
  async generateEmbedding(text) {
    try {
      const response = await axios.post(
        'https://api-inference.huggingface.co/pipeline/feature-extraction',
        { inputs: text },
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data[0] || null;
    } catch (error) {
      logger.warn('Embedding generation error:', error.message);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    const dotProduct = vec1.reduce((sum, a, i) => sum + a * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, a) => sum + a * a, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, a) => sum + a * a, 0));

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Update memory with new conversation
   */
  async updateEmbedding(userId, userMessage, assistantResponse) {
    try {
      if (!this.db) return;

      const embedding = this.vectorProvider === 'huggingface'
        ? await this.generateEmbedding(userMessage)
        : null;

      const summary = this.summarizeConversation(userMessage, assistantResponse);

      await this.db.saveMemory(userId, {
        summary,
        userMessage,
        assistantResponse,
        embedding,
        timestamp: new Date().toISOString(),
        keywords: this.extractKeywords(userMessage)
      });

      logger.info(`Memory updated for user ${userId}`);
    } catch (error) {
      logger.error('Memory update error:', error);
    }
  }

  /**
   * Summarize conversation for memory storage
   */
  summarizeConversation(userMessage, assistantResponse) {
    // Simple truncation-based summary
    const maxLength = 200;
    const userSummary = userMessage.substring(0, maxLength);
    const assistantSummary = assistantResponse.substring(0, maxLength);

    return `Q: ${userSummary}${userMessage.length > maxLength ? '...' : ''}\nA: ${assistantSummary}${assistantResponse.length > maxLength ? '...' : ''}`;
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    // Simple keyword extraction (remove stop words and short words)
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'was', 'are', 'be', 'been', 'being'
    ]);

    return text
      .toLowerCase()
      .match(/\b\w+\b/g) || [];
      // .filter(w => w.length > 3 && !stopWords.has(w));
  }

  /**
   * Search user memories by query
   */
  async search(userId, query) {
    try {
      if (!this.db) return [];

      const context = await this.retrieveContext(userId, query, 10);
      return context;
    } catch (error) {
      logger.error('Memory search error:', error);
      return [];
    }
  }

  /**
   * Clear all memories for a user
   */
  async clearUserMemory(userId) {
    try {
      if (!this.db) return;

      await this.db.deleteMemory(userId);
      logger.info(`Memory cleared for user ${userId}`);
    } catch (error) {
      logger.error('Clear memory error:', error);
    }
  }

  /**
   * Get memory statistics for user
   */
  async getMemoryStats(userId) {
    try {
      if (!this.db) return null;

      const memory = await this.db.getMemory(userId);
      if (!memory || memory.length === 0) {
        return {
          totalMemories: 0,
          memorySize: 0,
          oldestMemory: null,
          newestMemory: null
        };
      }

      const timestamps = memory.map(m => new Date(m.timestamp)).sort();

      return {
        totalMemories: memory.length,
        memorySize: JSON.stringify(memory).length,
        oldestMemory: timestamps[0],
        newestMemory: timestamps[timestamps.length - 1]
      };
    } catch (error) {
      logger.error('Get memory stats error:', error);
      return null;
    }
  }
}

module.exports = MemoryService;
