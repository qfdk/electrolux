const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { ElectroluxAPI } = require('./lib/electrolux-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Electrolux API client
const electroluxAPI = new ElectroluxAPI(
  process.env.ELECTROLUX_API_KEY,
  process.env.ELECTROLUX_TOKEN
);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.get('/api/appliances', async (req, res) => {
  try {
    const appliances = await electroluxAPI.getAppliances();
    res.json({ success: true, data: appliances, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Error getting appliances:', error.message);
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'API_ERROR',
        message: 'Failed to get appliances',
        details: error.message
      }
    });
  }
});

app.get('/api/appliances/:id/info', async (req, res) => {
  try {
    const info = await electroluxAPI.getApplianceInfo(req.params.id);
    res.json({ success: true, data: info, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Error getting appliance info:', error.message);
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'API_ERROR',
        message: 'Failed to get appliance info',
        details: error.message
      }
    });
  }
});

app.get('/api/appliances/:id/state', async (req, res) => {
  try {
    const state = await electroluxAPI.getApplianceState(req.params.id);
    console.log('📊 State API response:', {
      connectionState: state.connectionState,
      applianceState: state.properties?.reported?.applianceState,
      connectivityState: state.properties?.reported?.connectivityState
    });
    res.json({ success: true, data: state, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Error getting appliance state:', error.message);
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'API_ERROR',
        message: 'Failed to get appliance state',
        details: error.message
      }
    });
  }
});

app.get('/api/appliances/:id/capabilities', async (req, res) => {
  try {
    const capabilities = await electroluxAPI.getApplianceCapabilities(req.params.id);
    res.json({ success: true, data: capabilities, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Error getting appliance capabilities:', error.message);
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'API_ERROR',
        message: 'Failed to get appliance capabilities',
        details: error.message
      }
    });
  }
});

app.put('/api/appliances/:id/control', async (req, res) => {
  try {
    console.log(`🎛️ Control request for appliance ${req.params.id}:`, req.body);
    const result = await electroluxAPI.controlAppliance(req.params.id, req.body);
    console.log('✅ Control command successful:', result);
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Error controlling appliance:', error.message);
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'CONTROL_ERROR',
        message: 'Failed to control appliance',
        details: error.message
      }
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Contact support'
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'API endpoint not found',
      details: `${req.method} ${req.originalUrl} is not a valid API endpoint`
    }
  });
});

app.listen(PORT, () => {
  console.log(`🌟 Electrolux AC Controller Server running on port ${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔧 API health check: http://localhost:${PORT}/api/health`);
  
  if (!process.env.ELECTROLUX_API_KEY || !process.env.ELECTROLUX_TOKEN) {
    console.warn('⚠️  Warning: Missing ELECTROLUX_API_KEY or ELECTROLUX_TOKEN environment variables');
  }
});