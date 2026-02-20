// Global variables
let socket;
let localStream;
let screenStream;
let peers = {};
let roomId;
let userName;
let isVideoEnabled = true;
let isAudioEnabled = true;
let isScreenSharing = false;
// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};
// Initialize room
async function initializeRoom() {
    try {
        // Get room ID from URL
        roomId = window.location.pathname.split('/').pop();
        if (!roomId || roomId === 'room') {
            showToast('Invalid Room ID! Redirecting...', 'error');
            setTimeout(() => window.location.href = '/', 2000);
            return;
        }
        document.getElementById('roomIdDisplay').textContent = roomId;
        // Get user info
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (!user.name) {
            // If no user logged in, create guest user
            userName = 'Guest-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            showToast(`Joining as ${userName}`, 'info');
        } else {
            userName = user.name;
        }
        // Show welcome toast
        showToast(`Welcome ${userName}! Joining room...`, 'success');
        // Initialize Socket.io
        initializeSocket();
        // Initialize media
        await initializeMedia();
        // Join room after socket connection
        setTimeout(() => {
            if (socket && socket.connected) {
                socket.emit('join-room', { roomId, userName });
                showToast('Connected to room!', 'success');
            } else {
                showToast('Connecting to server...', 'info');
                setTimeout(() => {
                    if (socket) {
                        socket.emit('join-room', { roomId, userName });
                    }
                }, 1000);
            }
        }, 500);
        // Initialize whiteboard
        setTimeout(() => initializeWhiteboard(), 1000);
        // Add participants counter
        updateParticipantCount();
    } catch (error) {
        console.error('Room initialization error:', error);
        showToast('Error initializing room: ' + error.message, 'error');
    }
}
// Initialize Socket.io
function initializeSocket() {
    try {
        socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });
        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);
            showToast('Connected to server!', 'success');
        });
        socket.on('disconnect', () => {
            console.log('Socket disconnected');
            showToast('Disconnected from server', 'warning');
        });
        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            showToast('Connection error. Retrying...', 'error');
        });
        // Setup socket listeners
        setupSocketListeners();
    } catch (error) {
        console.error('Socket initialization error:', error);
        showToast('Failed to connect to server', 'error');
    }
}
// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing room...');
    initializeRoom();
});
// Show toast notification
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
// Initialize media (camera and microphone)
async function initializeMedia() {
    try {
        console.log('Requesting media access...');
        showToast('Requesting camera and microphone access...', 'info');
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            console.log('Local video stream set');
        }
        showToast('Camera and microphone connected!', 'success');
    } catch (error) {
        console.error('Error accessing media devices:', error);
        showToast('Cannot access camera/microphone. Please allow permissions.', 'error');
        // Try audio only
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            showToast('Audio only mode (camera not available)', 'warning');
        } catch (audioError) {
            console.error('Audio also failed:', audioError);
            showToast('No media devices available. Joining audio/video disabled.', 'error');
        }
    }
}
// Setup socket event listeners
function setupSocketListeners() {
    if (!socket) return;
    // When existing users are sent
    socket.on('existing-users', (users) => {
        console.log('Existing users:', users);
        users.forEach(user => {
            addUserToList(user.userName, user.userId);
            createPeerConnection(user.userId);
        });
        updateParticipantCount();
    });
    // When a new user connects
    socket.on('user-connected', ({ userId, userName: newUserName }) => {
        console.log('User connected:', newUserName);
        addUserToList(newUserName, userId);
        addSystemMessage(`${newUserName} joined the room`);
        showToast(`${newUserName} joined`, 'info');
        createPeerConnection(userId);
        updateParticipantCount();
    });
    // When receiving an offer
    socket.on('offer', async ({ offer, from }) => {
        console.log('Received offer from:', from);
        const pc = getPeerConnection(from);
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { answer, to: from });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    });
    // When receiving an answer
    socket.on('answer', async ({ answer, from }) => {
        console.log('Received answer from:', from);
        const pc = peers[from];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
    });
    // When receiving ICE candidate
    socket.on('ice-candidate', async ({ candidate, from }) => {
        const pc = peers[from];
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    });
    // When a user disconnects
    socket.on('user-disconnected', ({ userId, userName: disconnectedUser }) => {
        console.log('User disconnected:', disconnectedUser);
        removeUserFromList(userId);
        addSystemMessage(`${disconnectedUser} left the room`);
        showToast(`${disconnectedUser} left`, 'warning');
        // Close peer connection
        if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
        }
        // Remove video element
        const videoElement = document.getElementById(`video-${userId}`);
        if (videoElement) {
            videoElement.parentElement.remove();
        }
        updateParticipantCount();
    });
    // Chat messages
    socket.on('chat-message', ({ message, userName, timestamp }) => {
        addChatMessage(userName, message, timestamp);
    });
    // Whiteboard drawing
    socket.on('drawing', (drawData) => {
        drawOnCanvas(drawData, false);
    });
    // Clear whiteboard
    socket.on('clear-canvas', () => {
        clearCanvas();
    });
    // File shared
    socket.on('file-shared', ({ fileName, fileUrl, sharedBy }) => {
        addFileToList(fileName, fileUrl, sharedBy);
        showToast(`${sharedBy} shared a file: ${fileName}`, 'info');
    });
}
// Create peer connection
function createPeerConnection(userId) {
    if (!localStream) {
        console.warn('No local stream available for peer connection');
        return null;
    }
    const pc = new RTCPeerConnection(configuration);
    peers[userId] = pc;
    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: userId
            });
        }
    };
    // Handle incoming tracks
    pc.ontrack = (event) => {
        console.log('Received remote track');
        const remoteStream = event.streams[0];
        addRemoteVideo(userId, remoteStream);
    };
    // Connection state monitoring
    pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState, 'for user:', userId);
        if (pc.connectionState === 'connected') {
            showToast('Peer connected successfully', 'success');
        } else if (pc.connectionState === 'failed') {
            showToast('Peer connection failed', 'error');
        }
    };
    // Create and send offer
    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            if (socket) {
                socket.emit('offer', {
                    offer: pc.localDescription,
                    to: userId
                });
            }
        })
        .catch(error => console.error('Error creating offer:', error));
    return pc;
}
// Get or create peer connection
function getPeerConnection(userId) {
    if (!peers[userId]) {
        return createPeerConnection(userId);
    }
    return peers[userId];
}
// Add remote video to grid
function addRemoteVideo(userId, stream) {
    let videoElement = document.getElementById(`video-${userId}`);
    if (!videoElement) {
        const videoGrid = document.getElementById('videoGrid');
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `container-${userId}`;
        videoElement = document.createElement('video');
        videoElement.id = `video-${userId}`;
        videoElement.autoplay = true;
        videoElement.playsinline = true;
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = 'Participant';
        videoContainer.appendChild(videoElement);
        videoContainer.appendChild(label);
        videoGrid.appendChild(videoContainer);
    }
    videoElement.srcObject = stream;
}
// Toggle video
function toggleVideo() {
    if (!localStream) {
        showToast('No video stream available', 'error');
        return;
    }
    isVideoEnabled = !isVideoEnabled;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = isVideoEnabled;
    }
    const videoBtn = document.getElementById('toggleVideo');
    const videoIcon = document.getElementById('videoIcon');
    if (isVideoEnabled) {
        videoIcon.textContent = '📹';
        videoBtn.style.background = '#667eea';
        showToast('Camera turned ON', 'success');
    } else {
        videoIcon.textContent = '🚫';
        videoBtn.style.background = '#e74c3c';
        showToast('Camera turned OFF', 'warning');
    }
}
// Toggle audio
function toggleAudio() {
    if (!localStream) {
        showToast('No audio stream available', 'error');
        return;
    }
    isAudioEnabled = !isAudioEnabled;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = isAudioEnabled;
    }
    const audioBtn = document.getElementById('toggleAudio');
    const audioIcon = document.getElementById('audioIcon');
    if (isAudioEnabled) {
        audioIcon.textContent = '🎤';
        audioBtn.style.background = '#667eea';
        showToast('Microphone turned ON', 'success');
    } else {
        audioIcon.textContent = '🔇';
        audioBtn.style.background = '#e74c3c';
        showToast('Microphone MUTED', 'warning');
    }
}
// Toggle screen sharing
async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });
            const screenTrack = screenStream.getVideoTracks()[0];
            // Replace video track in all peer connections
            Object.values(peers).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenTrack);
                }
            });
            // Update local video
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = screenStream;
            isScreenSharing = true;
            showToast('Screen sharing started', 'success');
            if (socket) {
                socket.emit('screen-share-started', { roomId });
            }
            // Listen for screen share stop
            screenTrack.onended = () => {
                stopScreenShare();
            };
        } catch (error) {
            console.error('Error sharing screen:', error);
            showToast('Screen sharing cancelled or failed', 'error');
        }
    } else {
        stopScreenShare();
    }
}
// Stop screen sharing
function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    // Restore camera
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        Object.values(peers).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
            }
        });
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;
    }
    isScreenSharing = false;
    showToast('Screen sharing stopped', 'info');
    if (socket) {
        socket.emit('screen-share-stopped', { roomId });
    }
}
// Leave room
function leaveRoom() {
    if (confirm('Are you sure you want to leave this room?')) {
        // Stop all tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
        }
        // Close all peer connections
        Object.values(peers).forEach(pc => pc.close());
        // Disconnect socket
        if (socket) {
            socket.disconnect();
        }
        showToast('Leaving room...', 'info');
        // Redirect to home
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    }
}
// Copy room ID with advanced functionality
function copyRoomId() {
    const roomIdText = document.getElementById('roomIdDisplay').textContent;
    const fullLink = `${window.location.origin}/room/${roomIdText}`;
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullLink).then(() => {
            showToast('Room link copied to clipboard!', 'success');
            // Visual feedback on button
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            btn.style.background = '#27ae60';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        }).catch(err => {
            fallbackCopyTextToClipboard(fullLink);
        });
    } else {
        fallbackCopyTextToClipboard(fullLink);
    }
}
// Fallback copy method
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast('Room link copied to clipboard!', 'success');
    } catch (err) {
        showToast('Please copy manually: ' + text, 'error');
    }
    document.body.removeChild(textArea);
}
// Share room link
function shareRoomLink() {
    const roomIdText = document.getElementById('roomIdDisplay').textContent;
    const fullLink = `${window.location.origin}/room/${roomIdText}`;
    if (navigator.share) {
        navigator.share({
            title: 'Join my video call',
            text: `Join my video meeting on Video Chat App!`,
            url: fullLink
        }).then(() => {
            showToast('Room link shared!', 'success');
        }).catch(err => {
            console.log('Share cancelled or failed');
            copyRoomId();
        });
    } else {
        copyRoomId();
    }
}
// Switch tabs
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
    event.target.classList.add('active');
}
// Update participant count
function updateParticipantCount() {
    const count = Object.keys(peers).length + 1; // +1 for self
    const usersList = document.getElementById('usersList');
    const counterDiv = document.getElementById('participantCounter');
    if (!counterDiv) {
        const counter = document.createElement('div');
        counter.id = 'participantCounter';
        counter.className = 'participant-counter';
        counter.innerHTML = `<strong>👥 ${count} Participant${count > 1 ? 's' : ''}</strong>`;
        usersList.insertBefore(counter, usersList.firstChild);
    } else {
        counterDiv.innerHTML = `<strong>👥 ${count} Participant${count > 1 ? 's' : ''}</strong>`;
    }
}
// Chat functions
function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (message && socket) {
        socket.emit('chat-message', { roomId, message, userName });
        input.value = '';
        input.focus();
    }
}
function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}
function addChatMessage(user, message, timestamp) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    const isOwnMessage = user === userName;
    if (isOwnMessage) {
        messageDiv.style.background = '#1a4d80';
    }
    messageDiv.innerHTML = `
        <div class="message-user">${escapeHtml(user)}${isOwnMessage ? ' (You)' : ''}<span class="message-time">${timestamp}</span></div>
        <div>${escapeHtml(message)}</div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function addSystemMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = `🔔 ${message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
// Helper function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
// User list functions
function addUserToList(user, userId) {
    const usersList = document.getElementById('usersList');
    const existingUser = document.getElementById(`user-${userId}`);
    if (!existingUser) {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.id = `user-${userId}`;
        userItem.innerHTML = `
            <span>👤 ${escapeHtml(user)}</span>
            <span class="user-status online">●</span>
        `;
        usersList.appendChild(userItem);
    }
}
function removeUserFromList(userId) {
    const userItem = document.getElementById(`user-${userId}`);
    if (userItem) {
        userItem.remove();
    }
}
// Whiteboard functions
let canvas, ctx;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
function initializeWhiteboard() {
    canvas = document.getElementById('whiteboard');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    // Touch events for mobile
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', stopDrawing);
}
function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
}
function draw(e) {
    if (!isDrawing) return;
    const color = document.getElementById('colorPicker').value;
    const size = document.getElementById('brushSize').value;
    const drawData = {
        lastX,
        lastY,
        currentX: e.offsetX,
        currentY: e.offsetY,
        color,
        size
    };
    drawOnCanvas(drawData, true);
    if (socket) {
        socket.emit('drawing', { roomId, drawData });
    }
    [lastX, lastY] = [e.offsetX, e.offsetY];
}
function stopDrawing() {
    isDrawing = false;
}
function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    isDrawing = true;
    lastX = touch.clientX - rect.left;
    lastY = touch.clientY - rect.top;
}
function handleTouchMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const currentX = touch.clientX - rect.left;
    const currentY = touch.clientY - rect.top;
    const color = document.getElementById('colorPicker').value;
    const size = document.getElementById('brushSize').value;
    const drawData = { lastX, lastY, currentX, currentY, color, size };
    drawOnCanvas(drawData, true);
    if (socket) {
        socket.emit('drawing', { roomId, drawData });
    }
    lastX = currentX;
    lastY = currentY;
}
function drawOnCanvas(data, isLocal) {
    if (!ctx) return;
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.beginPath();
    ctx.moveTo(data.lastX, data.lastY);
    ctx.lineTo(data.currentX, data.currentY);
    ctx.stroke();
}
function clearWhiteboard() {
    clearCanvas();
    if (socket) {
        socket.emit('clear-canvas', { roomId });
    }
    showToast('Whiteboard cleared', 'info');
}
function clearCanvas() {
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}
// File sharing functions
async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return;
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('File too large! Maximum size is 10MB', 'error');
        return;
    }
    showToast('Uploading file...', 'info');
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (response.ok) {
            if (socket) {
                socket.emit('share-file', {
                    roomId,
                    fileName: file.name,
                    fileUrl: data.path
                });
            }
            addFileToList(file.name, data.path, 'You');
            showToast('File uploaded successfully!', 'success');
        } else {
            showToast('File upload failed', 'error');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showToast('Error uploading file', 'error');
    }
    fileInput.value = '';
}
function addFileToList(fileName, fileUrl, sharedBy) {
    const filesList = document.getElementById('filesList');
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    // Get file extension
    const ext = fileName.split('.').pop().toLowerCase();
    const icon = getFileIcon(ext);
    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-icon">${icon}</div>
            <div>
                <div style="font-weight: bold; color: #fff;">${escapeHtml(fileName)}</div>
                <div style="font-size: 0.85em; color: #888;">Shared by ${escapeHtml(sharedBy)}</div>
            </div>
        </div>
        <a href="${fileUrl}" download="${fileName}" class="btn btn-small" onclick="showToast('Downloading...', 'info')">
            ⬇️ Download
        </a>
    `;
    filesList.appendChild(fileItem);
}
function getFileIcon(ext) {
    const icons = {
        'pdf': '📄',
        'doc': '📝', 'docx': '📝',
        'xls': '📊', 'xlsx': '📊',
        'ppt': '📽️', 'pptx': '📽️',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'mp4': '🎬', 'avi': '🎬', 'mov': '🎬',
        'mp3': '🎵', 'wav': '🎵',
        'zip': '📦', 'rar': '📦',
        'txt': '📃'
    };
    return icons[ext] || '📎';
}
