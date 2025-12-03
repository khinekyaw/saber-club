"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const uuid_1 = require("uuid");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
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
const players = new Map();
// --- Helper Functions ---
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    do {
        result = '';
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms.has(result));
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
    if (player.roomCode && rooms.has(player.roomCode)) {
        const room = rooms.get(player.roomCode);
        broadcastToRoom(room, { type: 'opponent_left' }, playerId);
        if (room.gameStarted) {
            const winner = Array.from(room.players.values()).find(p => p.id !== playerId);
            if (winner) {
                sendToClient(winner.socket, { type: 'game_over', winner: winner.id });
            }
        }
        room.players.delete(playerId);
        if (room.players.size === 0) {
            console.log(`Room ${room.code} deleted (empty)`);
            rooms.delete(room.code);
        }
    }
    players.delete(playerId);
    console.log(`Player ${playerId} disconnected`);
}
// --- Server Setup ---
// 1. Create Express App and HTTP Server
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
app.use(express_1.default.static('public'));
// 2. Configure Express to serve the static index.html file
app.get('/', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, 'index.html'));
});
// 3. Attach WebSocket Server to the HTTP Server
const wss = new ws_1.WebSocketServer({ server });
console.log(`Saber Club HTTP Server running on http://localhost:${PORT}`);
console.log(`Saber Club WS Server running on ws://localhost:${PORT}`);
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
    // --- WebSocket Message Handling ---
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            const type = msg.type;
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
                    newPlayer.name = msg.playerName;
                    newPlayer.roomCode = roomCode;
                    newPlayer.health = 100;
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
                    newPlayer.name = msg.playerName;
                    newPlayer.roomCode = code;
                    newPlayer.health = 100;
                    const opponent = room.players.values().next().value;
                    if (opponent) {
                        sendToClient(opponent.socket, {
                            type: 'opponent_joined',
                            opponentName: newPlayer.name
                        });
                    }
                    room.players.set(playerId, newPlayer);
                    sendToClient(ws, { type: 'room_joined', roomCode: code });
                    console.log(`${msg.playerName} joined room ${code}`);
                    if (room.players.size === 2) {
                        room.gameStarted = true;
                        broadcastToRoom(room, { type: 'game_start' });
                        console.log(`Game started in room ${code}`);
                    }
                    break;
                }
                case 'player_state': {
                    const room = rooms.get(msg.roomCode);
                    if (room) {
                        // This line works now because PlayerState is defined
                        newPlayer.state = msg.state;
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
                    const room = rooms.get(msg.roomCode);
                    if (!room)
                        return;
                    let opponent;
                    room.players.forEach(p => {
                        if (p.id !== playerId)
                            opponent = p;
                    });
                    if (opponent) {
                        const damage = DAMAGE_VALUES[msg.partName] || 0;
                        opponent.health = Math.max(0, opponent.health - damage);
                        sendToClient(opponent.socket, {
                            type: 'player_hit',
                            damage: damage,
                            partName: msg.partName
                        });
                        sendToClient(ws, {
                            type: 'player_damaged',
                            newHealth: opponent.health
                        });
                        if (opponent.health <= 0) {
                            room.gameStarted = false;
                            const gameOverMsg = {
                                type: 'game_over',
                                winner: playerId
                            };
                            broadcastToRoom(room, gameOverMsg);
                        }
                    }
                    break;
                }
                case 'request_rematch': {
                    const room = rooms.get(msg.roomCode);
                    if (room && room.players.size === 2) {
                        newPlayer.health = 100;
                        let allReady = true;
                        room.players.forEach(p => {
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
// 4. Start the HTTP server (which the WSS is attached to)
server.listen(PORT, () => {
    console.log(`Server is live and listening on port ${PORT}`);
});
