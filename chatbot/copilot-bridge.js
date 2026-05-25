/**
 * Copilot Studio Bridge
 * Enables bidirectional communication between Copilot Studio chatbot and the website
 * Allows the chatbot to access and retrieve user data from localStorage
 */

class CopilotBridge {
  constructor() {
    this.apiEndpoint = 'https://default56090e6225404107916fcd9690f423.d3.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/cr293_erikaSemesterPlanner/conversations';
    this.apiVersion = '2022-03-01-preview';
    this.currentUser = null;
    this.conversationId = null;
    this.init();
  }

  /**
   * Initialize the bridge
   */
  init() {
    // Load current user
    this.loadCurrentUser();
    
    // Setup window communication for iframe
    window.addEventListener('message', (event) => this.handleMessage(event));
    
    // Make functions globally accessible for the chatbot
    window.erikaBridge = {
      getUserData: () => this.getUserData(),
      getClasses: () => this.getClasses(),
      getTasks: () => this.getTasks(),
      getTasksByClass: (classId) => this.getTasksByClass(classId),
      getUpcomingDeadlines: () => this.getUpcomingDeadlines(),
      addClass: (classData) => this.addClass(classData),
      addTask: (taskData) => this.addTask(taskData),
      updateTask: (taskId, taskData) => this.updateTask(taskId, taskData),
      completeTask: (taskId) => this.completeTask(taskId),
      getClassById: (classId) => this.getClassById(classId),
      getTaskById: (taskId) => this.getTaskById(taskId),
      getUserStats: () => this.getUserStats(),
      searchTasks: (query) => this.searchTasks(query)
    };
    
    console.log('Copilot Bridge initialized');
  }

  /**
   * Load current user from localStorage
   */
  loadCurrentUser() {
    const userEmail = localStorage.getItem('currentUser');
    if (userEmail) {
      const allUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
      this.currentUser = allUsers.find(u => u.email === userEmail);
    }
  }

  /**
   * Get all user data
   */
  getUserData() {
    if (!this.currentUser) return null;
    
    return {
      id: this.currentUser.id,
      nickname: this.currentUser.nickname,
      name: this.currentUser.name,
      email: this.currentUser.email,
      classes: this.currentUser.classes || [],
      tasks: this.currentUser.tasks || [],
      appointments: this.currentUser.appointments || [],
      createdAt: this.currentUser.createdAt,
      lastLogin: this.currentUser.lastLogin
    };
  }

  /**
   * Get all classes for current user
   */
  getClasses() {
    if (!this.currentUser) return [];
    return this.currentUser.classes || [];
  }

  /**
   * Get all tasks for current user
   */
  getTasks() {
    if (!this.currentUser) return [];
    return this.currentUser.tasks || [];
  }

  /**
   * Get tasks for a specific class
   */
  getTasksByClass(classId) {
    if (!this.currentUser) return [];
    return (this.currentUser.tasks || []).filter(t => t.classId === classId);
  }

