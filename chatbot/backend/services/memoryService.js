// chatbot/backend/services/memoryService.js
// Memory service for storing and retrieving conversation context

class MemoryService {
  constructor(db) {
    this.db = db;
    this.memoryCache = new Map();
    this.maxMemories = 100;
  }

  async retrieveContext(userId, message) {
    try {
      // Get recent memories for this user
      const memories = await this.getRecentMemories(userId, 5);
      
      // Simple keyword matching to find relevant memories
      const relevantMemories = this.findRelevantMemories(message, memories);
      
      return relevantMemories;
    } catch (error) {
      console.error('Memory retrieval error:', error);
      return [];
    }
  }

  async getRecentMemories(userId, limit = 10) {
    try {
      if (this.db && this.db.collection) {
        const memories = await this.db.collection('memory')
          .find({ userId })
          .sort({ timestamp: -1 })
          .limit(limit)
          .toArray();
        
        return memories;
      }
      
      // Fallback to cache if DB not available
      return this.memoryCache.get(userId) || [];
    } catch (error) {
      console.warn('Error retrieving memories:', error);
      return [];
    }
  }

  findRelevantMemories(message, memories) {
    const keywords = this.extractKeywords(message);
    
    return memories
      .filter(mem => {
        const memKeywords = this.extractKeywords(
          `${mem.userMessage} ${mem.assistantResponse}`
        );
        return keywords.some(kw => memKeywords.includes(kw));
      })
      .slice(0, 3);
  }

  extractKeywords(text) {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 10);
  }

  async updateEmbedding(userId, userMessage, assistantResponse) {
    try {
      const memory = {
        userId,
        userMessage,
        assistantResponse,
        keywords: this.extractKeywords(userMessage),
        timestamp: new Date()
      };

      if (this.db && this.db.collection) {
        await this.db.collection('memory').insertOne(memory);
      } else {
        // Fallback to in-memory cache
        if (!this.memoryCache.has(userId)) {
          this.memoryCache.set(userId, []);
        }
        
        const userMemories = this.memoryCache.get(userId);
        userMemories.push(memory);
        
        if (userMemories.length > this.maxMemories) {
          userMemories.shift();
        }
      }
    } catch (error) {
      console.error('Error updating embedding:', error);
    }
  }

  async search(userId, query) {
    try {
      const keywords = this.extractKeywords(query);
      const memories = await this.getRecentMemories(userId, 50);

      const results = memories
        .map(mem => ({
          ...mem,
          score: this.calculateRelevanceScore(keywords, mem)
        }))
        .filter(mem => mem.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return results;
    } catch (error) {
      console.error('Memory search error:', error);
      return [];
    }
  }

  calculateRelevanceScore(queryKeywords, memory) {
    const memoryText = `${memory.userMessage} ${memory.assistantResponse}`.toLowerCase();
    let score = 0;

    queryKeywords.forEach(keyword => {
      if (memoryText.includes(keyword)) {
        score += 1;
      }
    });

    return score;
  }

  async clearUserMemory(userId) {
    try {
      if (this.db && this.db.collection) {
        await this.db.collection('memory').deleteMany({ userId });
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
