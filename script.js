document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const welcomeScreen = document.getElementById('welcome-screen');
    const chatContainer = document.getElementById('chat-container');
    const createBtn = document.getElementById('create-btn');
    const joinBtn = document.getElementById('join-btn');
    const viewPublicBtn = document.getElementById('view-public-btn');
    const createForm = document.getElementById('create-form');
    const joinForm = document.getElementById('join-form');
    const publicRoomsDiv = document.getElementById('public-rooms');
    const roomsListDiv = document.getElementById('rooms-list');
    const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
    const backBtn = document.getElementById('back-btn');
    const roomNameInput = document.getElementById('room-name-input');
    const roomIdInput = document.getElementById('room-id-input');
    const createRoomBtn = document.getElementById('create-room-btn');
    const connectBtn = document.getElementById('connect-btn');
    const roomIdDisplay = document.getElementById('room-id-display');
    const roomNameDisplay = document.getElementById('room-name-display');
    const statusElement = document.getElementById('status');
    const peersListElement = document.getElementById('peers-list');
    const messages = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const leaveBtn = document.getElementById('leave-btn');

    // PeerJS variables
    let peer;
    let connections = {};
    let roomId;
    let roomName;
    let isHost = false;
    let isPublic = true;
    let myId;
    let peersList = [];
    let username = 'User_' + Math.floor(Math.random() * 1000);

    // Public rooms registry
    // In a real application, this would be on a server
    // For this example, we'll use localStorage
    function registerPublicRoom(roomId, roomName) {
        let publicRooms = JSON.parse(localStorage.getItem('publicRooms') || '{}');
        publicRooms[roomId] = {
            name: roomName,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('publicRooms', JSON.stringify(publicRooms));
    }

    function unregisterPublicRoom(roomId) {
        let publicRooms = JSON.parse(localStorage.getItem('publicRooms') || '{}');
        if (publicRooms[roomId]) {
            delete publicRooms[roomId];
            localStorage.setItem('publicRooms', JSON.stringify(publicRooms));
        }
    }

    function getPublicRooms() {
        return JSON.parse(localStorage.getItem('publicRooms') || '{}');
    }

    function loadPublicRooms() {
        const rooms = getPublicRooms();
        roomsListDiv.innerHTML = '';
        
        if (Object.keys(rooms).length === 0) {
            roomsListDiv.innerHTML = '<p>No public rooms available.</p>';
            return;
        }
        
        for (const [roomId, roomInfo] of Object.entries(rooms)) {
            const roomElement = document.createElement('div');
            roomElement.innerHTML = `
                <span>${roomInfo.name || 'Unnamed Room'}</span>
                <button class="join-room-btn" data-roomid="${roomId}">Join</button>
            `;
            roomsListDiv.appendChild(roomElement);
        }
        
        // Add event listeners to join buttons
        document.querySelectorAll('.join-room-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const roomId = btn.getAttribute('data-roomid');
                const roomInfo = rooms[roomId];
                joinRoom(roomId, roomInfo.name);
            });
        });
    }

    // Initialize PeerJS
    function initPeer() {
        peer = new Peer(null, {
            debug: 2
        });

        peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
            myId = id;
            updatePeersList();
        });

        peer.on('connection', (conn) => {
            handleNewConnection(conn);
        });

        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            statusElement.textContent = 'Error: ' + err.type;
        });
    }

    // Create a new room
    function createRoom() {
        initPeer();
        isHost = true;
        roomName = roomNameInput.value.trim() || 'Unnamed Room';
        isPublic = document.querySelector('input[name="room-type"]:checked').value === 'public';
        
        peer.on('open', (id) => {
            roomId = id;
            roomIdDisplay.textContent = 'Room ID: ' + roomId;
            roomNameDisplay.textContent = roomName;
            welcomeScreen.style.display = 'none';
            chatContainer.style.display = 'block';
            statusElement.textContent = 'Waiting for others to join...';
            displaySystemMessage('You created the room. Share the Room ID with others to join.');
            
            // Register public room
            if (isPublic) {
                registerPublicRoom(roomId, roomName);
                displaySystemMessage('This room is public and visible in the public rooms list.');
            } else {
                displaySystemMessage('This room is private. Share the Room ID to invite others.');
            }
        });
    }

    // Join an existing room
    function joinRoom(id, name) {
        roomId = id;
        roomName = name || 'Unknown Room';
        
        initPeer();
        
        peer.on('open', () => {
            // Connect to the room host
            const hostConn = peer.connect(roomId);
            connections[roomId] = hostConn;
            
            hostConn.on('open', () => {
                console.log('Connected to host:', roomId);
                addPeer(roomId);
                welcomeScreen.style.display = 'none';
                chatContainer.style.display = 'block';
                roomIdDisplay.textContent = 'Room ID: ' + roomId;
                roomNameDisplay.textContent = roomName;
                statusElement.textContent = 'Connected!';
                displaySystemMessage('You joined the room.');
                
                // Request room information
                hostConn.send({
                    type: 'room-info-request'
                });
            });
            
            hostConn.on('data', (data) => {
                console.log('Received from host:', data);
                handleIncomingData(data, roomId);
            });
            
            hostConn.on('close', () => {
                console.log('Connection closed with host');
                delete connections[roomId];
                removePeer(roomId);
                displaySystemMessage('Host disconnected. You can still chat with other connected peers.');
            });
            
            hostConn.on('error', (err) => {
                console.error('Connection error with host:', err);
            });
        });
    }

    // Handle new peer connection
    function handleNewConnection(conn) {
        const peerId = conn.peer;
        connections[peerId] = conn;
        
        conn.on('open', () => {
            console.log('Connection established with peer:', peerId);
            
            // Send existing peer list to the new peer
            if (isHost) {
                conn.send({
                    type: 'peers-list',
                    peers: Object.keys(connections).filter(id => id !== peerId)
                });
                
                // Send room information
                conn.send({
                    type: 'room-info',
                    name: roomName,
                    isPublic: isPublic
                });
            }
            
            // Notify all peers about the new connection
            broadcastMessage({
                type: 'peer-joined',
                peerId: peerId
            });
            
            // Update UI
            addPeer(peerId);
            displaySystemMessage(`New peer joined: ${peerId.substring(0, 5)}...`);
        });

        conn.on('data', (data) => {
            console.log('Received from', peerId, ':', data);
            handleIncomingData(data, peerId);
        });

        conn.on('close', () => {
            console.log('Connection closed with peer:', peerId);
            delete connections[peerId];
            removePeer(peerId);
            displaySystemMessage(`Peer left: ${peerId.substring(0, 5)}...`);
        });

        conn.on('error', (err) => {
            console.error('Connection error with peer:', peerId, err);
        });
    }

    // Handle incoming data based on message type
    function handleIncomingData(data, senderId) {
        if (typeof data === 'string') {
            // Legacy format: direct message
            displayMessage(data, false, senderId);
        } else if (typeof data === 'object') {
            // New format with message types
            switch (data.type) {
                case 'chat-message':
                    displayMessage(data.message, false, senderId);
                    break;
                case 'peer-joined':
                    // Connect to the new peer if we don't have a connection yet
                    if (!connections[data.peerId] && data.peerId !== myId) {
                        connectToPeer(data.peerId);
                    }
                    break;
                case 'peers-list':
                    // Connect to all existing peers
                    data.peers.forEach(peerId => {
                        if (!connections[peerId] && peerId !== myId) {
                            connectToPeer(peerId);
                        }
                    });
                    break;
                case 'room-info':
                    // Update room information
                    roomName = data.name;
                    roomNameDisplay.textContent = roomName;
                    isPublic = data.isPublic;
                    break;
                case 'room-info-request':
                    // Send room information if we're the host
                    if (isHost && connections[senderId]) {
                        connections[senderId].send({
                            type: 'room-info',
                            name: roomName,
                            isPublic: isPublic
                        });
                    }
                    break;
            }
        }
    }

    // Connect to a specific peer
    function connectToPeer(peerId) {
        if (!connections[peerId]) {
            console.log('Connecting to peer:', peerId);
            const conn = peer.connect(peerId);
            connections[peerId] = conn;
            
            conn.on('open', () => {
                console.log('Connected to peer:', peerId);
                addPeer(peerId);
            });
            
            conn.on('data', (data) => {
                console.log('Received from', peerId, ':', data);
                handleIncomingData(data, peerId);
            });
            
            conn.on('close', () => {
                console.log('Connection closed with peer:', peerId);
                delete connections[peerId];
                removePeer(peerId);
                displaySystemMessage(`Peer left: ${peerId.substring(0, 5)}...`);
            });
            
            conn.on('error', (err) => {
                console.error('Connection error with peer:', peerId, err);
            });
        }
    }

    // Add peer to the list
    function addPeer(peerId) {
        if (!peersList.includes(peerId)) {
            peersList.push(peerId);
            updatePeersList();
        }
    }

    // Remove peer from the list
    function removePeer(peerId) {
        peersList = peersList.filter(id => id !== peerId);
        updatePeersList();
    }

    // Update peers list display
    function updatePeersList() {
        const peerCount = peersList.length;
        peersListElement.textContent = `Connected peers (${peerCount + 1}): You${peerCount > 0 ? ', ' : ''}${peersList.map(id => id.substring(0, 5) + '...').join(', ')}`;
    }

    // Broadcast message to all connected peers
    function broadcastMessage(message) {
Object.values(connections).forEach(conn => {
if (conn.open) {
    conn.send(message);
}
});
}