  /**
   * Get upcoming deadlines (next 10)
   */
  getUpcomingDeadlines() {
    if (!this.currentUser) return [];
    
    const deadlines = [];
    (this.currentUser.tasks || []).forEach(task => {
      if (!task.completed) {
        const classInfo = (this.currentUser.classes || []).find(c => c.id === task.classId);
        deadlines.push({
          taskId: task.id,
          title: task.name,
          date: task.dueDate,
          className: classInfo ? classInfo.name : 'General',
          classColor: classInfo ? classInfo.color : '#824531',
          description: task.description || ''
        });
      }
    });

    return deadlines
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 10);
  }

  /**
   * Add a new class
   */
  addClass(classData) {
    if (!this.currentUser) return { success: false, error: 'User not logged in' };
    
    try {
      const newClass = {
        id: `class_${Date.now()}`,
        name: classData.name,
        code: classData.code,
        color: classData.color || '#824531',
        instructor: classData.instructor || '',
        schedule: classData.schedule || { days: [], startTime: '', endTime: '' },
        createdAt: new Date().toISOString()
      };

      if (!this.currentUser.classes) this.currentUser.classes = [];
      this.currentUser.classes.push(newClass);
      this.saveUserData();

      return { success: true, data: newClass };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Add a new task
   */
  addTask(taskData) {
    if (!this.currentUser) return { success: false, error: 'User not logged in' };
    
    try {
      const newTask = {
        id: `task_${Date.now()}`,
        name: taskData.name,
        classId: taskData.classId,
        dueDate: taskData.dueDate,
        description: taskData.description || '',
        completed: false,
        createdAt: new Date().toISOString()
      };

      if (!this.currentUser.tasks) this.currentUser.tasks = [];
      this.currentUser.tasks.push(newTask);
      this.saveUserData();

      return { success: true, data: newTask };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a task
   */
  updateTask(taskId, taskData) {
    if (!this.currentUser) return { success: false, error: 'User not logged in' };
    
    try {
      const task = (this.currentUser.tasks || []).find(t => t.id === taskId);
      if (!task) return { success: false, error: 'Task not found' };

      Object.assign(task, taskData);
      this.saveUserData();

      return { success: true, data: task };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark task as complete
   */
  completeTask(taskId) {
    if (!this.currentUser) return { success: false, error: 'User not logged in' };
    
    try {
      const task = (this.currentUser.tasks || []).find(t => t.id === taskId);
      if (!task) return { success: false, error: 'Task not found' };

      task.completed = true;
      task.completedAt = new Date().toISOString();
      this.saveUserData();

      return { success: true, data: task };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get class by ID
   */
  getClassById(classId) {
    if (!this.currentUser) return null;
    return (this.currentUser.classes || []).find(c => c.id === classId);
  }

  /**
   * Get task by ID
   */
  getTaskById(taskId) {
    if (!this.currentUser) return null;
    return (this.currentUser.tasks || []).find(t => t.id === taskId);
  }

  /**
   * Get user statistics
   */
  getUserStats() {
    if (!this.currentUser) return null;
    
    const tasks = this.currentUser.tasks || [];
    const completedTasks = tasks.filter(t => t.completed).length;
    const pendingTasks = tasks.filter(t => !t.completed).length;

    return {
      totalClasses: (this.currentUser.classes || []).length,
      totalTasks: tasks.length,
      completedTasks: completedTasks,
      pendingTasks: pendingTasks,
      progressPercentage: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0
    };
  }

  /**
   * Search tasks by name or description
   */
  searchTasks(query) {
    if (!this.currentUser) return [];
    
    const searchTerm = query.toLowerCase();
    return (this.currentUser.tasks || []).filter(t => 
      t.name.toLowerCase().includes(searchTerm) ||
      (t.description && t.description.toLowerCase().includes(searchTerm))
    );
  }

  /**
   * Save user data to localStorage
   */
  saveUserData() {
    try {
      const allUsers = JSON.parse(localStorage.getItem('allUsers')) || [];
      const userIndex = allUsers.findIndex(u => u.email === this.currentUser.email);
      if (userIndex !== -1) {
        allUsers[userIndex] = this.currentUser;
        localStorage.setItem('allUsers', JSON.stringify(allUsers));
      }
    } catch (error) {
      console.error('Failed to save user data:', error);
    }
  }

  /**
   * Handle messages from iframe (future enhancement)
   */
  handleMessage(event) {
    // Validate origin for security
    if (event.origin !== 'https://copilotstudio.microsoft.com') {
      return;
    }

    const { type, data } = event.data;
    
    switch (type) {
      case 'GET_USER_DATA':
        event.source.postMessage({
          type: 'USER_DATA',
          data: this.getUserData()
        }, event.origin);
        break;
      
      case 'GET_TASKS':
        event.source.postMessage({
          type: 'TASKS',
          data: this.getTasks()
        }, event.origin);
        break;
      
      case 'GET_CLASSES':
        event.source.postMessage({
          type: 'CLASSES',
          data: this.getClasses()
        }, event.origin);
        break;

      default:
        console.warn('Unknown message type:', type);
    }
  }

  /**
   * Send data to chatbot API
   */
  async sendToChatbot(conversationData) {
    try {
      const response = await fetch(`${this.apiEndpoint}?api-version=${this.apiVersion}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(conversationData)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('Error sending to chatbot:', error);
      return { success: false, error: error.message };
    }
  }
}

// Auto-initialize the bridge
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.copilotBridge = new CopilotBridge();
  });
} else {
  window.copilotBridge = new CopilotBridge();
}
