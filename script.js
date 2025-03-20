document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Keeping all your existing elements
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
    
    // Discovery peer and public rooms list
    let discoveryPeer;
    let publicRooms = {};
    const DISCOVERY_ID = 'whisper-link-discovery'; // Fixed ID for discovery service

    // Initialize Discovery Peer - used for public room discovery
    function initDiscoveryPeer() {
        // Check if we're already connected to the discovery service
        if (discoveryPeer && discoveryPeer.id) return;
        
        // Create a new peer for discovery purposes
        discoveryPeer = new Peer(null, {
            debug: 2
        });
        
        discoveryPeer.on('open', (id) => {
            console.log('Discovery peer ID:', id);
            
            // Try to connect to the discovery server
            connectToDiscoveryServer();
        });
        
        discoveryPeer.on('connection', (conn) => {
            // Handle connection from someone looking for public rooms
            console.log('Someone connected to us for discovery:', conn.peer);
            
            conn.on('open', () => {
                // Send our list of known public rooms
                conn.send({
                    type: 'public-rooms',
                    rooms: getLocalPublicRooms()
                });
            });
            
            // Also handle discovery messages
            conn.on('data', (data) => {
                if (data.type === 'public-rooms') {
                    // Merge the received public rooms with our list
                    mergePublicRooms(data.rooms);
                    
                    // If we're currently viewing public rooms, refresh the display
                    if (publicRoomsDiv.style.display !== 'none') {
                        displayPublicRooms();
                    }
                } else if (data.type === 'room-announcement') {
                    // Add the new public room to our list
                    addPublicRoom(data.roomId, data.roomName);
                    
                    // If we're currently viewing public rooms, refresh the display
                    if (publicRoomsDiv.style.display !== 'none') {
                        displayPublicRooms();
                    }
                }
            });
        });
        
        discoveryPeer.on('error', (err) => {
            console.error('Discovery peer error:', err);
            
            // If the discovery ID is taken, it means someone else is acting as the discovery server
            if (err.type === 'unavailable-id') {
                // Connect to the existing discovery server instead
                connectToDiscoveryServer();
            }
        });
    }
    
    // Connect to the discovery server
    function connectToDiscoveryServer() {
        try {
            const conn = discoveryPeer.connect(DISCOVERY_ID);
            
            conn.on('open', () => {
                console.log('Connected to discovery server');
                
                // Request public rooms
                conn.send({
                    type: 'request-public-rooms'
                });
                
                // If we're hosting a public room, announce it
                if (isHost && isPublic && roomId) {
                    conn.send({
                        type: 'room-announcement',
                        roomId: roomId,
                        roomName: roomName
                    });
                }
            });
            
            conn.on('data', (data) => {
                if (data.type === 'public-rooms') {
                    // Merge the received public rooms with our list
                    mergePublicRooms(data.rooms);
                    
                    // If we're currently viewing public rooms, refresh the display
                    if (publicRoomsDiv.style.display !== 'none') {
                        displayPublicRooms();
                    }
                }
            });
            
            conn.on('error', (err) => {
                console.error('Error connecting to discovery server:', err);
                
                // If we can't connect to the discovery server, become one
                becomeDiscoveryServer();
            });
        } catch (err) {
            console.error('Failed to connect to discovery server:', err);
            
            // If we can't connect to the discovery server, become one
            becomeDiscoveryServer();
        }
    }
    
    // Become the discovery server
    function becomeDiscoveryServer() {
        console.log('Becoming discovery server');
        
        // If we already have a discovery peer, destroy it
        if (discoveryPeer) {
            discoveryPeer.destroy();
        }
        
        // Create a new peer with the fixed discovery ID
        discoveryPeer = new Peer(DISCOVERY_ID, {
            debug: 2
        });
        
        discoveryPeer.on('open', (id) => {
            console.log('Now serving as discovery server with ID:', id);
        });
        
        discoveryPeer.on('connection', (conn) => {
            console.log('New peer connected to discovery server:', conn.peer);
            
            conn.on('open', () => {
                // Send our list of known public rooms
                conn.send({
                    type: 'public-rooms',
                    rooms: getLocalPublicRooms()
                });
            });
            
            conn.on('data', (data) => {
                if (data.type === 'request-public-rooms') {
                    // Send our list of known public rooms
                    conn.send({
                        type: 'public-rooms',
                        rooms: getLocalPublicRooms()
                    });
                } else if (data.type === 'room-announcement') {
                    // Add the new public room to our list
                    addPublicRoom(data.roomId, data.roomName);
                    
                    // Broadcast the new room to all connected peers
                    broadcastPublicRoom(data.roomId, data.roomName, conn.peer);
                } else if (data.type === 'public-rooms') {
                    // Merge the received public rooms with our list
                    mergePublicRooms(data.rooms);
                }
            });
        });
        
        discoveryPeer.on('error', (err) => {
            console.error('Discovery server error:', err);
        });
    }
    
    // Broadcast a public room to all discovery connections except the sender
    function broadcastPublicRoom(roomId, roomName, excludePeerId) {
        Object.entries(discoveryPeer.connections).forEach(([peerId, conns]) => {
            if (peerId !== excludePeerId && conns.length > 0) {
                conns[0].send({
                    type: 'room-announcement',
                    roomId: roomId,
                    roomName: roomName
                });
            }
        });
    }
    
    // Get public rooms from localStorage
    function getLocalPublicRooms() {
        return JSON.parse(localStorage.getItem('publicRooms') || '{}');
    }
    
    // Add a public room to localStorage
    function addPublicRoom(roomId, roomName) {
        const rooms = getLocalPublicRooms();
        rooms[roomId] = {
            name: roomName,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('publicRooms', JSON.stringify(rooms));
        publicRooms = rooms;
    }
    
    // Remove a public room from localStorage
    function removePublicRoom(roomId) {
        const rooms = getLocalPublicRooms();
        if (rooms[roomId]) {
            delete rooms[roomId];
            localStorage.setItem('publicRooms', JSON.stringify(rooms));
            publicRooms = rooms;
        }
    }
    
    // Merge public rooms from another peer with our list
    function mergePublicRooms(newRooms) {
        const rooms = getLocalPublicRooms();
        let updated = false;
        
        for (const [roomId, roomInfo] of Object.entries(newRooms)) {
            if (!rooms[roomId]) {
                rooms[roomId] = roomInfo;
                updated = true;
            }
        }
        
        if (updated) {
            localStorage.setItem('publicRooms', JSON.stringify(rooms));
            publicRooms = rooms;
        }
    }
    
    // Display public rooms
    function displayPublicRooms() {
        const rooms = getLocalPublicRooms();
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

    // Initialize PeerJS for chat
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
                // Add to local storage
                addPublicRoom(roomId, roomName);
                displaySystemMessage('This room is public and visible in the public rooms list.');
                
                // Announce to discovery network
                if (discoveryPeer) {
                    try {
                        const conn = discoveryPeer.connect(DISCOVERY_ID);
                        conn.on('open', () => {
                            conn.send({
                                type: 'room-announcement',
                                roomId: roomId,
                                roomName: roomName
                            });
                        });
                    } catch (err) {
                        console.error('Failed to announce room:', err);
                    }
                }
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
            removePublicRoom(roomId);
            
            // Announce room removal
            if (discoveryPeer) {
                try {
                    const conn = discoveryPeer.connect(DISCOVERY_ID);
                    conn.on('open', () => {
                        conn.send({
                            type: 'room-removed',
                            roomId: roomId
                        });
                    });
                } catch (err) {
                    console.error('Failed to announce room removal:', err);
                }
            }
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
        
        // Initialize discovery peer if not already done
        initDiscoveryPeer();
        
        // Display local public rooms first
        displayPublicRooms();
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

    refreshRoomsBtn.addEventListener('click', () => {
        // Initialize discovery peer if not already done
        initDiscoveryPeer();
        
        // Try to get fresh data from discovery network
        try {
            const conn = discoveryPeer.connect(DISCOVERY_ID);
            conn.on('open', () => {
                conn.send({
                    type: 'request-public-rooms'
                });
                
                // Display current data while waiting for response
                displayPublicRooms();
            });
        } catch (err) {
            console.error('Failed to refresh rooms:', err);
            displayPublicRooms();
        }
    });

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
            removePublicRoom(roomId);
        }
        
        // Disconnect from discovery network
        if (discoveryPeer) {
            discoveryPeer.destroy();
        }
    });

    // Initialize discovery peer on page load
    initDiscoveryPeer();

    // Clean up expired rooms (older than 24 hours)
    const cleanupExpiredRooms = () => {
        const rooms = getLocalPublicRooms();
        const now = new Date();
        let updated = false;

        for (const [roomId, roomInfo] of Object.entries(rooms)) {
            const createdAt = new Date(roomInfo.createdAt);
            const hoursDiff = (now - createdAt) / (1000 * 60 * 60);

            if (hoursDiff > 24) {
                delete rooms[roomId];
                updated = true;
            }
        }

        if (updated) {
            localStorage.setItem('publicRooms', JSON.stringify(rooms));
        }
    };

    cleanupExpiredRooms();
});