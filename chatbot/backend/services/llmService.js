// chatbot/backend/services/llmService.js
// LLM service supporting OpenRouter and local Ollama

const axios = require('axios');

class LLMService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'openrouter';
    this.model = process.env.LLM_MODEL || 'deepseek/deepseek-chat';
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  }

  async generateResponse(message, context) {
    if (this.provider === 'openrouter') {
      return this.generateOpenRouterResponse(message, context);
    } else if (this.provider === 'ollama') {
      return this.generateOllamaResponse(message, context);
    } else {
      throw new Error(`Unknown LLM provider: ${this.provider}`);
    }
  }

  async generateOpenRouterResponse(message, context) {
    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const conversationHistory = this.buildConversationHistory(context);

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            ...conversationHistory,
            {
              role: 'user',
              content: message
            }
          ],
          temperature: 0.7,
          max_tokens: 500,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.CORS_ORIGIN || 'https://eulagitpro.github.io',
            'X-Title': 'Erika Student Assistant'
          }
        }
      );

      if (response.data.choices && response.data.choices[0]) {
        return response.data.choices[0].message.content;
      }

      throw new Error('No response from OpenRouter');
    } catch (error) {
      console.error('OpenRouter API error:', error.response?.data || error.message);
      throw new Error(`LLM Service Error: ${error.message}`);
    }
  }

  async generateOllamaResponse(message, context) {
    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const prompt = `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`;

      const response = await axios.post(
        `${this.ollamaUrl}/api/generate`,
        {
          model: this.model,
          prompt: prompt,
          stream: false,
          temperature: 0.7
        }
      );

      if (response.data.response) {
        return response.data.response.trim();
      }

      throw new Error('No response from Ollama');
    } catch (error) {
      console.error('Ollama API error:', error.message);
      throw new Error(`Local LLM Service Error: ${error.message}`);
    }
  }

  buildSystemPrompt(context) {
    return `You are Erika, a smart campus assistant that helps students manage their academic workload.

Your role:
- Help students track deadlines and assignments
- Provide time management advice
- Answer questions about their classes and schedules
- Offer study tips and motivation
- Be friendly, supportive, and understanding

User Context:
- User ID: ${context.userId}
- Classes: ${context.history && context.history.length > 0 ? 'User has active conversations' : 'No classes added yet'}
- Conversation History: ${context.history ? context.history.length : 0} messages

Guidelines:
- Be concise but helpful
- Acknowledge their academic challenges
- Offer practical suggestions
- Maintain a friendly tone
- Remember information they've shared previously`;
  }

  buildConversationHistory(context) {
    if (!context.history || context.history.length === 0) {
      return [];
    }

    // Keep only last 5 messages for context
    return context.history
      .slice(-5)
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));
  }
}

module.exports = LLMService;
