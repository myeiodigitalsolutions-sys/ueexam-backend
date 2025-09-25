const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const router = express.Router();
const examController = require('../controllers/exam.controller');
// In your exam routes file - FIXED WebSocket setup
// In exam.routes.js - FIXED WebSocket Server
const setupWebSocketServer = (server) => {
  console.log('🚀 Setting up WebSocket server for video streaming and monitoring...');
  
  const wss = new WebSocket.Server({ 
    noServer: true,
    perMessageDeflate: false 
  });

  // FIXED: Separate data structures
  const activeStreams = new Map(); // examId -> Map of uid -> stream data
  const adminConnections = new Set(); // All admin monitoring connections

  // Handle WebSocket upgrades
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, req) => {
    const url = req.url;
    console.log(`🌐 New WebSocket connection: ${url}`);

    if (url.startsWith('/video-stream/')) {
      // STUDENT VIDEO STREAM - sends video data
      const urlMatch = url.match(/^\/video-stream\/([^\/]+)\/([^\/]+)$/);
      if (!urlMatch) {
        console.log('❌ Invalid video stream URL:', url);
        ws.close(1008, 'Invalid video stream URL');
        return;
      }

      const [, examId, uid] = urlMatch;
      console.log(`📹 Student video stream connection for exam ${examId}, uid ${uid}`);

      // Initialize stream data for this student
      if (!activeStreams.has(examId)) {
        activeStreams.set(examId, new Map());
      }
      const examStreams = activeStreams.get(examId);

      if (!examStreams.has(uid)) {
        examStreams.set(uid, {
          lastChunk: null,
          lastUpdate: Date.now(),
          connections: [], // Student connections (usually 1)
          isStreaming: false,
          heartbeatCount: 0
        });
      }

      const streamData = examStreams.get(uid);
      streamData.connections.push(ws);
      streamData.lastUpdate = Date.now();

      // Send connection confirmation to student
      ws.send(JSON.stringify({ 
        type: 'connected', 
        uid, 
        examId,
        timestamp: Date.now(),
        message: 'Video stream connected successfully'
      }));

      // FIXED: Handle student video data
     ws.on('message', (data) => {
  streamData.lastUpdate = Date.now();
  
  if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
    // VIDEO CHUNK - Store and broadcast to ALL admin connections
    streamData.lastChunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    streamData.isStreaming = true;
    
    console.log(`📦 Video chunk received for ${uid}: ${streamData.lastChunk.length} bytes`);
    
    // FIXED: Only broadcast to admin connections for THIS exam
    let broadcastCount = 0;
    adminConnections.forEach(adminWs => {
      // Only send to admins monitoring this specific exam
      if (adminWs.readyState === WebSocket.OPEN && adminWs.examId === examId) {
        try {
          const metadata = JSON.stringify({
            type: 'image_chunk',
            examId,
            uid,
            timestamp: Date.now(),
            chunkSize: streamData.lastChunk.length
          });
          
          // FIXED: Send metadata first, then binary
          adminWs.send(metadata);
          adminWs.send(streamData.lastChunk);
          
          broadcastCount++;
          if (broadcastCount <= 3) { // Only log first few to avoid spam
            console.log(`📹 Broadcasted to admin ${broadcastCount}: ${uid} (${streamData.lastChunk.length} bytes)`);
          }
        } catch (error) {
          console.error('❌ Error broadcasting to admin:', error);
          // Remove dead connections
          adminConnections.delete(adminWs);
        }
      }
    });
    
    console.log(`📡 Video chunk broadcasted to ${broadcastCount} admin connections`);
    
  } else {
          // JSON control messages from student
          try {
            const message = JSON.parse(data.toString());
            console.log(`📨 Student control message from ${uid}:`, message.type);
            
            if (message.type === 'heartbeat') {
              streamData.heartbeatCount++;
              // Respond to heartbeat
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                  type: 'pong', 
                  timestamp: Date.now(),
                  uid,
                  message: 'Heartbeat acknowledged',
                  chunkCount: message.chunkCount
                }));
              }
            } else if (message.type === 'ping') {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ 
                  type: 'pong', 
                  timestamp: Date.now(),
                  uid,
                  message: 'Client heartbeat response'
                }));
              }
            } else if (message.type === 'admin_command' && message.command === 'terminate_exam') {
              // Handle admin terminate command
              console.log(`🛑 Terminating exam for ${uid}`);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'admin_command',
                  command: 'terminate_exam',
                  timestamp: Date.now(),
                  fromAdmin: true
                }));
              }
            }
          } catch (error) {
            console.error(`❌ Invalid JSON from student ${uid}:`, error);
          }
        }
      });

      // Cleanup student connection
      ws.on('close', () => {
        console.log(`🔌 Student ${uid} disconnected`);
        const connectionIndex = streamData.connections.indexOf(ws);
        if (connectionIndex > -1) {
          streamData.connections.splice(connectionIndex, 1);
        }
        
        // Clean up if no connections remain
        if (streamData.connections.length === 0) {
          examStreams.delete(uid);
          if (examStreams.size === 0) {
            activeStreams.delete(examId);
          }
        }
      });

    } else if (url.startsWith('/admin-stream/')) {
      // ADMIN MONITORING - receives video from all students
      const urlMatch = url.match(/^\/admin-stream\/([^\/]+)$/);
      if (!urlMatch) {
        console.log('❌ Invalid admin stream URL:', url);
        ws.close(1008, 'Invalid admin stream URL');
        return;
      }

      const examId = urlMatch[1];
      console.log(`👨‍💼 Admin connected to monitor exam: ${examId}`);
      
      // Add to global admin connections
      adminConnections.add(ws);
      ws.examId = examId; // Track which exam this admin is monitoring
      ws.isAdmin = true;

      // Send initial stream status
      const sendInitialStatus = () => {
        const examStreams = activeStreams.get(examId) || new Map();
        const statusData = Array.from(examStreams.entries()).map(([uid, data]) => ({
          uid,
          isActive: data.isStreaming && Date.now() - (data.lastUpdate || 0) < 30000,
          lastUpdate: data.lastUpdate ? new Date(data.lastUpdate).toLocaleTimeString() : null,
          chunkCount: data.heartbeatCount || 0,
          hasVideo: !!data.lastChunk
        }));

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'initial_status',
            examId,
            timestamp: Date.now(),
            activeStudents: statusData.filter(s => s.isActive).length,
            totalStudents: statusData.length,
            streams: statusData
          }));
        }
      };

      sendInitialStatus();

      // Handle admin commands
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'admin_command') {
            const { targetUid, command } = data;
            console.log(`👨‍💼 Admin command: ${command} for ${targetUid}`);
            
            // Forward command to specific student
            const examStreams = activeStreams.get(examId);
            if (examStreams && examStreams.has(targetUid) ) {
              const streamData = examStreams.get(targetUid);
              if (streamData.connections.length > 0) {
                const studentWs = streamData.connections[0];
                if (studentWs && studentWs.readyState === WebSocket.OPEN) {
                  studentWs.send(JSON.stringify({
                    type: 'admin_command',
                    command,
                    timestamp: Date.now(),
                    fromAdmin: true
                  }));
                  
                  // Confirm to admin
                  ws.send(JSON.stringify({
                    type: 'command_response',
                    targetUid,
                    command,
                    success: true,
                    timestamp: Date.now()
                  }));
                }
              }
            }
          }
        } catch (error) {
          // If not JSON, it might be a heartbeat or other message
          console.debug('Non-JSON admin message received');
        }
      });

      // Periodic status updates
      const statusInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          sendInitialStatus();
        }
      }, 10000);

      // Cleanup admin connection
      ws.on('close', () => {
        console.log(`👨‍💼 Admin disconnected from exam ${examId}`);
        adminConnections.delete(ws);
        clearInterval(statusInterval);
      });

    } else {
      console.log('❌ Invalid WebSocket endpoint:', url);
      ws.close(1008, 'Invalid endpoint');
    }

    // Global error handling
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
  });

  wss.getActiveStreams = () => activeStreams;

  console.log('✅ WebSocket server setup complete');
  return wss;
};

// Export the setup function
router.setupWebSocketServer = setupWebSocketServer;

// Rest of your existing routes...
router.get('/', examController.getAllExams);
router.get('/:examId/questions', examController.getExamQuestions);
router.post('/', examController.createExam);
router.put('/:id', examController.updateExam);
router.delete('/:id', examController.deleteExam);
router.post('/upload-file', examController.uploadStudentFile);
router.get('/:examId/submissions/:uid', examController.getStudentSubmissions);
router.get('/:examId/students', examController.getStudentsByExamSubmissions);

// Exam report routes
router.post('/:examId/report/upload', examController.uploadExamReport);
router.get('/:examId/report/:uid', examController.getExamReport);
router.get('/:examId/reports', examController.getExamReports);
router.get('/:examId', examController.getExamById);
router.get('/:classId/staff', examController.getClassStaff);

// Live monitoring routes
router.get('/:examId/live-monitoring', examController.getLiveMonitoringData);
router.get('/:examId/video-chunk/:uid', examController.getVideoChunk);

module.exports = router;