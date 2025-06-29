# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Electrolux Air Conditioning Remote Control Web Application - A Node.js/Express.js backend with HTML5/CSS3/JavaScript frontend for controlling Electrolux AC devices via the Electrolux Developer API.

**Key Details:**
- Working Device ID: `950011716506019911110697`
- API Base URL: `https://api.developer.electrolux.one/api/v1`
- Alternative OCP API: `https://api.ocp.electrolux.one` (OnE Connected Platform)
- API Key: `a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6`
- Authentication: x-api-key + Bearer Token (JWT format)
- Developer Portal: `https://portal-eu-nonprod.electrolux.com/`

## Development Commands

### Project Setup
```bash
npm init -y
npm install express axios cors dotenv nodemon
```

### Running the Application
```bash
# Development mode
npm run dev
# or
nodemon server.js

# Production mode
npm start
# or
node server.js
```

### Testing API Endpoints
```bash
# Test device info (known working endpoint)
curl -X 'GET' \
  'https://api.developer.electrolux.one/api/v1/appliances/950011716506019911110697/info' \
  -H 'accept: */*' \
  -H 'x-api-key: a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6' \
  -H 'Authorization: Bearer [JWT_TOKEN]'

# Test other endpoints (to be verified during development)
curl -X 'GET' \
  'https://api.developer.electrolux.one/api/v1/appliances' \
  -H 'accept: */*' \
  -H 'x-api-key: a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6' \
  -H 'Authorization: Bearer [JWT_TOKEN]'
```

## Architecture

### Tech Stack
- **Backend**: Node.js + Express.js
- **HTTP Client**: axios
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **API**: Electrolux Developer API
- **Authentication**: x-api-key + Bearer Token (JWT)

### Project Structure
```
electrolux-ac-controller/
├── package.json
├── server.js                       # Express server main file
├── lib/
│   └── electrolux-api.js           # Electrolux API client
├── public/
│   ├── index.html                  # Main page
│   ├── style.css                   # Styles
│   ├── script.js                   # Frontend main logic
│   └── api-client.js               # Frontend API client
├── .env                            # Environment variables
└── CLAUDE.md
```

### Data Flow
```
Frontend UI → Express Server → Electrolux API → Response → Frontend Update
```

### API Endpoints (from Swagger Documentation)
**Confirmed Working:**
- `GET /api/v1/appliances/{id}/info` - Get device info

**Standard REST Endpoints (to verify):**
- `GET /api/v1/appliances` - Get device list
- `GET /api/v1/appliances/{id}` - Get specific device details
- `GET /api/v1/appliances/{id}/state` - Get device state
- `GET /api/v1/appliances/{id}/capabilities` - Get device capabilities
- `POST /api/v1/appliances/{id}/command` - Send control commands
- `PUT /api/v1/appliances/{id}/settings` - Update device settings
- `GET /api/v1/appliances/{id}/history` - Get historical data

**API Documentation Sources:**
- **Official Swagger**: https://developer.electrolux.one/documentation/reference
- **Developer Portal**: https://portal-eu-nonprod.electrolux.com/
- **Getting Started**: https://developer.electrolux.one/documentation/gettingStarted
- **API Key Guide**: https://developer.electrolux.one/documentation/apiKey
- Note: Documentation requires JavaScript/browser access to view complete API spec

**API Platform Information:**
- **Official API**: Uses `api.developer.electrolux.one` endpoint
- **OCP API**: Alternative OnE Connected Platform at `api.ocp.electrolux.one`
- **Supported Brands**: Electrolux, AEG, Frigidaire, Husqvarna
- **Regions**: EMEA, APAC, NA, LATAM, Frigidaire
- **Third-party Libraries**: Python (`pyelectroluxconnect`), OpenHAB binding available

## Core Features Implementation

### AC Control Commands
```javascript
// Temperature and mode control
{
  "targetTemperatureC": 23,
  "mode": "COOL",              // OFF, COOL, HEAT, DRY, FANONLY, AUTO
  "fanSpeedSetting": "AUTO",   // LOW, MIDDLE, HIGH, AUTO
  "verticalSwing": "ON"        // ON, OFF
}
```

