const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
require('dotenv').config();
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
// Connect to MongoDB
connectDB();
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });
// Routes
app.use('/api', authRoutes);
// File upload route
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    res.json({
        message: 'File uploaded successfully',
        filename: req.file.filename,
        path: `/uploads/${req.file.filename}`
    });
});
// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/login.html'));
});
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/register.html'));
});
app.get('/room/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/room.html'));
});
// Store active rooms and users
const rooms = new Map();
const users = new Map();
// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    // Join room
    socket.on('join-room', ({ roomId, userName }) => {
        socket.join(roomId);
        // Store user info
        users.set(socket.id, { userName, roomId });
        // Initialize room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);
        // Notify others in the room
        socket.to(roomId).emit('user-connected', {
            userId: socket.id,
            userName: userName
        });
        // Send list of existing users to the new user
        const roomUsers = Array.from(rooms.get(roomId))
            .filter(id => id !== socket.id)
            .map(id => ({
                userId: id,
                userName: users.get(id)?.userName || 'Unknown'
            }));
        socket.emit('existing-users', roomUsers);
        console.log(`User ${userName} (${socket.id}) joined room ${roomId}`);
    });
    // WebRTC signaling - offer
    socket.on('offer', ({ offer, to }) => {
        socket.to(to).emit('offer', {
            offer,
            from: socket.id
        });
    });
    // WebRTC signaling - answer
    socket.on('answer', ({ answer, to }) => {
        socket.to(to).emit('answer', {
            answer,
            from: socket.id
        });
    });
    // WebRTC signaling - ICE candidate
    socket.on('ice-candidate', ({ candidate, to }) => {
        socket.to(to).emit('ice-candidate', {
            candidate,
            from: socket.id
        });
    });
    // Chat message
    socket.on('chat-message', ({ roomId, message, userName }) => {
        io.to(roomId).emit('chat-message', {
            message,
            userName,
            timestamp: new Date().toLocaleTimeString()
        });
    });
    // Whiteboard drawing
    socket.on('drawing', ({ roomId, drawData }) => {
        socket.to(roomId).emit('drawing', drawData);
    });
    // Clear whiteboard
    socket.on('clear-canvas', ({ roomId }) => {
        socket.to(roomId).emit('clear-canvas');
    });
    // File sharing
    socket.on('share-file', ({ roomId, fileName, fileUrl }) => {
        io.to(roomId).emit('file-shared', {
            fileName,
            fileUrl,
            sharedBy: users.get(socket.id)?.userName || 'Unknown'
        });
    });
    // Screen sharing notification
    socket.on('screen-share-started', ({ roomId }) => {
        socket.to(roomId).emit('user-screen-sharing', {
            userId: socket.id,
            userName: users.get(socket.id)?.userName
        });
    });
    socket.on('screen-share-stopped', ({ roomId }) => {
        socket.to(roomId).emit('user-stopped-screen-sharing', {
            userId: socket.id
        });
    });
    // Disconnect
    socket.on('disconnect', () => {
        const userInfo = users.get(socket.id);
        if (userInfo) {
            const { roomId, userName } = userInfo;
            // Remove user from room
            if (rooms.has(roomId)) {
                rooms.get(roomId).delete(socket.id);
                // Delete room if empty
                if (rooms.get(roomId).size === 0) {
                    rooms.delete(roomId);
                }
            }
            // Notify others in the room
            socket.to(roomId).emit('user-disconnected', {
                userId: socket.id,
                userName: userName
            });
            console.log(`User ${userName} (${socket.id}) disconnected from room ${roomId}`);
        }
        users.delete(socket.id);
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
