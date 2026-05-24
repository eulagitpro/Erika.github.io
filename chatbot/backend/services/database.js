// chatbot/backend/services/database.js
// Database abstraction layer supporting MongoDB and Supabase

const mongodb = require('mongodb');
const { MongoClient } = mongodb;

class Database {
  constructor() {
    this.client = null;
    this.db = null;
    this.databaseType = process.env.DATABASE_TYPE || 'mongodb';
  }

  async initialize() {
    if (this.databaseType === 'mongodb') {
      await this.initializeMongoDB();
    } else if (this.databaseType === 'supabase') {
      await this.initializeSupabase();
    }
  }

  async initializeMongoDB() {
    try {
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        throw new Error('MONGODB_URI not configured');
      }

      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db('erika_chatbot');

      // Create collections and indexes
      await this.ensureCollections();
      console.log('MongoDB connected successfully');
    } catch (error) {
      console.error('MongoDB connection failed:', error);
      throw error;
    }
  }

  async initializeSupabase() {
    try {
      const { createClient } = require('@supabase/supabase-js');
      this.db = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
      );
      console.log('Supabase connected successfully');
    } catch (error) {
      console.error('Supabase connection failed:', error);
      throw error;
    }
  }

  async ensureCollections() {
    const collections = ['conversations', 'messages', 'memory'];

    for (const collectionName of collections) {
      try {
        await this.db.createCollection(collectionName);
      } catch (error) {
        // Collection already exists, ignore error
      }
    }

    // Create indexes
    const conversationsCollection = this.db.collection('conversations');
    await conversationsCollection.createIndex({ userId: 1, createdAt: -1 });

    const messagesCollection = this.db.collection('messages');
    await messagesCollection.createIndex({ conversationId: 1, timestamp: -1 });

    const memoryCollection = this.db.collection('memory');
    await memoryCollection.createIndex({ userId: 1 });
  }

  async createConversation(userId) {
    const conversation = {
      userId,
      title: 'New Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: []
    };

    const result = await this.db.collection('conversations').insertOne(conversation);
    conversation.id = result.insertedId;
    return conversation;
  }

  async getConversation(userId, conversationId) {
    const { ObjectId } = require('mongodb');
    const conversation = await this.db.collection('conversations').findOne({
      _id: new ObjectId(conversationId),
      userId
    });

    if (!conversation) return null;

    const messages = await this.db.collection('messages')
      .find({ conversationId: new ObjectId(conversationId) })
      .sort({ timestamp: 1 })
      .toArray();

    return {
      id: conversation._id,
      ...conversation,
      messages
    };
  }

  async getConversations(userId, limit = 20, skip = 0) {
    const conversations = await this.db.collection('conversations')
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();

    return conversations.map(conv => ({
      id: conv._id,
      ...conv
    }));
  }

  async saveMessage(conversationId, message) {
    const { ObjectId } = require('mongodb');
    const messageWithConversation = {
      ...message,
      conversationId: new ObjectId(conversationId),
      timestamp: new Date()
    };

    const result = await this.db.collection('messages').insertOne(messageWithConversation);

    // Update conversation updatedAt
    await this.db.collection('conversations').updateOne(
      { _id: new ObjectId(conversationId) },
      { $set: { updatedAt: new Date() } }
    );

    return {
      id: result.insertedId,
      ...messageWithConversation
    };
  }

  async deleteConversation(userId, conversationId) {
    const { ObjectId } = require('mongodb');
    
    // Delete all messages in conversation
    await this.db.collection('messages').deleteMany({
      conversationId: new ObjectId(conversationId)
    });

    // Delete conversation
    await this.db.collection('conversations').deleteOne({
      _id: new ObjectId(conversationId),
      userId
    });
  }

  async saveMemory(userId, memory) {
    const memoryData = {
      userId,
      ...memory,
      timestamp: new Date()
    };

    const result = await this.db.collection('memory').insertOne(memoryData);
    return {
      id: result.insertedId,
      ...memoryData
    };
  }

  async getMemory(userId) {
    const memories = await this.db.collection('memory')
      .find({ userId })
      .sort({ timestamp: -1 })
      .toArray();

    return memories;
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

module.exports = Database;
