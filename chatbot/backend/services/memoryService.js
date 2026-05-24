// chatbot/backend/services/memoryService.js
// Memory service for storing and retrieving conversation context - ENHANCED VERSION

class MemoryService {
  constructor(db) {
    this.db = db;
    this.memoryCache = new Map();
    this.maxMemories = 100;
    this.maxKeywordLength = 50;
    this.minKeywordLength = 3;
  }

  async retrieveContext(userId, message) {
    if (!userId || !message) {
      return [];
    }

    try {
      // Validate inputs
      if (typeof userId !== 'string' || userId.length < 3) {
        console.warn('Invalid userId format');
        return [];
      }

      if (typeof message !== 'string' || message.length === 0) {
        console.warn('Invalid message format');
        return [];
      }

      // Get recent memories for this user
      const memories = await this.getRecentMemories(userId, 5);
      
      // Simple keyword matching to find relevant memories
      const relevantMemories = this.findRelevantMemories(message, memories);
      
      return relevantMemories || [];
    } catch (error) {
      console.error('Memory retrieval error:', error);
      return [];
    }
  }

  async getRecentMemories(userId, limit = 10) {
    try {
      if (!userId || typeof userId !== 'string') {
        return [];
      }

      if (this.db && this.db.collection && typeof this.db.collection === 'function') {
        try {
          const memories = await this.db.collection('memory')
            .find({ userId })
            .sort({ timestamp: -1 })
            .limit(Math.min(limit, 50))
            .toArray();
          
          return Array.isArray(memories) ? memories : [];
        } catch (error) {
          console.warn('Database memory retrieval failed:', error.message);
          // Fallback to cache
          return this.memoryCache.get(userId) || [];
        }
      }
      
      // Fallback to cache if DB not available
      const cached = this.memoryCache.get(userId);
      return Array.isArray(cached) ? cached : [];
    } catch (error) {
      console.warn('Error retrieving memories:', error.message);
      return [];
    }
  }

  findRelevantMemories(message, memories) {
    if (!Array.isArray(memories) || memories.length === 0) {
      return [];
    }

    try {
      const keywords = this.extractKeywords(message);
      if (keywords.length === 0) {
        return [];
      }
      
      const relevant = memories
        .filter(mem => {
          if (!mem || typeof mem !== 'object') return false;
          
          const memText = `${mem.userMessage || ''} ${mem.assistantResponse || ''}`;
          if (!memText || memText.length === 0) return false;
          
          const memKeywords = this.extractKeywords(memText);
          return keywords.some(kw => memKeywords.includes(kw));
        })
        .slice(0, 3);

      return relevant || [];
    } catch (error) {
      console.warn('Error finding relevant memories:', error);
      return [];
    }
  }

  extractKeywords(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    try {
      const words = text
        .toLowerCase()
        .split(/\s+/)
        .filter(word => {
          const len = word.length;
          return len >= this.minKeywordLength && len <= this.maxKeywordLength;
        })
        .slice(0, 10);
      
      return Array.isArray(words) ? words : [];
    } catch (error) {
      console.warn('Error extracting keywords:', error);
      return [];
    }
  }

  async updateEmbedding(userId, userMessage, assistantResponse) {
    if (!userId || !userMessage || !assistantResponse) {
      return;
    }

    try {
      // Validate inputs
      if (typeof userId !== 'string' || userId.length < 3) {
        console.warn('Invalid userId for memory update');
        return;
      }

      if (typeof userMessage !== 'string' || userMessage.length === 0) {
        console.warn('Invalid user message for memory update');
        return;
      }

      if (typeof assistantResponse !== 'string' || assistantResponse.length === 0) {
        console.warn('Invalid assistant response for memory update');
        return;
      }

      const memory = {
        userId,
        userMessage: userMessage.substring(0, 5000),
        assistantResponse: assistantResponse.substring(0, 5000),
        keywords: this.extractKeywords(userMessage),
        timestamp: new Date()
      };

      if (this.db && this.db.collection && typeof this.db.collection === 'function') {
        try {
          await this.db.collection('memory').insertOne(memory);
        } catch (error) {
          console.warn('Database memory update failed:', error.message);
          this.updateInMemoryCache(userId, memory);
        }
      } else {
        // Fallback to in-memory cache
        this.updateInMemoryCache(userId, memory);
      }
    } catch (error) {
      console.error('Error updating memory:', error);
    }
  }

  updateInMemoryCache(userId, memory) {
    try {
      if (!this.memoryCache.has(userId)) {
        this.memoryCache.set(userId, []);
      }
      
      const userMemories = this.memoryCache.get(userId);
      if (Array.isArray(userMemories)) {
        userMemories.push(memory);
        
        if (userMemories.length > this.maxMemories) {
          userMemories.shift();
        }
      }
    } catch (error) {
      console.warn('Error updating in-memory cache:', error);
    }
  }

  async search(userId, query) {
    if (!userId || !query) {
      return [];
    }

    try {
      // Validate inputs
      if (typeof userId !== 'string' || userId.length < 3) {
        console.warn('Invalid userId for memory search');
        return [];
      }

      if (typeof query !== 'string' || query.length === 0 || query.length > 1000) {
        console.warn('Invalid query for memory search');
        return [];
      }

      const keywords = this.extractKeywords(query);
      if (keywords.length === 0) {
        return [];
      }

      const memories = await this.getRecentMemories(userId, 50);
      if (!Array.isArray(memories)) {
        return [];
      }

      const results = memories
        .map(mem => {
          if (!mem || typeof mem !== 'object') return null;
          return {
            ...mem,
            score: this.calculateRelevanceScore(keywords, mem)
          };
        })
        .filter(mem => mem && mem.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return results.filter(r => r !== null) || [];
    } catch (error) {
      console.error('Memory search error:', error);
      return [];
    }
  }

  calculateRelevanceScore(queryKeywords, memory) {
    if (!Array.isArray(queryKeywords) || !memory) {
      return 0;
    }

    try {
      const memoryText = `${memory.userMessage || ''} ${memory.assistantResponse || ''}`.toLowerCase();
      if (!memoryText) return 0;

      let score = 0;
      queryKeywords.forEach(keyword => {
        if (keyword && memoryText.includes(keyword)) {
          score += 1;
        }
      });

      return score;
    } catch (error) {
      console.warn('Error calculating relevance score:', error);
      return 0;
    }
  }

  async clearUserMemory(userId) {
    if (!userId) {
      throw new Error('userId is required');
    }

    try {
      if (typeof userId !== 'string' || userId.length < 3) {
        throw new Error('Invalid userId format');
      }

      if (this.db && this.db.collection && typeof this.db.collection === 'function') {
        try {
          await this.db.collection('memory').deleteMany({ userId });
        } catch (error) {
          console.warn('Database memory clear failed:', error.message);
          this.memoryCache.delete(userId);
          throw error;
        }
      } else {
        this.memoryCache.delete(userId);
      }
    } catch (error) {
      console.error('Error clearing memory:', error);
      throw error;
    }
  }
}

module.exports = MemoryService;
