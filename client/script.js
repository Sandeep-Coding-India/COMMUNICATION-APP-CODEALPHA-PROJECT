// Check if user is logged in
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
        // User is logged in
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('dashboardSection').style.display = 'block';
        const userData = JSON.parse(user);
        document.getElementById('userName').textContent = userData.name;
    } else {
        // User is not logged in
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('dashboardSection').style.display = 'none';
    }
}
// Create a new room
function createRoom() {
    const roomId = generateRoomId();
    // Show loading
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Creating Room...';
    // Small delay for better UX
    setTimeout(() => {
        window.location.href = `/room/${roomId}`;
    }, 500);
}
// Join an existing room
function joinRoom() {
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (!roomId) {
        showToast('Please enter a room ID', 'error');
        return;
    }
    // Show loading
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Joining...';
    setTimeout(() => {
        window.location.href = `/room/${roomId}`;
    }, 500);
}
// Generate random room ID
function generateRoomId() {
    const prefix = 'ROOM';
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    return `${prefix}-${random}-${timestamp}`;
}
// Show toast notification
function showToast(message, type = 'info') {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        showToast('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}
// Handle Enter key in room ID input
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    const roomInput = document.getElementById('roomIdInput');
    if (roomInput) {
        roomInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinRoom();
            }
        });
    }
});