### Supported AC Modes
- `OFF` - Power off
- `COOL` - Cooling mode
- `HEAT` - Heating mode  
- `DRY` - Dehumidify mode
- `FANONLY` - Fan only mode
- `AUTO` - Automatic mode

### Temperature Range
- Minimum: 16°C
- Maximum: 32°C
- Supports decimal values

## Express.js Server Structure

### Main Routes Pattern
```javascript
app.get('/api/appliances', async (req, res) => { /* Get all devices */ });
app.get('/api/appliances/:id/info', async (req, res) => { /* Get device info */ });
app.get('/api/appliances/:id/state', async (req, res) => { /* Get device state */ });
app.post('/api/appliances/:id/control', async (req, res) => { /* Control device */ });
```

### Standard Response Format
```javascript
// Success response
{
  "success": true,
  "data": { /* actual data */ },
  "timestamp": "2025-06-29T10:30:00Z"
}

// Error response
{
  "success": false,
  "error": {
    "code": "API_ERROR",
    "message": "Failed to connect to Electrolux API",
    "details": "Network timeout after 5 seconds"
  }
}
```

## Environment Variables
Required in `.env` file:
```env
ELECTROLUX_API_KEY=your_api_key_here
ELECTROLUX_TOKEN=your_access_token_here
ELECTROLUX_REFRESH_TOKEN=your_refresh_token_here
TEST_APPLIANCE_ID=your_device_id_here
PORT=3000
NODE_ENV=development
```

### Token Management
- **ELECTROLUX_TOKEN**: JWT access token (expires after ~12 hours)
- **ELECTROLUX_REFRESH_TOKEN**: Refresh token for automatic token renewal
- **Automatic Refresh**: Tokens are automatically refreshed 5 minutes before expiry
- **Manual Refresh**: Use `/api/token/refresh` endpoint to manually refresh tokens

## Frontend Requirements

### UI Components
- Device selector dropdown
- Temperature display and controls (16-32°C)
- Mode selection buttons (OFF/COOL/HEAT/DRY/FANONLY/AUTO)
- Fan speed controls (LOW/MIDDLE/HIGH/AUTO)
- Vertical swing toggle
- Real-time status display

### Design Requirements
- Responsive design (mobile and desktop)
- Card-based layout
- Icon-based controls
- Real-time status updates
- Smooth animations and transitions

## API Discovery Methodology

Since the Swagger documentation requires browser access, use this systematic approach to discover actual API capabilities:

### Step 1: Test Known Endpoint
```bash
# Confirmed working - use this to validate authentication
curl -X 'GET' \
  'https://api.developer.electrolux.one/api/v1/appliances/950011716506019911110697/info' \
  -H 'accept: */*' \
  -H 'x-api-key: a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6' \
  -H 'Authorization: Bearer [JWT_TOKEN]'
```

### Step 2: Test Common REST Endpoints
```bash
# Test appliances list
curl -X 'GET' \
  'https://api.developer.electrolux.one/api/v1/appliances' \
  -H 'accept: */*' \
  -H 'x-api-key: a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6' \
  -H 'Authorization: Bearer [JWT_TOKEN]'

# Test device state
curl -X 'GET' \
  'https://api.developer.electrolux.one/api/v1/appliances/950011716506019911110697/state' \
  -H 'accept: */*' \
  -H 'x-api-key: a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6' \
  -H 'Authorization: Bearer [JWT_TOKEN]'

# Test device capabilities
curl -X 'GET' \
  'https://api.developer.electrolux.one/api/v1/appliances/950011716506019911110697/capabilities' \
  -H 'accept: */*' \
  -H 'x-api-key: a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6' \
  -H 'Authorization: Bearer [JWT_TOKEN]'

# Test control command
curl -X 'POST' \
  'https://api.developer.electrolux.one/api/v1/appliances/950011716506019911110697/command' \
  -H 'accept: */*' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6' \
  -H 'Authorization: Bearer [JWT_TOKEN]' \
  -d '{
    "targetTemperatureC": 23,
    "mode": "COOL",
    "fanSpeedSetting": "AUTO"
  }'
```

