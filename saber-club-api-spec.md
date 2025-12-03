# Saber Club - WebSocket API Specification

## Overview

This document specifies the WebSocket API for the Saber Club PVP multiplayer game backend. The frontend is already implemented and expects this exact API contract.

---

## Server Configuration

| Setting | Value |
|---------|-------|
| Protocol | WebSocket (`ws://` or `wss://` for production) |
| Default Port | 3000 |
| Default URL | `ws://localhost:3000` |
| Update Rate | ~20Hz (client sends every 50ms) |

---

## Message Format

All messages are JSON strings with this base structure:

```json
{
  "type": "message_type",
  "playerId": "unique-player-id",
  "roomCode": "ROOM1234",
  "timestamp": 1699999999999,
  ...additional fields
}
```

---

## Client → Server Messages

### 1. `create_room`

Create a new game room. Sent when player clicks "CREATE ROOM" button.

**Request:**
```json
{
  "type": "create_room",
  "playerName": "Player123",
  "timestamp": 1699999999999
}
```

**Expected Response:** `room_created`

---

### 2. `join_room`

Join an existing room by code. Sent when player enters code and clicks "JOIN ROOM".

**Request:**
```json
{
  "type": "join_room",
  "roomCode": "ABCD1234",
  "playerName": "Player456",
  "timestamp": 1699999999999
}
```

**Expected Responses:** 
- Success: `room_joined` → then `game_start` to both players
- Failure: `error`

---

### 3. `player_state`

Player position/state update. Sent every 50ms during active gameplay.

**Request:**
```json
{
  "type": "player_state",
  "playerId": "player-uuid-here",
  "roomCode": "ABCD1234",
  "timestamp": 1699999999999,
  "state": {
    "position": {
      "x": 0.0,
      "y": 1.7,
      "z": 3.0
    },
    "rotation": 0.0,
    "saberRotation": {
      "x": 0.0,
      "y": 0.0
    },
    "saberOn": true,
    "health": 100
  }
}
```

**Server Action:** Relay this message to the OTHER player in the room (do not echo back to sender).

---

### 4. `player_hit`

Report that this player hit the opponent. Sent when local collision detection registers a hit.

**Request:**
```json
{
  "type": "player_hit",
  "playerId": "player-uuid-here",
  "roomCode": "ABCD1234",
  "timestamp": 1699999999999,
  "damage": 15,
  "partName": "torso"
}
```

**Damage Values by Body Part:**
| Part | Damage |
|------|--------|
| head | 25 |
| torso | 15 |
| leftArm | 10 |
| rightArm | 10 |
| leftLeg | 10 |
| rightLeg | 10 |

**Server Action:** 
1. Validate the hit (optional - see Server Logic section)
2. Send `player_hit` to the victim (opponent)
3. Send `player_damaged` back to the attacker with new health value
4. If health <= 0, send `game_over` to both players

---

### 5. `saber_clash`

Report saber-to-saber collision. Sent when sabers collide.

**Request:**
```json
{
  "type": "saber_clash",
  "playerId": "player-uuid-here",
  "roomCode": "ABCD1234",
  "timestamp": 1699999999999,
  "position": {
    "x": 1.5,
    "y": 1.2,
    "z": 0.5
  }
}
```

**Server Action:** Relay to the other player in the room.

---

### 6. `ping`

Latency measurement ping. Sent every 2 seconds.

**Request:**
```json
{
  "type": "ping",
  "playerId": "player-uuid-here",
  "clientTimestamp": 1699999999999
}
```

**Expected Response:** `pong` with the same `clientTimestamp` echoed back.

---

### 7. `request_rematch`

Request to play again after game ends. Sent when player clicks "RESTART" in PVP mode.

**Request:**
```json
{
  "type": "request_rematch",
  "playerId": "player-uuid-here",
  "roomCode": "ABCD1234",
  "timestamp": 1699999999999
}
```

**Server Action:** When both players request rematch, reset game state and send `game_start` to both.

---

## Server → Client Messages

### 1. `connected`

Sent immediately after WebSocket connection is established.

