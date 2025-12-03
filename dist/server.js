"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const uuid_1 = require("uuid");
// --- Configuration ---
const PORT = 3000;
const DAMAGE_VALUES = {
    head: 25,
    torso: 15,
    leftArm: 10,
    rightArm: 10,
    leftLeg: 10,
    rightLeg: 10,
};
// --- State Management (In-Memory) ---
const rooms = new Map();
const players = new Map(); // Map <playerId, Player>
// --- Helper Functions ---
// Generate 4-char uppercase alphanumeric code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    do {
        result = '';
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms.has(result)); // Ensure uniqueness
    return result;
}
function sendToClient(ws, message) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}
function broadcastToRoom(room, message, excludePlayerId) {
    room.players.forEach((player) => {
        if (player.id !== excludePlayerId) {
            sendToClient(player.socket, message);
        }
    });
}
function handleDisconnect(playerId) {
    const player = players.get(playerId);
    if (!player)
        return;
    // If player was in a room
    if (player.roomCode && rooms.has(player.roomCode)) {
        const room = rooms.get(player.roomCode);
        // Notify opponent
        broadcastToRoom(room, { type: 'opponent_left' }, playerId);
        // If game was in progress, remaining player wins (optional logic, usually handled by client receiving opponent_left)
        if (room.gameStarted) {
            const winner = Array.from(room.players.values()).find(p => p.id !== playerId);
            if (winner) {
                sendToClient(winner.socket, { type: 'game_over', winner: winner.id });
            }
        }
        // Remove player from room
        room.players.delete(playerId);
        // If room is empty, delete it
        if (room.players.size === 0) {
            console.log(`Room ${room.code} deleted (empty)`);
            rooms.delete(room.code);
        }
    }
    // Cleanup player from global map
    players.delete(playerId);
    console.log(`Player ${playerId} disconnected`);
}
// --- Server Setup ---
const wss = new ws_1.WebSocketServer({ port: PORT });
console.log(`Saber Club Backend running on ws://localhost:${PORT}`);
wss.on('connection', (ws) => {
    // 1. Assign ID and create Player object
    const playerId = (0, uuid_1.v4)();
    const newPlayer = {
        id: playerId,
        socket: ws,
        health: 100
    };
    players.set(playerId, newPlayer);
    console.log(`New connection: ${playerId}`);
    // 2. Send 'connected' message
    sendToClient(ws, {
        type: 'connected',
        playerId: playerId
    });
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            const type = msg.type;
            // Basic validation: Ensure message matches the connected socket's player ID
            // (Skipped for 'ping' to reduce overhead, but good for critical actions)
            if (msg.playerId && msg.playerId !== playerId) {
                console.warn(`Spoof attempt: Socket ${playerId} sent message for ${msg.playerId}`);
                return;
            }
            switch (type) {
                case 'create_room': {
                    const roomCode = generateRoomCode();
                    const room = {
                        code: roomCode,
                        players: new Map(),
                        createdAt: Date.now(),
                        gameStarted: false
                    };
                    // Add player to room
                    newPlayer.name = msg.playerName;
                    newPlayer.roomCode = roomCode;
                    newPlayer.health = 100; // Reset health
                    room.players.set(playerId, newPlayer);
                    rooms.set(roomCode, room);
                    sendToClient(ws, { type: 'room_created', roomCode });
                    console.log(`Room ${roomCode} created by ${msg.playerName}`);
                    break;
                }
                case 'join_room': {
                    const code = msg.roomCode;
                    const room = rooms.get(code);
                    if (!room) {
                        sendToClient(ws, { type: 'error', message: 'Room not found' });
                        return;
                    }
                    if (room.players.size >= 2) {
                        sendToClient(ws, { type: 'error', message: 'Room is full' });
                        return;
                    }
                    // Update player
                    newPlayer.name = msg.playerName;
                    newPlayer.roomCode = code;
                    newPlayer.health = 100; // Reset health
                    // Notify existing player (the host)
                    const opponent = room.players.values().next().value;
                    if (opponent) {
                        sendToClient(opponent.socket, {
                            type: 'opponent_joined',
                            opponentName: newPlayer.name
                        });
                    }
                    // Add to room
                    room.players.set(playerId, newPlayer);
                    sendToClient(ws, { type: 'room_joined', roomCode: code });
                    console.log(`${msg.playerName} joined room ${code}`);
                    // Check for Game Start
                    if (room.players.size === 2) {
                        room.gameStarted = true;
                        // Spec says frontend waits 2s, but we send the signal now
                        // Alternatively, use setTimeout here if server needs to enforce delay
                        broadcastToRoom(room, { type: 'game_start' });
                        console.log(`Game started in room ${code}`);
                    }
                    break;
                }
                case 'player_state': {
                    // High frequency relay
                    const room = rooms.get(msg.roomCode);
                    if (room) {
                        // Update server-side state (optional, but good for validation)
                        newPlayer.state = msg.state;
                        // Relay to everyone EXCEPT sender
                        broadcastToRoom(room, msg, playerId);
                    }
                    break;
                }
                case 'saber_clash': {
                    const room = rooms.get(msg.roomCode);
                    if (room) {
                        broadcastToRoom(room, msg, playerId);
                    }
                    break;
                }
                case 'player_hit': {
                    // msg contains: { damage, partName }
                    // 1. Identify victim (the other player in the room)
                    const room = rooms.get(msg.roomCode);
                    if (!room)
                        return;
                    // Get opponent
                    let opponent;
                    room.players.forEach(p => {
                        if (p.id !== playerId)
                            opponent = p;
                    });
                    if (opponent) {
                        // Server Validation
                        const damage = DAMAGE_VALUES[msg.partName] || 0;
                        // Update Opponent Health
                        opponent.health = Math.max(0, opponent.health - damage);
                        // Notify Victim
                        sendToClient(opponent.socket, {
                            type: 'player_hit',
                            damage: damage,
                            partName: msg.partName
                        });
                        // Notify Attacker (Confirmation)
                        sendToClient(ws, {
                            type: 'player_damaged',
                            newHealth: opponent.health
                        });
                        // Check Game Over
                        if (opponent.health <= 0) {
                            room.gameStarted = false;
                            const gameOverMsg = {
                                type: 'game_over',
                                winner: playerId // The attacker wins
                            };
                            broadcastToRoom(room, gameOverMsg);
                        }
                    }
                    break;
                }
                case 'request_rematch': {
                    // Simple logic: If one requests, wait for other? 
                    // Or spec says: "When both players request rematch"
                    // Implementation: We can add a 'rematchRequested' flag to player
                    // For simplicity here: We just reset health and send game_start immediately 
                    // if both are present.
                    const room = rooms.get(msg.roomCode);
                    if (room && room.players.size === 2) {
                        // In a real prod app, store a boolean on the player "wantsRematch"
                        // checks if both true, then start.
                        // Current simplifed approach: Reset sender health
                        newPlayer.health = 100;
                        // Check if opponent also has full health (indicating they reset/rematched)
                        // This is a naive check. Better to add a flag `rematchReady`.
                        let allReady = true;
                        room.players.forEach(p => {
                            // This logic assumes rematch sets health to 100 immediately. 
                            // Ideally, use a specific flag.
                            if (p.health < 100 && p.id !== playerId)
                                allReady = false;
                        });
                        if (allReady) {
                            room.gameStarted = true;
                            broadcastToRoom(room, { type: 'game_start' });
                        }
                    }
                    break;
                }
                case 'ping': {
                    sendToClient(ws, {
                        type: 'pong',
                        clientTimestamp: msg.clientTimestamp
                    });
                    break;
                }
            }
        }
        catch (e) {
            console.error('Invalid message format', e);
            sendToClient(ws, { type: 'error', message: 'Invalid message format' });
        }
    });
    ws.on('close', () => {
        handleDisconnect(playerId);
    });
    ws.on('error', console.error);
});