### Alternative: Test OCP API Endpoints
If the main API doesn't work, try the OnE Connected Platform API:
```bash
# Test OCP API appliances
curl -X 'GET' \
  'https://api.ocp.electrolux.one/api/v1/appliances' \
  -H 'accept: */*' \
  -H 'x-api-key: a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6' \
  -H 'Authorization: Bearer [JWT_TOKEN]'
```

### Step 3: Access Browser-Based Documentation
For complete API specification, access the Swagger documentation using a web browser:
```bash
# Open the official Swagger documentation in browser
open https://developer.electrolux.one/documentation/reference

# Or visit the developer portal
open https://portal-eu-nonprod.electrolux.com/
```

### Step 4: Document Actual Responses
Create a `docs/api-responses.md` file to document actual API responses and capabilities discovered during testing.

**Note on MCP Puppeteer**: If using MCP Puppeteer server, you can programmatically access the JavaScript-based documentation:
```javascript
// Example for future MCP Puppeteer usage
await page.goto('https://developer.electrolux.one/documentation/reference');
await page.waitForSelector('.swagger-ui'); // Wait for Swagger UI to load
const apiSpec = await page.evaluate(() => {
  // Extract API specification from loaded Swagger UI
  return window.ui.spec();
});
```

## Development Strategy

### Phase 1: API Discovery
1. Test known working endpoint (`/appliances/{id}/info`)
2. Systematically test other predicted endpoints
3. Document actual API capabilities and response formats
4. Create data models based on real API responses

### Phase 2: Backend Implementation
1. Set up Express.js server with CORS and JSON middleware
2. Create `ElectroluxAPI` client class in `lib/electrolux-api.js`
3. Implement API proxy routes with error handling
4. Add request caching for device capabilities (long-term) and state (30 seconds)

### Phase 3: Frontend Development
1. Create responsive HTML layout with card-based design
2. Implement `ElectroluxClient` class for frontend API calls
3. Add real-time UI updates and loading states
4. Implement control interactions with immediate feedback

### Phase 4: Integration & Testing
1. End-to-end functionality testing with real device
2. Network error handling and retry logic
3. UI responsiveness optimization
4. API rate limiting considerations

## Security Considerations
- API keys and tokens stored server-side only
- Input validation on all control commands
- CORS configuration for frontend access
- Request frequency limiting to prevent API abuse
- No sensitive data logged or exposed to frontend

## Performance Guidelines
- Cache device capabilities (rarely change)
- Cache device state for 30 seconds max
- Use async/await for all API calls
- Minimize API requests with smart state management
- Implement loading states for all user actions

## Third-Party Resources & Community

### Existing Libraries
- **Python**: `pyelectroluxconnect` - Python client for Electrolux Connectivity Platform
- **OpenHAB**: Electrolux appliance binding for home automation
- **Go**: `github.com/mafredri/electrolux-ocp` - Go client for OCP API

### Community Integration Examples
- **Home Assistant**: Community discussions and integrations for Electrolux/AEG appliances
- **OpenHAB**: Supports automatic discovery and control of Electrolux devices
- **MQTT**: Some implementations support MQTT broker connectivity for real-time updates

### Regional Considerations
- Default library region: EMEA (Europe, Middle East, Africa)
- Other supported regions: APAC, NA, LATAM, Frigidaire
- Region parameter must be set if account created in non-EMEA region
- Different API endpoints may be used for different regions

### API Evolution Notes
- **Legacy**: Electrolux Delta API (retired with Wellbeing App)
- **Current**: Official Electrolux Developer API (api.developer.electrolux.one)
- **Alternative**: OnE Connected Platform (api.ocp.electrolux.one)
- **Future**: API may continue evolving; check official documentation regularly