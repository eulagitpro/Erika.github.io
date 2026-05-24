// chatbot/frontend/chatbot-widget.js
// Lightweight AI chatbot widget for embedding in GitHub Pages

class ChatbotWidget {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || 'https://erika-chatbot-api.onrender.com/api';
    this.userId = config.userId || this.generateUserId();
    this.conversationId = null;
    this.isOpen = false;
    this.isLoading = false;
    this.messages = [];
    this.conversationHistory = [];
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    this.retryAttempts = 3;
    this.retryDelay = 1000;

    this.init();
  }

  /**
   * Initialize the chatbot widget
   */
  init() {
    this.loadFromLocalStorage();
    this.createWidgetHTML();
    this.attachEventListeners();
    this.setupAutoRefresh();
  }

  /**
   * Create chatbot widget HTML
   */
  createWidgetHTML() {
    // Create wrapper container
    const wrapper = document.createElement('div');
    wrapper.id = 'erika-chatbot-widget';
    wrapper.style.cssText = `
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: 9999;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    // Chatbot button (floating action button)
    const chatbotButton = document.createElement('button');
    chatbotButton.id = 'erika-chatbot-button';
    chatbotButton.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    chatbotButton.title = 'Chat with Erika';
    chatbotButton.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #824531 0%, #692c18 100%);
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      z-index: 10000;
    `;

    chatbotButton.addEventListener('mouseenter', () => {
      chatbotButton.style.transform = 'scale(1.1)';
      chatbotButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.25)';
    });

    chatbotButton.addEventListener('mouseleave', () => {
      chatbotButton.style.transform = 'scale(1)';
      chatbotButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    });

    chatbotButton.addEventListener('click', () => this.toggleWidget());

    // Chatbot window
    const chatWindow = document.createElement('div');
    chatWindow.id = 'erika-chat-window';
    chatWindow.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 30px;
      width: 420px;
      height: 600px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.16);
      display: none;
      flex-direction: column;
      animation: slideUp 0.3s ease;
      z-index: 9999;
      max-width: calc(100vw - 20px);
    `;

    chatWindow.innerHTML = `
      <div style="background: linear-gradient(135deg, #824531 0%, #692c18 100%); color: white; padding: 1.5rem; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">Erika Chat</h3>
          <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; opacity: 0.9;">Ask anything about your studies</p>
        </div>
        <button id="erika-close-btn" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
      </div>

      <div id="erika-messages" style="flex: 1; overflow-y: auto; padding: 1.5rem; background: #fae1c8; display: flex; flex-direction: column; gap: 1rem;">
        <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #8c8c8c; text-align: center;">
          <div style="max-width: 80%;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">👋</div>
            <p style="margin: 0; font-size: 0.95rem;">Welcome! I'm Erika, your AI study assistant. How can I help you today?</p>
          </div>
        </div>
      </div>

      <div style="padding: 1rem; background: white; border-top: 1px solid #ededed;">
        <div style="display: flex; gap: 0.8rem; margin-bottom: 0.8rem;">
          <input 
            type="text" 
            id="erika-input" 
            placeholder="Type your message..." 
            style="flex: 1; padding: 0.8rem; border: 1px solid #ededed; border-radius: 8px; font-family: inherit; font-size: 0.95rem; transition: border-color 0.3s;"
          />
          <button 
            id="erika-send-btn" 
            style="background: #824531; color: white; border: none; padding: 0.8rem 1.2rem; border-radius: 8px; cursor: pointer; font-weight: 600; transition: background 0.3s;"
          >Send</button>
        </div>
        <div style="display: flex; gap: 0.5rem; font-size: 0.8rem;">
          <button id="erika-clear-btn" style="flex: 1; background: #ededed; border: none; padding: 0.6rem; border-radius: 6px; cursor: pointer; color: #191817;">Clear</button>
          <button id="erika-history-btn" style="flex: 1; background: #ededed; border: none; padding: 0.6rem; border-radius: 6px; cursor: pointer; color: #191817;">History</button>
        </div>
      </div>
    `;

    wrapper.appendChild(chatbotButton);
    wrapper.appendChild(chatWindow);
    document.body.appendChild(wrapper);

    // Add styles for animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes typingDot {
        0%, 60%, 100% { opacity: 0.5; }
        30% { opacity: 1; }
      }

      #erika-input:focus {
        outline: none;
        border-color: #824531;
        box-shadow: 0 0 5px rgba(130, 69, 49, 0.2);
      }

      #erika-send-btn:hover {
        background: #692c18;
      }

      #erika-send-btn:disabled {
        background: #bfd3d8;
        cursor: not-allowed;
      }

      #erika-messages {
        scrollbar-width: thin;
        scrollbar-color: #bfd3d8 #fae1c8;
      }

      #erika-messages::-webkit-scrollbar {
        width: 6px;
      }

      #erika-messages::-webkit-scrollbar-track {
        background: #fae1c8;
      }

      #erika-messages::-webkit-scrollbar-thumb {
        background: #bfd3d8;
        border-radius: 3px;
      }

      .erika-message {
        display: flex;
        gap: 0.8rem;
        animation: fadeIn 0.3s ease;
      }

      .erika-message.user {
        justify-content: flex-end;
      }

      .erika-message-bubble {
        max-width: 75%;
        padding: 0.8rem 1rem;
        border-radius: 8px;
        line-height: 1.4;
        word-wrap: break-word;
      }

      .erika-message.user .erika-message-bubble {
        background: #824531;
        color: white;
      }

      .erika-message.assistant .erika-message-bubble {
        background: #e5eaeb;
        color: #191817;
      }

      .erika-typing {
        display: flex;
        gap: 4px;
      }

      .erika-typing span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #8c8c8c;
        animation: typingDot 1.4s infinite;
      }

      .erika-typing span:nth-child(2) {
        animation-delay: 0.2s;
      }

      .erika-typing span:nth-child(3) {
        animation-delay: 0.4s;
      }

      code {
        background: #f5f5f5;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
      }

      pre {
        background: #f5f5f5;
        padding: 1rem;
        border-radius: 6px;
        overflow-x: auto;
        margin: 0.5rem 0;
      }

      pre code {
        padding: 0;
        background: none;
      }

      @media (max-width: 600px) {
        #erika-chat-window {
          width: 100% !important;
          height: 100% !important;
          bottom: 0 !important;
          right: 0 !important;
          border-radius: 0 !important;
          max-width: 100% !important;
        }

        #erika-chatbot-button {
          bottom: 20px !important;
          right: 20px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const input = document.getElementById('erika-input');
    const sendBtn = document.getElementById('erika-send-btn');
    const closeBtn = document.getElementById('erika-close-btn');
    const clearBtn = document.getElementById('erika-clear-btn');
    const historyBtn = document.getElementById('erika-history-btn');

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendBtn.addEventListener('click', () => this.sendMessage());
    closeBtn.addEventListener('click', () => this.toggleWidget());
    clearBtn.addEventListener('click', () => this.clearConversation());
    historyBtn.addEventListener('click', () => this.showConversationHistory());
  }

  /**
   * Toggle widget visibility
   */
  toggleWidget() {
    this.isOpen = !this.isOpen;
    const chatWindow = document.getElementById('erika-chat-window');
    chatWindow.style.display = this.isOpen ? 'flex' : 'none';

    if (this.isOpen) {
      setTimeout(() => {
        document.getElementById('erika-input').focus();
      }, 100);
    }
  }

  /**
   * Send message to backend
   */
  async sendMessage() {
    const input = document.getElementById('erika-input');
    const message = input.value.trim();

    if (!message || this.isLoading) return;

    // Add user message to UI
    this.addMessage(message, 'user');
    input.value = '';

    // Show typing indicator
    this.showTypingIndicator();

    try {
      const response = await this.retryFetch(`${this.apiUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          userId: this.userId,
          conversationId: this.conversationId,
          sessionId: this.getSessionId()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Update conversation ID
      if (data.conversationId) {
        this.conversationId = data.conversationId;
        this.saveToLocalStorage();
      }

      // Add assistant message
      this.addMessage(data.message, 'assistant');
      this.conversationHistory.push({ user: message, assistant: data.message });
      this.saveToLocalStorage();

    } catch (error) {
      console.error('Chat error:', error);
      this.addMessage(`Error: ${error.message}. Please try again.`, 'error');
    } finally {
      this.removeTypingIndicator();
      this.isLoading = false;
    }
  }

  /**
   * Add message to chat UI
   */
  addMessage(content, role) {
    const messagesContainer = document.getElementById('erika-messages');

    // Clear initial message if first message
    if (messagesContainer.children.length === 1 && 
        messagesContainer.children[0].style.display !== 'flex') {
      messagesContainer.innerHTML = '';
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `erika-message ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'erika-message-bubble';

    if (role === 'error') {
      bubble.style.background = '#ffebee';
      bubble.style.color = '#c62828';
    }

    // Parse markdown-like formatting
    bubble.innerHTML = this.parseMarkdown(content);

    messageDiv.appendChild(bubble);
    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    this.messages.push({ role, content, timestamp: new Date() });
  }

  /**
   * Parse markdown formatting
   */
  parseMarkdown(text) {
    // Escape HTML
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  /**
   * Show typing indicator
   */
  showTypingIndicator() {
    const messagesContainer = document.getElementById('erika-messages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'erika-typing-indicator';
    typingDiv.className = 'erika-message assistant';
    typingDiv.innerHTML = `
      <div class="erika-message-bubble">
        <div class="erika-typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    this.isLoading = true;
  }

  /**
   * Remove typing indicator
   */
  removeTypingIndicator() {
    const indicator = document.getElementById('erika-typing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  /**
   * Clear conversation
   */
  clearConversation() {
    if (confirm('Clear conversation history?')) {
      this.messages = [];
      this.conversationHistory = [];
      this.conversationId = null;
      const messagesContainer = document.getElementById('erika-messages');
      messagesContainer.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #8c8c8c; text-align: center;">
          <div style="max-width: 80%;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">👋</div>
            <p style="margin: 0; font-size: 0.95rem;">Conversation cleared. How can I help?</p>
          </div>
        </div>
      `;
      this.saveToLocalStorage();
    }
  }

  /**
   * Show conversation history
   */
  showConversationHistory() {
    if (this.conversationHistory.length === 0) {
      alert('No conversation history');
      return;
    }

    let historyText = 'Recent Conversation:\n\n';
    this.conversationHistory.slice(-5).forEach((exchange, i) => {
      historyText += `${i + 1}. You: ${exchange.user}\n   Erika: ${exchange.assistant.substring(0, 50)}...\n\n`;
    });

    alert(historyText);
  }

  /**
   * Retry fetch with exponential backoff
   */
  async retryFetch(url, options, attempt = 1) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (attempt < this.retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        return this.retryFetch(url, options, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Generate unique user ID
   */
  generateUserId() {
    let userId = localStorage.getItem('erika-user-id');
    if (!userId) {
      userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('erika-user-id', userId);
    }
    return userId;
  }

  /**
   * Get session ID
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem('erika-session-id');
    if (!sessionId) {
      sessionId = `session-${Date.now()}`;
      sessionStorage.setItem('erika-session-id', sessionId);
    }
    return sessionId;
  }

  /**
   * Save to local storage
   */
  saveToLocalStorage() {
    const data = {
      userId: this.userId,
      conversationId: this.conversationId,
      messages: this.messages,
      conversationHistory: this.conversationHistory,
      timestamp: Date.now()
    };
    localStorage.setItem('erika-chatbot-state', JSON.stringify(data));
  }

  /**
   * Load from local storage
   */
  loadFromLocalStorage() {
    const data = localStorage.getItem('erika-chatbot-state');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        // Only restore if within timeout window
        if (Date.now() - parsed.timestamp < this.sessionTimeout) {
          this.conversationId = parsed.conversationId;
          this.messages = parsed.messages;
          this.conversationHistory = parsed.conversationHistory;
        }
      } catch (e) {
        console.warn('Failed to load chatbot state:', e);
      }
    }
  }

  /**
   * Setup auto-refresh for session
   */
  setupAutoRefresh() {
    setInterval(() => {
      this.saveToLocalStorage();
    }, 60000); // Save every minute
  }
}

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.erikaChatbot = new ChatbotWidget({
      apiUrl: window.CHATBOT_API_URL || 'https://erika-chatbot-api.onrender.com/api'
    });
  });
} else {
  window.erikaChatbot = new ChatbotWidget({
    apiUrl: window.CHATBOT_API_URL || 'https://erika-chatbot-api.onrender.com/api'
  });
}
