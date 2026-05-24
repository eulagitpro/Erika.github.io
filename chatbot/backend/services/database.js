// chatbot/backend/services/database.js
// Database abstraction layer supporting MongoDB and Supabase

const { createLogger } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info'
});

class Database {
  constructor() {
    this.type = process.env.DATABASE_TYPE || 'mongodb';
    this.client = null;
  }

  async initialize() {
    try {
      if (this.type === 'mongodb') {
        await this.initializeMongoDB();
      } else if (this.type === 'supabase') {
        await this.initializeSupabase();
      } else {
        throw new Error(`Unsupported database type: ${this.type}`);
      }
      logger.info(`Database initialized: ${this.type}`);
    } catch (error) {
      logger.error('Database initialization error:', error);
      throw error;
    }
  }

  async initializeMongoDB() {
    const { MongoClient } = require('mongodb');
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error('MONGODB_URI not set in environment variables');
    }

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db('chatbot');

    // Create collections if they don't exist
    await this.ensureMongoDBCollections();
  }

  async ensureMongoDBCollections() {
    const collectionNames = await this.db.listCollections().toArray();
    const names = collectionNames.map(c => c.name);

    if (!names.includes('conversations')) {
      await this.db.createCollection('conversations');
      await this.db.collection('conversations').createIndex({ userId: 1, createdAt: -1 });
    }

    if (!names.includes('messages')) {
      await this.db.createCollection('messages');
      await this.db.collection('messages').createIndex({ conversationId: 1, timestamp: 1 });
    }

    if (!names.includes('memory')) {
      await this.db.createCollection('memory');
      await this.db.collection('memory').createIndex({ userId: 1 });
    }
  }

  async initializeSupabase() {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY not set');
    }

    this.client = createClient(url, key);

    // Create tables if they don't exist
    await this.ensureSupabaseTables();
  }

  async ensureSupabaseTables() {
    // Tables should be created via Supabase UI or migration scripts
    logger.info('Supabase tables assumed to exist');
  }

  // ============ CONVERSATION OPERATIONS ============

  async createConversation(userId) {
    const conversation = {
      userId,
      title: 'New Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: []
    };

    if (this.type === 'mongodb') {
      const result = await this.db.collection('conversations').insertOne(conversation);
      conversation._id = result.insertedId;
      return conversation;
    } else if (this.type === 'supabase') {
      const { data, error } = await this.client
        .from('conversations')
        .insert([conversation])
        .select();
      if (error) throw error;
      return data[0];
    }
  }

  async getConversation(userId, conversationId) {
    if (this.type === 'mongodb') {
      const { ObjectId } = require('mongodb');
      const conversation = await this.db
        .collection('conversations')
        .findOne({
          _id: new ObjectId(conversationId),
          userId
        });
      return conversation;
    } else if (this.type === 'supabase') {
      const { data, error } = await this.client
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('userId', userId)
        .single();
      if (error) throw error;
      return data;
    }
  }

  async getConversations(userId, limit = 20, skip = 0) {
    if (this.type === 'mongodb') {
      const conversations = await this.db
        .collection('conversations')
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .toArray();
      return conversations;
    } else if (this.type === 'supabase') {
      const { data, error } = await this.client
        .from('conversations')
        .select('*')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .range(skip, skip + limit - 1);
      if (error) throw error;
      return data;
    }
  }

  async deleteConversation(userId, conversationId) {
    if (this.type === 'mongodb') {
      const { ObjectId } = require('mongodb');
      await this.db
        .collection('conversations')
        .deleteOne({
          _id: new ObjectId(conversationId),
          userId
        });
      await this.db
        .collection('messages')
        .deleteMany({ conversationId });
    } else if (this.type === 'supabase') {
      await this.client
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('userId', userId);
      await this.client
        .from('messages')
        .delete()
        .eq('conversationId', conversationId);
    }
  }

  // ============ MESSAGE OPERATIONS ============

  async saveMessage(conversationId, message) {
    const msgDoc = {
      conversationId,
      ...message
    };

    if (this.type === 'mongodb') {
      const result = await this.db.collection('messages').insertOne(msgDoc);
      msgDoc._id = result.insertedId;

      // Update conversation updatedAt
      const { ObjectId } = require('mongodb');
      await this.db
        .collection('conversations')
        .updateOne(
          { _id: new ObjectId(conversationId) },
          { $set: { updatedAt: new Date() } }
        );

      return msgDoc;
    } else if (this.type === 'supabase') {
      const { data, error } = await this.client
        .from('messages')
        .insert([msgDoc])
        .select();
      if (error) throw error;

      // Update conversation updatedAt
      await this.client
        .from('conversations')
        .update({ updatedAt: new Date() })
        .eq('id', conversationId);

      return data[0];
    }
  }

  async getMessages(conversationId, limit = 50) {
    if (this.type === 'mongodb') {
      const messages = await this.db
        .collection('messages')
        .find({ conversationId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      return messages.reverse();
    } else if (this.type === 'supabase') {
      const { data, error } = await this.client
        .from('messages')
        .select('*')
        .eq('conversationId', conversationId)
        .order('timestamp', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return data;
    }
  }

  // ============ MEMORY OPERATIONS ============

  async saveMemory(userId, data) {
    const memory = {
      userId,
      ...data,
      createdAt: new Date()
    };

    if (this.type === 'mongodb') {
      const result = await this.db.collection('memory').insertOne(memory);
      memory._id = result.insertedId;
      return memory;
    } else if (this.type === 'supabase') {
      const { data: result, error } = await this.client
        .from('memory')
        .insert([memory])
        .select();
      if (error) throw error;
      return result[0];
    }
  }

  async getMemory(userId) {
    if (this.type === 'mongodb') {
      const memory = await this.db
        .collection('memory')
        .find({ userId })
        .toArray();
      return memory;
    } else if (this.type === 'supabase') {
      const { data, error } = await this.client
        .from('memory')
        .select('*')
        .eq('userId', userId);
      if (error) throw error;
      return data;
    }
  }

  async deleteMemory(userId) {
    if (this.type === 'mongodb') {
      await this.db.collection('memory').deleteMany({ userId });
    } else if (this.type === 'supabase') {
      await this.client
        .from('memory')
        .delete()
        .eq('userId', userId);
    }
  }

  async closeConnection() {
    if (this.type === 'mongodb' && this.client) {
      await this.client.close();
    }
  }
}

module.exports = Database;
