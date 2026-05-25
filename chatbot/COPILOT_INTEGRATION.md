# Copilot Studio Integration Guide

## Overview

The Erika website now integrates with **Microsoft Copilot Studio** for AI-powered chatbot functionality. This guide explains how the chatbot communicates with your website and how to retrieve data.

## Architecture

### Components

1. **Copilot Studio Bot** - Hosted on Microsoft Power Platform
   - URL: `https://copilotstudio.microsoft.com/environments/Default-56090e62-2540-4107-916f-cd9690f423d3/bots/cr293_erikaSemesterPlanner/webchat`
   - Environment: Default
   - Bot ID: `cr293_erikaSemesterPlanner`

2. **Copilot Bridge** (`chatbot/copilot-bridge.js`)
   - Acts as the bridge between the website and chatbot
   - Manages data retrieval and storage
   - Handles bidirectional communication

3. **Website Pages** (homepage.html, calendar.html, etc.)
   - Loads the Copilot Bridge
   - Embeds chatbot in iframe
   - Provides user data to chatbot

## How It Works

### Data Flow

```
Copilot Studio (Iframe)
        ↓
    Message
        ↓
Copilot Bridge (window.erikaBridge)
        ↓
  localStorage
        ↓
   User Data
```

### Available Functions

The Copilot Bridge exposes the following functions to the chatbot via `window.erikaBridge`:

#### User Data
- **`getUserData()`** - Get all user information
- **`getUserStats()`** - Get user statistics (classes, tasks, progress)

#### Classes
- **`getClasses()`** - Get all classes for the user
- **`getClassById(classId)`** - Get specific class details
- **`addClass(classData)`** - Add a new class

#### Tasks
- **`getTasks()`** - Get all tasks for the user
- **`getTasksByClass(classId)`** - Get tasks for a specific class
- **`getTaskById(taskId)`** - Get specific task details
- **`addTask(taskData)`** - Add a new task
- **`updateTask(taskId, taskData)`** - Update a task
- **`completeTask(taskId)`** - Mark task as complete
- **`searchTasks(query)`** - Search tasks by name or description

#### Deadlines
- **`getUpcomingDeadlines()`** - Get next 10 upcoming deadlines

## Integration in HTML Pages

### 1. Load the Bridge

Add this to the `<head>` section:

```html
<script src="chatbot/copilot-bridge.js"></script>
```

### 2. Embed the Chatbot

Add the iframe to your page:

```html
<div id="chatModal" class="modal">
    <div class="modal-content chat-modal">
        <div class="modal-header">
            <h2>Chat with Erika</h2>
            <button class="close-modal" onclick="closeChatModal()">&times;</button>
        </div>
        <div class="modal-body chat-modal-body">
            <iframe id="chatbotIframe"
                    src="https://copilotstudio.microsoft.com/environments/Default-56090e62-2540-4107-916f-cd9690f423d3/bots/cr293_erikaSemesterPlanner/webchat?__version__=2" 
                    frameborder="0" 
                    style="width: 100%; height: 100%;"
                    allow="geolocation; microphone; camera"></iframe>
        </div>
    </div>
</div>
```

### 3. Access Data from JavaScript

Inside your page's JavaScript, you can access the bridge functions:

```javascript
// After page loads
window.addEventListener('DOMContentLoaded', () => {
    // Check if bridge is loaded
    if (window.copilotBridge) {
        console.log('✓ Copilot Bridge loaded');
        console.log('Available functions:', Object.keys(window.erikaBridge || {}));
    }
});

// Get user data
const userData = window.erikaBridge.getUserData();
console.log('Current user:', userData);

// Get all tasks
const tasks = window.erikaBridge.getTasks();
console.log('All tasks:', tasks);

// Get upcoming deadlines
const deadlines = window.erikaBridge.getUpcomingDeadlines();
console.log('Upcoming deadlines:', deadlines);

// Add a new task
const result = window.erikaBridge.addTask({
    name: 'New Assignment',
    classId: 'class_123',
    dueDate: '2026-06-15',
    description: 'Complete the lab work'
});
console.log('Task added:', result);
```

## Data Structures

### User Object

```javascript
{
    id: 'user_123',
    nickname: 'Alex',
    name: 'Alexandra Smith',
    email: 'alex@example.com',
    classes: [...],
    tasks: [...],
    appointments: [...],
    createdAt: 1234567890,
    lastLogin: 1234567890
}
```

