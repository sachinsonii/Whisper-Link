document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements (same as before)
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
    
    // Public rooms registry - shared between peers
    let publicRooms = {};
    
    // Special peer ID for the public rooms registry
    // This will be used to identify public room announcements
    const PUBLIC_ROOMS_REGISTRY_ID = 'public-rooms-registry';
    
    // Global peer for discovery (always connected)
    let discoveryPeer;
    let isDiscoveryPeerInitialized = false;
    
    // Initialize the discovery peer
    function initDiscoveryPeer() {
        if (isDiscoveryPeerInitialized) return;
        
        // Create a new peer for discovery
        discoveryPeer = new Peer(null, {
            debug: 2
        });
        
        discoveryPeer.on('open', (id) => {
            console.log('Discovery peer ID is: ' + id);
            isDiscoveryPeerInitialized = true;
            
            // Connect to well-known discovery peers
            // You can hardcode some known peer IDs here that are likely to be online
            // For simplicity, we'll use a URL parameter to specify a "seed" peer
            const urlParams = new URLSearchParams(window.location.search);
            const seedPeer = urlParams.get('seed');
            
            if (seedPeer) {
                connectToDiscoveryPeer(seedPeer);
            }
            
            // Update the URL with our peer ID as a seed
            if (history.pushState) {
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('seed', id);
                window.history.pushState({ path: newUrl.href }, '', newUrl.href);
            }
        });
        
        discoveryPeer.on('connection', (conn) => {
            console.log('Discovery connection received from:', conn.peer);
            handleDiscoveryConnection(conn);
        });
        
        discoveryPeer.on('error', (err) => {
            console.error('Discovery peer error:', err);
        });
    }
    
    // Handle discovery connections
    function handleDiscoveryConnection(conn) {
        conn.on('open', () => {
            console.log('Discovery connection opened with:', conn.peer);
            
            // Share our public rooms with the new peer
            conn.send({
                type: 'public-rooms-list',
                rooms: publicRooms
            });
        });
        
        conn.on('data', (data) => {
            console.log('Discovery data received:', data);
            
            if (data.type === 'public-rooms-list') {
                // Merge the received public rooms with our list
                mergePublicRooms(data.rooms);
            } else if (data.type === 'public-room-added') {
                // Add a new public room
                addPublicRoom(data.roomId, data.roomName);
            } else if (data.type === 'public-room-removed') {
                // Remove a public room
                removePublicRoom(data.roomId);
            }
        });
        
        conn.on('close', () => {
            console.log('Discovery connection closed with:', conn.peer);
        });
        
        conn.on('error', (err) => {
            console.error('Discovery connection error:', err);
        });
    }
    
    // Connect to a discovery peer
    function connectToDiscoveryPeer(peerId) {
        console.log('Connecting to discovery peer:', peerId);
        
        const conn = discoveryPeer.connect(peerId);
        
        conn.on('open', () => {
            console.log('Connected to discovery peer:', peerId);
        });
        
        conn.on('data', (data) => {
            console.log('Received from discovery peer:', data);
            
            if (data.type === 'public-rooms-list') {
                // Merge the received public rooms with our list
                mergePublicRooms(data.rooms);
            } else if (data.type === 'public-room-added') {
                // Add a new public room
                addPublicRoom(data.roomId, data.roomName);
            } else if (data.type === 'public-room-removed') {
                // Remove a public room
                removePublicRoom(data.roomId);
            }
        });
        
        conn.on('close', () => {
            console.log('Discovery connection closed with:', peerId);
        });
        
        conn.on('error', (err) => {
            console.error('Discovery connection error with:', peerId, err);
        });
    }
    
    // Broadcast to all discovery connections
    function broadcastToDiscovery(message) {
        for (const connId in discoveryPeer._connections) {
            for (let i = 0; i < discoveryPeer._connections[connId].length; i++) {
                const conn = discoveryPeer._connections[connId][i];
                if (conn.open) {
                    conn.send(message);
                }
            }
        }
    }
    
    // Merge public rooms
    function mergePublicRooms(rooms) {
        let updated = false;
        
        for (const [roomId, roomInfo] of Object.entries(rooms)) {
            // Check if the room already exists or if it's newer
            if (!publicRooms[roomId] || new Date(roomInfo.createdAt) > new Date(publicRooms[roomId].createdAt)) {
                publicRooms[roomId] = roomInfo;
                updated = true;
            }
        }
        
        if (updated) {
            // If the public rooms view is open, refresh it
            if (publicRoomsDiv.style.display !== 'none') {
                loadPublicRooms();
            }
        }
    }
    
    // Add a public room
    function addPublicRoom(roomId, roomName) {
        publicRooms[roomId] = {
            name: roomName,
            createdAt: new Date().toISOString()
        };
        
        // If the public rooms view is open, refresh it
        if (publicRoomsDiv.style.display !== 'none') {
            loadPublicRooms();
        }
        
        // Store locally as well
        localStorage.setItem('publicRooms', JSON.stringify(publicRooms));
    }
    
    // Remove a public room
    function removePublicRoom(roomId) {
        if (publicRooms[roomId]) {
            delete publicRooms[roomId];
            
            // If the public rooms view is open, refresh it
            if (publicRoomsDiv.style.display !== 'none') {
                loadPublicRooms();
            }
            
            // Update local storage
            localStorage.setItem('publicRooms', JSON.stringify(publicRooms));
        }
    }
    
    // Register a new public room
    function registerPublicRoom(roomId, roomName) {
        // Add to our list
        addPublicRoom(roomId, roomName);
        
        // Broadcast to all discovery peers
        if (isDiscoveryPeerInitialized) {
            broadcastToDiscovery({
                type: 'public-room-added',
                roomId: roomId,
                roomName: roomName
            });
        }
    }
    
    // Unregister a public room
    function unregisterPublicRoom(roomId) {
        // Remove from our list
        removePublicRoom(roomId);
        
        // Broadcast to all discovery peers
        if (isDiscoveryPeerInitialized) {
            broadcastToDiscovery({
                type: 'public-room-removed',
                roomId: roomId
            });
        }
    }
    
    // Load public rooms from our registry
    function loadPublicRooms() {
        roomsListDiv.innerHTML = '';
        
        // Filter out expired rooms (older than 24 hours)
        const now = new Date();
        let roomCount = 0;
        
        for (const [roomId, roomInfo] of Object.entries(publicRooms)) {
            const createdAt = new Date(roomInfo.createdAt);
            const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
            
            if (hoursDiff <= 24) {
                const roomElement = document.createElement('div');
                roomElement.innerHTML = `
                    <span>${roomInfo.name || 'Unnamed Room'}</span>
                    <button class="join-room-btn" data-roomid="${roomId}">Join</button>
                `;
                roomsListDiv.appendChild(roomElement);
                roomCount++;
            } else {
                // Remove expired room
                delete publicRooms[roomId];
            }
        }
        
        if (roomCount === 0) {
            roomsListDiv.innerHTML = '<p>No public rooms available. Create one or wait for others to appear.</p>';
        }
        
        // Update local storage with filtered rooms
        localStorage.setItem('publicRooms', JSON.stringify(publicRooms));
        
        // Add event listeners to join buttons
        document.querySelectorAll('.join-room-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const roomId = btn.getAttribute('data-roomid');
                const roomInfo = publicRooms[roomId];
                joinRoom(roomId, roomInfo.name);
            });
        });
    }
    
    // Initialize PeerJS for chat room
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
        
        // Close discovery peer
        if (discoveryPeer) {
            discoveryPeer.destroy();
        }
    });

    // Initialize
    // Load existing public rooms from localStorage
    publicRooms = JSON.parse(localStorage.getItem('publicRooms') || '{}');
    
    // Clean up expired rooms
    const cleanupExpiredRooms = () => {
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

    cleanupExpiredRooms();
    
    // Initialize the discovery peer
    initDiscoveryPeer();
});