// Display message in chat
function displayMessage(message, isFromMe, senderId = null) {
const messageElement = document.createElement('div');

if (isFromMe) {
messageElement.textContent = `You: ${message}`;
messageElement.className = 'my-message';
} else {
const peerPrefix = senderId ? `${senderId.substring(0, 5)}...` : 'Other';
messageElement.textContent = `${peerPrefix}: ${message}`;
messageElement.className = 'other-message';
}

messages.appendChild(messageElement);
messages.scrollTop = messages.scrollHeight;
}

// Display system message
function displaySystemMessage(message) {
const messageElement = document.createElement('div');
messageElement.textContent = message;
messageElement.className = 'system-message';
messages.appendChild(messageElement);
messages.scrollTop = messages.scrollHeight;
}

// Send message to all peers
function sendMessage() {
const message = messageInput.value.trim();
if (message) {
broadcastMessage({
    type: 'chat-message',
    message: message
});
displayMessage(message, true);
messageInput.value = '';
}
}

// Leave current room
function leaveRoom() {
if (isHost && isPublic) {
unregisterPublicRoom(roomId);
}

// Close all connections
Object.values(connections).forEach(conn => {
if (conn.open) {
    conn.close();
}
});

// Close peer connection
if (peer) {
peer.destroy();
}

// Reset variables
connections = {};
roomId = null;
roomName = null;
isHost = false;
peersList = [];

// Return to welcome screen
chatContainer.style.display = 'none';
welcomeScreen.style.display = 'block';
createForm.style.display = 'none';
joinForm.style.display = 'none';
publicRoomsDiv.style.display = 'none';
}

