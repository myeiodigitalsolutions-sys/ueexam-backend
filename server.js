require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('./firebaseAdmin');
const http = require('http');
const WebSocket = require('ws');

// Import Routes
const studentRoutes = require('./routes/student.routes');
const staffRoutes = require('./routes/staff.routes');
const classRoutes = require('./routes/class.routes');
const examRoutes = require('./routes/exam.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server AFTER app is defined
const server = http.createServer(app);

// FIXED: Global WebSocket server reference
global.videoStreamServer = null;

// Increase server timeout for large file uploads (30 seconds)
app.set('timeout', 30000);

// Enable CORS with explicit support for multipart/form-data
app.use(
  cors({
    origin: [
      "http://localhost:3000",       // local dev
      "https://ueexam.vercel.app" // deployed frontend
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(cors({
  origin: (origin, callback) => {
    console.log('Request Origin:', origin);
    const allowedOrigins = [
      'http://localhost:3000',
      'https://vattaram-8cn5.vercel.app',
     
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Middleware for parsing JSON and URL-encoded data
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully');
    console.log('Loading Mongoose models...');
    
    // Load models
    require('./models/student.model');
    console.log('✅ Student model loaded');
    require('./models/staff.model');
    console.log('✅ Staff model loaded');
    require('./models/class.model');
    console.log('✅ Class model loaded');
    require('./models/exam.model');
    console.log('✅ Exam model loaded');
    require('./models/submission.model');
    console.log('✅ Submission model loaded');
    require('./models/examReport.model');
    console.log('✅ ExamReport model loaded');

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });
    
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed due to app termination');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

connectDB();

// FIXED: Initialize WebSocket server AFTER database connection and BEFORE routes
let wss = null;
const initializeWebSocketServer = () => {
  console.log('🚀 Initializing WebSocket server for video streaming...');
  
  try {
    wss = examRoutes.setupWebSocketServer(server);
    
    // FIXED: Properly expose the WebSocket server methods globally
    global.videoStreamServer = {
      getActiveStreams: () => {
        if (wss && typeof wss.getActiveStreams === 'function') {
          try {
            return wss.getActiveStreams() || new Map();
          } catch (error) {
            console.error('Error accessing WebSocket streams:', error);
            return new Map();
          }
        }
        return new Map();
      },
      getWss: () => wss,
      isReady: () => wss !== null
    };
    
    console.log('✅ WebSocket server initialized successfully');
    console.log('📡 Global videoStreamServer available');
    
  } catch (error) {
    console.error('❌ Failed to initialize WebSocket server:', error);
    global.videoStreamServer = {
      getActiveStreams: () => new Map(),
      getWss: () => null,
      isReady: () => false
    };
  }
};

// Use routes
app.use('/api/students', studentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/exams', examRoutes);

// Route for getting user role
app.post('/api/auth/get-role', async (req, res) => {
  const { uid } = req.body;
  try {
    console.log('Fetching role for UID:', uid);
    const Student = require('./models/student.model');
    let user = await Student.findOne({ uid });
    if (user) {
      console.log('Found student:', user.name);
      return res.json({ role: 'student' });
    }

    const Staff = require('./models/staff.model');
    user = await Staff.findOne({ uid });
    if (user) {
      console.log('Found staff:', user.name);
      return res.json({ role: 'staff' });
    }

    console.log('User not found for UID:', uid);
    res.status(404).json({ error: 'User not found' });
  } catch (error) {
    console.error('Error fetching role:', error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

// Initialize admin user
async function initializeAdminUser() {
  const email = 'admin@gmail.com';
  const password = 'admin123';
  try {
    const existingUser = await admin.auth().getUserByEmail(email).catch(err => null);
    if (existingUser) {
      console.log(`Admin user ${email} already exists with UID: ${existingUser.uid}`);
      return;
    }
    const userRecord = await admin.auth().createUser({ email, password });
    console.log('Admin user created with UID:', userRecord.uid);
  } catch (error) {
    console.error('Error initializing admin user:', error.message);
  }
}

initializeAdminUser();

// Health check route
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const wsStatus = global.videoStreamServer?.isReady() ? 'ready' : 'not-ready';
  
  res.status(200).json({ 
    status: 'OK', 
    database: dbStatus,
    websocket: wsStatus,
    activeStreams: global.videoStreamServer?.getActiveStreams().size || 0,
    timestamp: new Date().toISOString()
  });
});

// WebSocket status endpoint
app.get('/api/websocket/status', (req, res) => {
  try {
    const activeStreams = global.videoStreamServer?.getActiveStreams() || new Map();
    const streamData = Array.from(activeStreams.entries()).map(([examId, students]) => ({
      examId,
      studentCount: students.size,
      students: Array.from(students.keys())
    }));
    
    res.json({
      status: 'active',
      totalExams: activeStreams.size,
      totalStudents: Array.from(activeStreams.values()).reduce((sum, students) => sum + students.size, 0),
      streams: streamData
    });
  } catch (error) {
    console.error('Error getting WebSocket status:', error);
    res.status(500).json({ error: 'Failed to get WebSocket status' });
  }
});

// Default route
app.get('/', (req, res) => {
  res.send(`
    <h1>Online Exam Monitoring API</h1>
    <p><strong>Status:</strong> Running</p>
    <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
    <p><strong>Port:</strong> ${PORT}</p>
    <p><strong>Database:</strong> ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}</p>
    <p><strong>WebSocket:</strong> ${global.videoStreamServer?.isReady() ? 'Ready' : 'Not Ready'}</p>
    <p><a href="/health">Health Check</a> | <a href="/api/websocket/status">WebSocket Status</a></p>
  `);
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  if (err.message.includes('Unexpected end of form')) {
    res.status(400).json({ message: 'Invalid form data: Incomplete or malformed multipart form' });
  } else {
    res.status(500).json({ message: 'Internal server error', details: err.message });
  }
});

// FIXED: Start server and initialize WebSocket AFTER MongoDB connection
mongoose.connection.once('open', () => {
  console.log('🎉 Database ready - Starting server...');
  
  // FIXED: Initialize WebSocket server after database is ready
  initializeWebSocketServer();
  
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('📚 Models available:', Object.keys(mongoose.models).join(', '));
    console.log('👥 Total models loaded:', Object.keys(mongoose.models).length);
    console.log('📡 WebSocket server ready for video streaming');
    console.log('🔍 Health endpoint: http://localhost:5000/health');
    console.log('📊 WebSocket status: http://localhost:5000/api/websocket/status');
  });
});

// Handle MongoDB errors
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
  if (process.env.NODE_ENV === 'production') {
    console.log('Exiting process due to MongoDB connection failure');
    process.exit(1);
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  
  if (wss) {
    wss.close(() => {
      console.log('WebSocket server closed');
    });
  }
  
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received, shutting down gracefully...');
  
  if (wss) {
    wss.close(() => {
      console.log('WebSocket server closed');
    });
  }
  
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});