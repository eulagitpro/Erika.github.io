# AI Chatbot Setup & Deployment Guide

Complete guide to set up, configure, and deploy the Erika AI chatbot for your GitHub Pages website.

## Table of Contents

1. [Project Structure](#project-structure)
2. [Backend Setup](#backend-setup)
3. [Database Configuration](#database-configuration)
4. [LLM Provider Setup](#llm-provider-setup)
5. [Deployment](#deployment)
6. [Frontend Integration](#frontend-integration)
7. [GitHub Pages Integration](#github-pages-integration)
8. [Troubleshooting](#troubleshooting)

---

## Project Structure

```
Erika.github.io/
├── chatbot/
│   ├── backend/
│   │   ├── server.js                 # Main Express server
│   │   ├── package.json              # Dependencies
│   │   ├── .env.example              # Environment template
│   │   └── services/
│   │       ├── database.js           # MongoDB/Supabase abstraction
│   │       ├── llmService.js         # OpenRouter/Ollama integration
│   │       └── memoryService.js      # Vector search & memory
│   └── frontend/
│       ├── chatbot-widget.js         # Main chatbot component
│       └── chatbot-snippet.html      # Integration example
├── docs/
│   └── CHATBOT_SETUP.md              # This file
└── (existing Erika.github.io files)
```

---

## Backend Setup

### 1. Prerequisites

- Node.js 16+ and npm 8+
- Git
- A free backend hosting account (Render, Railway, or Heroku)

### 2. Install Dependencies

```bash
# Navigate to backend directory
cd chatbot/backend

# Install npm packages
npm install

# Verify installation
npm list
```

### 3. Environment Configuration

```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Configure the following variables:

```env
# Server
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://eulagitpro.github.io

# LLM Provider (choose one)
LLM_PROVIDER=openrouter
LLM_MODEL=deepseek/deepseek-chat
OPENROUTER_API_KEY=your_key_here

# Database
DATABASE_TYPE=mongodb
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/chatbot

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000

# Logging
LOG_LEVEL=info
```

### 4. Test Locally

```bash
# Start development server
npm run dev

# Server should run on http://localhost:3000

# Test health endpoint
curl http://localhost:3000/api/health
```

---

## Database Configuration

### Option 1: MongoDB Atlas (Free Tier)

1. **Create Account**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up for free
   - Create a new project

2. **Create Cluster**
   - Click "Create" under Deployments
   - Select "Shared" tier (free)
   - Choose a region close to your users
   - Wait for cluster to deploy (~3 minutes)

3. **Get Connection String**
   - Click "Connect"
   - Select "Drivers"
   - Choose "Node.js"
   - Copy the connection string
   - Replace `<username>`, `<password>`, and `<database>` with your values

4. **Create Database Collections**
   - In MongoDB Atlas: Collections → Create Collection
   - Create collections:
     - `conversations` (indexed on: `userId`, `createdAt`)
     - `messages` (indexed on: `conversationId`, `timestamp`)
     - `memory` (indexed on: `userId`)

5. **Update .env**
   ```env
   DATABASE_TYPE=mongodb
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatbot?retryWrites=true&w=majority
   ```

### Option 2: Supabase (Free Tier)

1. **Create Account**
   - Go to [Supabase](https://supabase.com)
   - Sign up with GitHub
   - Create a new project

2. **Create Tables**
   - Go to SQL Editor
   - Run the following SQL:

```sql
-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId TEXT NOT NULL,
  title TEXT DEFAULT 'New Conversation',
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_userId_createdAt ON conversations(userId, createdAt DESC);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversationId UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversationId_timestamp ON messages(conversationId, timestamp);

-- Memory table
CREATE TABLE memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId TEXT NOT NULL,
  summary TEXT,
  userMessage TEXT,
  assistantResponse TEXT,
  keywords TEXT[],
  embedding FLOAT8[],
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_memory_userId ON memory(userId);
```

3. **Get Credentials**
   - Settings → API
   - Copy Project URL and anon key

4. **Update .env**
   ```env
   DATABASE_TYPE=supabase
   SUPABASE_URL=your_project_url
   SUPABASE_KEY=your_anon_key
   ```

---

## LLM Provider Setup

### Option 1: OpenRouter (Recommended - Free Models)

1. **Create Account**
   - Go to [OpenRouter](https://openrouter.ai)
   - Sign up (free)
   - No credit card required initially

2. **Get API Key**
   - Dashboard → Keys
   - Create new API key
   - Copy the key

3. **Available Free Models**
   - `deepseek/deepseek-chat` - Best cost/performance
   - `meta-llama/llama-2-7b-chat` - Open source
   - `mistralai/mistral-7b-instruct` - Fast

4. **Update .env**
   ```env
   LLM_PROVIDER=openrouter
   OPENROUTER_API_KEY=your_key_here
   LLM_MODEL=deepseek/deepseek-chat
   ```

5. **Monitor Usage**
   - OpenRouter Dashboard → Usage
   - Free tier includes credit (~$5 initial)

### Option 2: Ollama (Local Models - No API Key Needed)

1. **Install Ollama**
   ```bash
   # macOS
   brew install ollama

   # Linux
   curl https://ollama.ai/install.sh | sh

   # Windows
   Download from https://ollama.ai
   ```

2. **Pull a Model**
   ```bash
   ollama pull llama2
   # or
   ollama pull mistral
   ```

3. **Start Ollama Server**
   ```bash
   ollama serve
   ```

4. **Update .env**
   ```env
   LLM_PROVIDER=ollama
   OLLAMA_API_URL=http://localhost:11434
   LLM_MODEL=llama2
   ```

---

## Deployment

### Deploy to Render (Recommended - Free Tier)

1. **Prepare Repository**
   ```bash
   # Push code to GitHub
   git add .
   git commit -m "Add chatbot backend"
   git push origin add-ai-chatbot
   ```

2. **Create Render Account**
   - Go to [Render](https://render.com)
   - Sign up with GitHub
   - Authorize repository access

3. **Create New Service**
   - Dashboard → New +
   - Select "Web Service"
   - Connect GitHub repository
   - Select branch: `add-ai-chatbot`
   - Set Root Directory: `chatbot/backend`

4. **Configure Service**
   - **Name**: `erika-chatbot-api`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (0.5 CPU, 512 MB RAM)

5. **Set Environment Variables**
   - Add all variables from `.env`:
     - `PORT=3000`
     - `CORS_ORIGIN=https://eulagitpro.github.io`
     - `MONGODB_URI=...`
     - `OPENROUTER_API_KEY=...`
     - `LLM_PROVIDER=openrouter`
     - `LLM_MODEL=deepseek/deepseek-chat`

6. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (~2-3 minutes)
   - Get your service URL: `https://your-service-name.onrender.com`

### Deploy to Railway (Alternative)

1. **Create Account**
   - Go to [Railway](https://railway.app)
   - Sign in with GitHub

2. **Create Project**
   - New Project → GitHub Repo
   - Select repository and branch

3. **Configure**
   - Add environment variables
   - Railway auto-detects Node.js
   - Set `PORT` to `3000`

4. **Deploy**
   - Push to GitHub → Railway auto-deploys
   - Get public URL from deployment

---

## Frontend Integration

### 1. Update Backend URL in Frontend

Edit `chatbot/frontend/chatbot-widget.js`:

```javascript
// Find this line (near the end):
apiUrl: window.CHATBOT_API_URL || 'https://your-render-app.onrender.com/api'

// Replace with your actual backend URL:
apiUrl: window.CHATBOT_API_URL || 'https://erika-chatbot-api.onrender.com/api'
```

### 2. Add to Your Pages

Add this before closing `</body>` tag:

```html
<!-- Chatbot Widget -->
<script>
    window.CHATBOT_API_URL = 'https://erika-chatbot-api.onrender.com/api';
</script>
<script src="https://eulagitpro.github.io/chatbot/frontend/chatbot-widget.js"></script>
```

### 3. Recommended Pages to Add

- `landingpage.html` - Welcome page
- `homepage.html` - Dashboard
- `calendar.html` - Calendar
- Any new pages

---

## GitHub Pages Integration

### 1. Push Chatbot Files

```bash
# Add all chatbot files
git add chatbot/

# Commit changes
git commit -m "Add AI chatbot frontend and backend config"

# Push to GitHub
git push origin add-ai-chatbot
```

### 2. Create Pull Request

1. Go to repository on GitHub
2. Create Pull Request: `add-ai-chatbot` → `main`
3. Add description with setup instructions
4. Request review
5. Merge to main

### 3. Verify Deployment

1. GitHub Pages rebuilds automatically
2. Visit your site: `https://eulagitpro.github.io`
3. Chatbot circle should appear in bottom-right
4. Click to test

---

## Testing & Troubleshooting

### Test Backend API

```bash
# Health check
curl https://your-backend.onrender.com/api/health

# Test chat endpoint
curl -X POST https://your-backend.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "userId": "test-user",
    "conversationId": null
  }'
```

### Common Issues

**1. CORS Error**
- Error: `Access to XMLHttpRequest blocked by CORS policy`
- Fix: Check `CORS_ORIGIN` in `.env` matches your GitHub Pages domain

**2. API Endpoint Not Working**
- Error: `Failed to fetch`
- Fix: Verify backend is running and URL is correct

**3. OpenRouter Error**
- Error: `Invalid API key`
- Fix: Check API key is correct and not expired

**4. Database Connection Failed**
- Error: `MongoDB connection error`
- Fix: Verify connection string and network access in MongoDB Atlas

**5. Chatbot Not Appearing**
- Check browser console for errors
- Verify script is loaded: `window.erikaChatbot`
- Check if CHATBOT_API_URL is set

### Debug Mode

Add to browser console:

```javascript
// Enable debug logging
window.erikaChatbot.debug = true;

// Check state
console.log(window.erikaChatbot.messages);
console.log(window.erikaChatbot.conversationId);

// View stored data
console.log(JSON.parse(localStorage.getItem('erika-chatbot-state')));
```

---

## Production Checklist

- [ ] Backend deployed and running
- [ ] Database configured and tables created
- [ ] LLM provider API key set up
- [ ] CORS configured for GitHub Pages domain
- [ ] Environment variables set in production
- [ ] Rate limiting configured
- [ ] Logging enabled
- [ ] Frontend widget integrated
- [ ] Chatbot tested in all pages
- [ ] Mobile responsiveness verified
- [ ] Error handling tested
- [ ] Memory and conversation history working

---

## Monitoring & Maintenance

### Monitor Backend

- Render Dashboard: Check logs and metrics
- Error logs: `logs/error.log`
- Performance: Response times, error rates

### Clean Up Old Conversations

```bash
# Run cleanup script (optional)
# Delete conversations older than 90 days
db.conversations.deleteMany({
  createdAt: { $lt: new Date(Date.now() - 90*24*60*60*1000) }
})
```

### Update Models

To use a different LLM model:

```env
# In .env, change:
LLM_MODEL=meta-llama/llama-2-7b-chat
# or
LLM_MODEL=mistralai/mistral-7b-instruct
```

---

## Costs Breakdown (Free Tier)

| Service | Free Tier | Cost |
|---------|-----------|------|
| GitHub Pages | Unlimited | Free |
| Render Web Service | 750 hours/month | Free |
| MongoDB Atlas | 512 MB storage | Free |
| Supabase PostgreSQL | 500 MB storage | Free |
| OpenRouter | Credit-based | ~$5 initial |
| Ollama | Self-hosted | Free |

**Total Monthly Cost**: $0 (unless exceeding free tier limits)

---

## Support & Resources

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Guide](https://docs.mongodb.com/atlas/)
- [OpenRouter Docs](https://openrouter.ai/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Express.js Guide](https://expressjs.com/)

---

## License

MIT License - Feel free to use and modify
