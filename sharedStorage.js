const SharedStorageAPI = (() => {
    const publicRooms = JSON.parse(localStorage.getItem('sharedPublicRooms') || '{}');

    function saveRooms() {
        localStorage.setItem('sharedPublicRooms', JSON.stringify(publicRooms));
    }

    return {
        registerRoom: (roomId, roomName) => {
            publicRooms[roomId] = {
                name: roomName,
                createdAt: new Date().toISOString()
            };
            saveRooms();
        },
        unregisterRoom: (roomId) => {
            delete publicRooms[roomId];
            saveRooms();
        },
        getRooms: (callback) => {
            callback(publicRooms);
        }
    };
})();
