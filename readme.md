# Flow Events Monitor - Project Overview

This project is an event-driven system that manages user interactions through a real-time event streaming architecture. It combines Azure authentication, REST API endpoints, and Server-Sent Events (SSE) for bidirectional communication.

## Architecture Overview

The system consists of three main components:

1. **Frontend** (`src/index.html`) - Interactive web interface
2. **API Backend** (`api/`) - Azure Functions for handling connections and events
3. **Event Flows** (`flows/`) - Orchestration workflows (Cloud Flows)

## Authentication

The application uses **Azure Static Web Apps / App Service authentication** via the `/.auth/me` endpoint.

```javascript
// Load current user info
const response = await fetch('/.auth/me');
const clientPrincipal = await response.json();
```

**Features:**
- Login with Azure AD (AAD)
- Logout with redirect
- User details including `userId`, `userDetails`, and `identityProvider`
- Automatically populates the "User" field in event forms

## API Endpoints

### 1. GET `/api/connections`

**Purpose:** Establish a new connection and receive a unique `connectionId`

**Response Codes:**
- `202 Accepted` - New user detected (triggers user creation modal)
- `200 OK` - Returning user, connection established

**Response Body:**
```json
"<unique-connection-id>"
```

**Usage:**
```javascript
const response = await fetch('/api/connections');
if (response.status === 202) {
    // New user detected - show modal
    document.getElementById('new-user-modal').style.display = 'block';
}
const connectionId = await response.json();
```

**Backend Implementation:**
See [`api/src/functions/connections.js`](api/src/functions/connections.js)

---

### 2. POST `/api/events`

**Purpose:** Submit events to the system for processing

**Request Payload:**
```json
{
    "connectionId": "<connection-id>",
    "event": "EventName",
    "version": "1.0",
    "data": { "key": "value" }
}
```

**Field Descriptions:**
- `connectionId` - Unique identifier linking the event to a user session
- `event` - Name of the event being triggered
- `version` - Semantic version of the event schema
- `data` - Custom JSON object with event-specific data (optional)

**Response:** `200 OK` with event processing result

**Usage in Frontend:**
```javascript
const payload = {
    connectionId: connectionId,
    event: 'CreateUser',
    version: '1.0',
    data: { firstName, lastName, email }
};

const response = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});
```

**Backend Implementation:**
See [`api/src/functions/events.js`](api/src/functions/events.js)

---

## Server-Sent Events (SSE) Stream

The application uses **EventSource** for real-time, unidirectional communication from server to client.

### Connection Endpoint

**GET** `https://sanme.azurewebsites.net/api/events/stream?connectionId=<connection-id>`

**Purpose:** Open a persistent SSE connection to receive real-time events

**Connection Lifecycle:**

1. **Open** - Connection established successfully
   ```javascript
   eventSource.onopen = function() {
       console.log('Connected to event stream');
   };
   ```

2. **Events** - Listen for specific event types
   ```javascript
   eventSource.addEventListener("UserCreationSuccess", function(event) {
       console.log('User created:', event.data);
   });
   ```

3. **Error** - Handle disconnections and reconnect
   ```javascript
   eventSource.onerror = function() {
       // Attempt reconnection after 3 seconds
       setTimeout(() => connectToEventStream(), 3000);
   };
   ```

4. **Close** - Clean up on page unload
   ```javascript
   window.addEventListener('beforeunload', function() {
       if (eventSource) eventSource.close();
   });
   ```

### Supported Event Types

| Event | Description |
|-------|-------------|
| `connection` | Server sends back the connectionId |
| `UserCreationSuccess` | User account created successfully |
| `UserCreationFailed` | User creation failed |
| Custom Events | Any event registered in the "Expected return events" field |

---

## User Flow

### New User Experience

1. **Initial Connection** → GET `/api/connections` → Returns `202 Accepted`
2. **Modal Appears** → User prompted to enter firstName, lastName, email
3. **User Creation Event** → POST `/api/events` with `CreateUser` event
4. **Flows Execute** → Backend orchestration processes the event
5. **Success Response** → SSE stream sends `UserCreationSuccess` event
6. **Modal Closes** → User can now interact with the main interface

### Existing User Experience

1. **Connection Established** → GET `/api/connections` → Returns `200 OK`
2. **Stream Connected** → SSE connection opens, listening for events
3. **Create Event** → User fills form and submits
4. **Event Processing** → Backend processes event via flows
5. **Real-time Updates** → Events stream back to client in real-time

---

## Frontend Features

### Event Creation Form

**Fields:**
- **Event Name** - Name of the event to trigger
- **Version** - Semantic version (default: "1.0")
- **User** - Pre-filled with authenticated user ID (read-only)
- **Data** - Optional JSON payload for the event
- **Expected return events** - Comma-separated list of events to listen for

### Event Stream Display

- **Real-time list** of all events received and sent
- **Error highlighting** for failed operations
- **Timestamps** for each event
- **Connection status indicator** (Connected/Disconnected)

### Auto-Reconnection

The SSE connection automatically attempts to reconnect after 3 seconds if disconnected unexpectedly.

---

## Cloud Flows

Backend orchestration is implemented using Cloud Flows (Logic Apps / Power Automate):

| Flow | Purpose |
|------|---------|
| [`CreateUserFlow.json`](flows/CreateUserFlow.json) | Handles new user creation from modal input |
| [`SelectDdlHistoryFlow.json`](flows/SelectDdlHistoryFlow.json) | Retrieves DDL history data |
| [`CreateDdlHistoryTableFlow.json`](flows/CreateDdlHistoryTableFlow.json) | Creates DDL history table |

These flows listen for events from the `/api/events` endpoint and send responses back via the SSE stream.

---

## Development

### Prerequisites
- Node.js (v14+)
- Azure Functions Core Tools
- Azure Static Web Apps CLI (optional, for local testing)

### Running Locally

1. **Install API dependencies:**
   ```bash
   cd api
   npm install
   ```

2. **Start Azure Functions:**
   ```bash
   npm start
   ```

3. **Serve frontend:**
   ```bash
   cd src
   sirv-cli
   ```

4. **Access the app:**
   Navigate to `http://localhost:3000` (or configured port)

### Local Testing

For local development, update the hardcoded URL in `index.html` to point to your local API:
```javascript
const baseUrl = '/api'; // or http://localhost:7071/api for local functions
```

---

## Error Handling

The frontend includes robust error handling:

- **Invalid JSON** - User notified if event data is malformed
- **Network Errors** - Displayed in event stream with error styling
- **Connection Failures** - Auto-reconnection attempts with user notification
- **API Errors** - HTTP status codes and error messages logged to event stream

---

## Security Considerations

- ✅ **Authentication Required** - All requests tied to authenticated user
- ✅ **Connection ID Isolation** - Each session has unique connectionId
- ✅ **User Context** - Events include userId for audit trails
- ⚠️ **CORS** - Ensure proper CORS configuration for cross-domain requests
- ⚠️ **Input Validation** - Backend should validate all event payloads

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Failed to get connection ID" | Check API is running and `/api/connections` endpoint is accessible |
| "Connection error occurred" | Check browser console for CORS errors; verify SSE endpoint URL |
| Modal doesn't appear on new user | Verify API returns `202` status code for new users |
| Events not streaming | Confirm SSE connection is open; check browser DevTools Network tab |
| User not logged in | Verify `/.auth/me` endpoint is configured; check AAD settings |

---

## References

- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [Azure Functions Documentation](https://learn.microsoft.com/en-us/azure/azure-functions/)
- [Azure Static Web Apps Authentication](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization)