// Event Listeners
createBtn.addEventListener('click', () => {
createForm.style.display = 'block';
joinForm.style.display = 'none';
publicRoomsDiv.style.display = 'none';
});

joinBtn.addEventListener('click', () => {
joinForm.style.display = 'block';
createForm.style.display = 'none';
publicRoomsDiv.style.display = 'none';
});

viewPublicBtn.addEventListener('click', () => {
publicRoomsDiv.style.display = 'block';
createForm.style.display = 'none';
joinForm.style.display = 'none';
loadPublicRooms();
});

createRoomBtn.addEventListener('click', createRoom);

connectBtn.addEventListener('click', () => {
const id = roomIdInput.value.trim();
if (id) {
joinRoom(id);
} else {
alert('Please enter a room ID');
}
});

refreshRoomsBtn.addEventListener('click', loadPublicRooms);

backBtn.addEventListener('click', () => {
publicRoomsDiv.style.display = 'none';
});

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
if (e.key === 'Enter') {
sendMessage();
}
});

leaveBtn.addEventListener('click', leaveRoom);

// Copy room ID to clipboard when clicked
roomIdDisplay.addEventListener('click', () => {
if (roomId) {
navigator.clipboard.writeText(roomId)
    .then(() => {
        alert('Room ID copied to clipboard!');
    })
    .catch(err => {
        console.error('Could not copy text: ', err);
    });
}
});

// Clean up on window unload
window.addEventListener('beforeunload', () => {
if (isHost && isPublic && roomId) {
unregisterPublicRoom(roomId);
}
});

// Initialize
// Check for expired public rooms (older than 24 hours)
const cleanupExpiredRooms = () => {
const publicRooms = getPublicRooms();
const now = new Date();
let updated = false;

for (const [roomId, roomInfo] of Object.entries(publicRooms)) {
const createdAt = new Date(roomInfo.createdAt);
const hoursDiff = (now - createdAt) / (1000 * 60 * 60);

if (hoursDiff > 24) {
    delete publicRooms[roomId];
    updated = true;
}
}

if (updated) {
localStorage.setItem('publicRooms', JSON.stringify(publicRooms));
}
};

cleanupExpiredRooms();});