### Class Object

```javascript
{
    id: 'class_123',
    name: 'Introduction to Computer Science',
    code: 'CS101',
    color: '#824531',
    instructor: 'Dr. Smith',
    schedule: {
        days: ['Monday', 'Wednesday', 'Friday'],
        startTime: '09:00',
        endTime: '10:30'
    },
    createdAt: '2026-01-15T10:30:00.000Z'
}
```

### Task Object

```javascript
{
    id: 'task_123',
    name: 'Assignment 3',
    classId: 'class_123',
    dueDate: '2026-06-15',
    description: 'Complete all exercises',
    completed: false,
    createdAt: '2026-01-20T14:20:00.000Z',
    completedAt: null
}
```

### Deadline Object

```javascript
{
    taskId: 'task_123',
    title: 'Assignment 3',
    date: '2026-06-15',
    className: 'Introduction to Computer Science',
    classColor: '#824531',
    description: 'Complete all exercises'
}
```

### Stats Object

```javascript
{
    totalClasses: 5,
    totalTasks: 12,
    completedTasks: 8,
    pendingTasks: 4,
    progressPercentage: 67
}
```

## Chatbot Usage

### From the Chatbot's Perspective

The Copilot Studio bot can access user data through Power Fx formulas or plugin actions:

```powerfx
// Example in Copilot Studio (pseudo-code)
var userData = JSON.parse(sessionStorage.getItem('userData'));
var tasks = userData.tasks;
var completedCount = tasks.filter(t => t.completed).length;

Output:
  "You have completed " & completedCount & " tasks out of " & tasks.length
```

### Common Use Cases

1. **Get user's classes**
   ```javascript
   window.erikaBridge.getClasses()
   ```

2. **Check upcoming deadlines**
   ```javascript
   window.erikaBridge.getUpcomingDeadlines()
   ```

3. **Add a task from chatbot suggestion**
   ```javascript
   window.erikaBridge.addTask({
       name: 'Review notes',
       classId: userSelectedClassId,
       dueDate: suggestedDate
   })
   ```

4. **Mark task as complete**
   ```javascript
   window.erikaBridge.completeTask(taskId)
   ```

5. **Search for specific tasks**
   ```javascript
   const results = window.erikaBridge.searchTasks('assignment')
   ```

## API Endpoint

For direct API communication with the chatbot backend:

```
GET/POST https://default56090e6225404107916fcd9690f423.d3.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/cr293_erikaSemesterPlanner/conversations?api-version=2022-03-01-preview
```

## Security Considerations

1. **Data Storage**: User data is stored in browser's `localStorage`
2. **CORS**: Cross-origin requests are handled through iframe messaging
3. **Authentication**: Uses existing session authentication from sign-in
4. **Data Scope**: Bridge only exposes data for the currently logged-in user

## Browser Console Testing

Open browser console (F12) and test:

```javascript
// Check if bridge is loaded
console.log(window.copilotBridge);
console.log(window.erikaBridge);

// Test functions
console.log('User data:', window.erikaBridge.getUserData());
console.log('Classes:', window.erikaBridge.getClasses());
console.log('Tasks:', window.erikaBridge.getTasks());
console.log('Stats:', window.erikaBridge.getUserStats());
```

## Troubleshooting

### Bridge not loading
- Verify `chatbot/copilot-bridge.js` file exists
- Check script tag in HTML: `<script src="chatbot/copilot-bridge.js"></script>`
- Check browser console for errors

### No data returned
- Ensure user is logged in: `localStorage.getItem('currentUser')`
- Verify user data exists: `localStorage.getItem('allUsers')`
- Check that current user matches data

### Chatbot iframe not loading
- Check internet connection
- Verify iframe URL is correct
- Check browser console for CORS errors
- Ensure iframe has required permissions: `allow="geolocation; microphone; camera"`

## Future Enhancements

1. **Real-time sync** - Automatic data sync when tasks/classes change
2. **Notification system** - Alert user when chatbot creates tasks
3. **Advanced NLP** - Better understanding of natural language requests
4. **Calendar integration** - Chatbot can view/create calendar events
5. **Analytics** - Track chatbot interaction effectiveness

## Support

For issues or questions:
1. Check this documentation
2. Review browser console for errors
3. Test functions in browser console
4. Check `copilot-bridge.js` for available methods