**Response:**
```json
{
  "type": "connected",
  "playerId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Notes:** 
- Generate a unique ID (UUID recommended)
- Client stores this ID and includes it in subsequent messages

---

### 2. `room_created`

Sent after successful room creation.

**Response:**
```json
{
  "type": "room_created",
  "roomCode": "DUEL4521"
}
```

**Notes:**
- Generate a unique 4-8 character alphanumeric room code
- Room codes should be uppercase for consistency

---

### 3. `room_joined`

Sent to the joining player after successfully joining a room.

**Response:**
```json
{
  "type": "room_joined",
  "roomCode": "DUEL4521"
}
```

---

### 4. `opponent_joined`

Sent to the waiting player when an opponent joins their room.

**Response:**
```json
{
  "type": "opponent_joined",
  "opponentName": "Player456"
}
```

---

### 5. `opponent_left`

Sent when the opponent disconnects from the room.

**Response:**
```json
{
  "type": "opponent_left"
}
```

---

### 6. `game_start`

Sent to BOTH players when 2 players are in a room and ready to begin.

**Response:**
```json
{
  "type": "game_start"
}
```

**Notes:** The frontend waits 2 seconds after `opponent_joined` before expecting this. You can send it immediately or implement a countdown.

---

### 7. `player_state` (relayed)

Relay opponent's state to a player. This is the same format as received from the other client.

**Response:**
```json
{
  "type": "player_state",
  "timestamp": 1699999999999,
  "state": {
    "position": {
      "x": 0.0,
      "y": 1.7,
      "z": -3.0
    },
    "rotation": 3.14159,
    "saberRotation": {
      "x": 0.5,
      "y": -0.3
    },
    "saberOn": true,
    "health": 85
  }
}
```

---

### 8. `player_hit`

Notify a player they got hit by their opponent.

**Response:**
```json
{
  "type": "player_hit",
  "damage": 15,
  "partName": "torso"
}
```

---

### 9. `player_damaged`

Confirm to the attacker that their hit was registered, with opponent's new health.

**Response:**
```json
{
  "type": "player_damaged",
  "newHealth": 85
}
```

---

### 10. `saber_clash` (relayed)

Notify player of a saber clash.

**Response:**
```json
{
  "type": "saber_clash",
  "position": {
    "x": 1.5,
    "y": 1.2,
    "z": 0.5
  }
}
```

---

### 11. `game_over`

Sent to BOTH players when the game ends.

**Response:**
```json
{
  "type": "game_over",
  "winner": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Notes:** `winner` is the playerId of the winning player. Each client compares this to their own ID to determine if they won or lost.

---

### 12. `pong`

Response to ping for latency measurement.

**Response:**
```json
{
  "type": "pong",
  "clientTimestamp": 1699999999999
}
```

**Notes:** Echo back the exact `clientTimestamp` from the ping request.

---

### 13. `error`

Sent when an operation fails.

**Response:**
```json
{
  "type": "error",
  "message": "Room not found"
}
```

**Common Error Messages:**
- `"Room not found"` - Invalid room code
- `"Room is full"` - Room already has 2 players
- `"Not connected to a room"` - Action requires being in a room
- `"Invalid message format"` - Malformed JSON or missing fields

---

## Server Logic Requirements

### Room Management

1. **Room Creation**
   - Generate unique 4-8 character room codes (uppercase alphanumeric)
   - Example: `DUEL4521`, `FIGHT99`, `AB12CD34`
   - Store room with: code, players (max 2), creation timestamp

2. **Room Joining**
   - Validate room exists
   - Validate room has < 2 players
   - Add player to room
   - Notify existing player via `opponent_joined`
   - Start game when 2 players present

3. **Room Cleanup**
   - Remove room when both players disconnect
   - Optional: Remove rooms after inactivity timeout (e.g., 10 minutes)

### State Relay

1. When receiving `player_state`:
   - Find the room by `roomCode`
   - Find the OTHER player in that room
   - Send the state to them (do NOT send back to sender)

2. Maintain low latency - relay immediately without heavy processing

### Hit Validation (Optional but Recommended)

Simple approach (trust client):
- Relay hits directly, update health server-side
- Send `player_damaged` to attacker, `player_hit` to victim

Advanced approach (server validation):
- Track both players' positions server-side
- Validate hit distance is reasonable (< 3 units)
- Prevent duplicate hits within short timeframe (100ms)
- Reject suspicious hits

### Health Tracking

- Each player starts with 100 health
- Track health server-side
- When health <= 0, send `game_over` to both players
- The player who dealt the killing blow's ID is the `winner`

### Disconnect Handling

- When a player disconnects:
  - If in room with opponent: send `opponent_left` to opponent
  - If game in progress: opponent wins (send `game_over`)
  - Clean up player from room
  - If room empty, delete room

---

## TypeScript Interfaces

```typescript
// Position in 3D space
interface Position {
  x: number;
  y: number;
  z: number;
}

// Saber rotation angles (radians)
interface SaberRotation {
  x: number;  // Tilt up/down
  y: number;  // Swing left/right
}

// Complete player state sent each update
interface PlayerState {
  position: Position;      // Player world position
  rotation: number;        // Y-axis rotation (radians)
  saberRotation: SaberRotation;
  saberOn: boolean;        // Is lightsaber ignited
  health: number;          // 0-100
}

// Player object for server-side tracking
interface Player {
  id: string;              // Unique player ID (UUID)
  name: string;            // Display name
  socket: WebSocket;       // WebSocket connection
  state: PlayerState;      // Latest known state
  health: number;          // Server-tracked health
}

// Room object
interface Room {
  code: string;            // Room code (e.g., "DUEL4521")
  players: Map<string, Player>;  // playerId -> Player
  createdAt: number;       // Unix timestamp
  gameStarted: boolean;    // Has game begun
}

// Base message structure
interface BaseMessage {
  type: string;
  playerId?: string;
  roomCode?: string;
  timestamp: number;
}

// All possible message types
type MessageType = 
  | 'create_room'
  | 'room_created'
  | 'join_room'
  | 'room_joined'
  | 'opponent_joined'
  | 'opponent_left'
  | 'game_start'
  | 'player_state'
  | 'player_hit'
  | 'player_damaged'
  | 'saber_clash'
  | 'game_over'
  | 'ping'
  | 'pong'
  | 'request_rematch'
  | 'connected'
  | 'error';
```

---

## Example Message Flow

### Successful Match Setup

```
Player A                    Server                    Player B
   |                          |                          |
   |------ connect --------->|                          |
   |<----- connected --------|                          |
   |                          |                          |
   |---- create_room ------->|                          |
   |<--- room_created -------|                          |
   |     (DUEL4521)          |                          |
   |                          |                          |
   |                          |<------ connect ---------|
   |                          |------- connected ------>|
   |                          |                          |
   |                          |<----- join_room --------|
   |                          |     (DUEL4521)          |
   |<-- opponent_joined -----|                          |
   |                          |------ room_joined ----->|
   |                          |                          |
   |<---- game_start --------|-------- game_start ---->|
   |                          |                          |
```

### Gameplay Loop

```
Player A                    Server                    Player B
   |                          |                          |
   |---- player_state ------>|                          |
   |                          |---- player_state ------>|
   |                          |                          |
   |                          |<---- player_state ------|
   |<---- player_state ------|                          |
   |                          |                          |
   |---- player_hit -------->|                          |
   |   (damage: 15)          |                          |
   |<-- player_damaged ------|                          |
   |   (newHealth: 85)       |                          |
   |                          |------ player_hit ------>|
   |                          |    (damage: 15)         |
   |                          |                          |
```

### Game Over

```
Player A                    Server                    Player B
   |                          |                          |
   |---- player_hit -------->|                          |
   |   (final blow)          |                          |
   |                          |                          |
   |<---- game_over ---------|------- game_over ------>|
   |   (winner: A's ID)      |    (winner: A's ID)     |
   |                          |                          |
```

---

## Configuration Constants

These values are used by the frontend and should be considered when implementing the backend:

| Constant | Value | Description |
|----------|-------|-------------|
| Max Health | 100 | Starting health for each player |
| Update Rate | 50ms | Client sends state every 50ms |
| Ping Interval | 2000ms | Client sends ping every 2 seconds |
| Interpolation Delay | 100ms | Client renders opponent 100ms behind |
| Arena Radius | 15 units | Players confined within this radius |
| Player Height | 1.7 units | Y position of player camera |

---

## Testing Checklist

- [ ] WebSocket connection establishes successfully
- [ ] `connected` message sent with unique playerId
- [ ] Room creation generates unique codes
- [ ] Room joining works with valid code
- [ ] Error returned for invalid/full room
- [ ] `opponent_joined` sent to waiting player
- [ ] `game_start` sent to both players
- [ ] `player_state` relayed to opponent only
- [ ] `player_hit` processed and health updated
- [ ] `game_over` sent when health reaches 0
- [ ] `opponent_left` sent on disconnect
- [ ] `ping`/`pong` working for latency measurement
- [ ] Rooms cleaned up after players leave

---

## Notes for Implementation

1. **Framework Suggestions:**
   - Node.js: `ws` library
   - Python: `websockets` library
   - Go: `gorilla/websocket`

2. **Scaling Considerations:**
   - For single server: In-memory room storage is fine
   - For multiple servers: Use Redis for room/player state

3. **Security (Production):**
   - Use `wss://` (WebSocket Secure)
   - Implement rate limiting
   - Validate all incoming messages
   - Consider authentication tokens

4. **Performance:**
   - Keep message relay minimal (no heavy processing)
   - Target < 50ms server processing time
   - Consider geographic server distribution for low latency
