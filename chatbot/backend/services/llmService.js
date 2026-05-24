// chatbot/backend/services/llmService.js
// LLM abstraction layer supporting OpenRouter, Ollama, and other providers

const axios = require('axios');
const { createLogger } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info'
});

class LLMService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'openrouter';
    this.model = process.env.LLM_MODEL || 'deepseek/deepseek-chat';
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Generate response from LLM with context
   * @param {string} userMessage - User's message
   * @param {object} context - Context including history, memory, userId
   * @returns {string} - LLM response
   */
  async generateResponse(userMessage, context) {
    try {
      logger.info(`Generating response with ${this.provider} using model ${this.model}`);

      if (this.provider === 'openrouter') {
        return await this.generateOpenRouterResponse(userMessage, context);
      } else if (this.provider === 'ollama') {
        return await this.generateOllamaResponse(userMessage, context);
      } else {
        throw new Error(`Unsupported LLM provider: ${this.provider}`);
      }
    } catch (error) {
      logger.error('LLM generation error:', error);
      throw error;
    }
  }

  /**
   * Generate response using OpenRouter API
   */
  async generateOpenRouterResponse(userMessage, context) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY not set in environment variables');
    }

    const messages = this.buildMessages(userMessage, context);

    const payload = {
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.95,
      top_k: 40,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          payload,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'HTTP-Referer': process.env.CORS_ORIGIN || 'http://localhost:3000',
              'X-Title': 'Erika Chatbot',
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        const responseText = response.data.choices[0]?.message?.content;
        if (!responseText) {
          throw new Error('No response content from OpenRouter');
        }

        logger.info(`OpenRouter response generated successfully (attempt ${attempt})`);
        return responseText;
      } catch (error) {
        logger.warn(`OpenRouter request failed (attempt ${attempt}/${this.maxRetries}):`, error.message);

        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          await this.delay(this.retryDelay * attempt);
          continue;
        }

        throw error;
      }
    }
  }

  /**
   * Generate response using Ollama (local LLM)
   */
  async generateOllamaResponse(userMessage, context) {
    const messages = this.buildMessages(userMessage, context);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${this.ollamaUrl}/api/chat`,
          {
            model: this.model,
            messages,
            stream: false,
            options: {
              temperature: 0.7,
              top_k: 40,
              top_p: 0.9
            }
          },
          {
            timeout: 60000
          }
        );

        const responseText = response.data?.message?.content;
        if (!responseText) {
          throw new Error('No response content from Ollama');
        }

        logger.info(`Ollama response generated successfully (attempt ${attempt})`);
        return responseText;
      } catch (error) {
        logger.warn(`Ollama request failed (attempt ${attempt}/${this.maxRetries}):`, error.message);

        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          await this.delay(this.retryDelay * attempt);
          continue;
        }

        throw error;
      }
    }
  }

  /**
   * Build messages array with context and conversation history
   */
  buildMessages(userMessage, context) {
    const messages = [];

    // System prompt with context
    messages.push({
      role: 'system',
      content: this.buildSystemPrompt(context)
    });

    // Add conversation history (last 10 messages for context window)
    if (context.history && Array.isArray(context.history)) {
      const historyMessages = context.history.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      messages.push(...historyMessages);
    }

    // Add contextual memory from similar conversations
    if (context.contextMemory && context.contextMemory.length > 0) {
      const memoryContext = context.contextMemory
        .map(mem => `Previous conversation: "${mem.summary}"`)
        .join('\n');
      messages.push({
        role: 'system',
        content: `Relevant previous conversations:\n${memoryContext}`
      });
    }

    // Current user message
    messages.push({
      role: 'user',
      content: userMessage
    });

    return messages;
  }

  /**
   * Build system prompt with user context
   */
  buildSystemPrompt(context) {
    return `You are Erika, a helpful AI assistant for students. You help with:
- Academic planning and deadline tracking
- Study strategies and organization
- Class management and course planning
- General academic advice
- File analysis and document review

User ID: ${context.userId}
Conversation ID: ${context.conversationId}
Timestamp: ${context.timestamp}

Guidelines:
- Be friendly, supportive, and encouraging
- Provide practical, actionable advice
- Format responses with clear structure using markdown
- Include code blocks when appropriate
- Ask clarifying questions if needed
- Remember context from previous messages in this conversation
- If you don't know something, be honest about it

Current conversation context:
${this.formatContextSummary(context)}`;
  }

  /**
   * Format context summary for the system prompt
   */
  formatContextSummary(context) {
    if (!context.history || context.history.length === 0) {
      return 'This is the start of a new conversation.';
    }

    const messageCount = context.history.length;
    const lastMessage = context.history[context.history.length - 1];

    return `Messages in conversation: ${messageCount}
Last exchange was at: ${lastMessage.timestamp || 'unknown'}
Previous topic: ${this.extractTopic(context.history)}`;
  }

  /**
   * Extract conversation topic from history
   */
  extractTopic(history) {
    if (!history || history.length === 0) return 'not available';

    const userMessages = history
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content);

    if (userMessages.length === 0) return 'not available';

    const latestMessage = userMessages[userMessages.length - 1];
    return latestMessage.substring(0, 50) + (latestMessage.length > 50 ? '...' : '');
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    const status = error.response?.status;

    if (retryableCodes.includes(status)) return true;
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') return true;

    return false;
  }

  /**
   * Delay helper for retries
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate model availability
   */
  async validateModel() {
    try {
      if (this.provider === 'openrouter') {
        const response = await axios.get(
          'https://openrouter.ai/api/v1/models',
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`
            }
          }
        );
        const models = response.data.data || [];
        const modelExists = models.some(m => m.id === this.model);
        logger.info(`Model ${this.model} validation: ${modelExists ? 'OK' : 'NOT FOUND'}`);
        return modelExists;
      } else if (this.provider === 'ollama') {
        const response = await axios.get(`${this.ollamaUrl}/api/tags`);
        const models = response.data.models || [];
        const modelExists = models.some(m => m.name === this.model);
        logger.info(`Model ${this.model} validation: ${modelExists ? 'OK' : 'NOT FOUND'}`);
        return modelExists;
      }
    } catch (error) {
      logger.error('Model validation error:', error.message);
      return false;
    }
  }
}

module.exports = LLMService;
