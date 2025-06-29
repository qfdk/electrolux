const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { ElectroluxAPI } = require('./lib/electrolux-api');
const TokenStorage = require('./lib/token-storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize token storage
const tokenStorage = new TokenStorage();
let electroluxAPI = null;

// Initialize API client with token management
async function initializeAPI() {
  try {
    // Load tokens from file first
    await tokenStorage.loadTokens();
    const storedTokens = tokenStorage.getTokens();
    
    // Use stored tokens if available, otherwise use environment variables
    const accessToken = storedTokens.accessToken || process.env.ELECTROLUX_TOKEN;
    const refreshToken = storedTokens.refreshToken || process.env.ELECTROLUX_REFRESH_TOKEN;
    
    if (!accessToken) {
      throw new Error('No access token available in storage or environment');
    }
    
    console.log('🔧 Initializing API client with stored tokens...');
    electroluxAPI = new ElectroluxAPI(
      process.env.ELECTROLUX_API_KEY,
      accessToken,
      refreshToken
    );
    
    // Set token expiry if we have it from storage
    if (storedTokens.expiryTime) {
      const expiresIn = Math.max(0, Math.floor((storedTokens.expiryTime - Date.now()) / 1000));
      electroluxAPI.setTokenExpiry(expiresIn);
    }
    
    // Set up token refresh callback to save to file
    electroluxAPI.setTokenRefreshCallback(async (newAccessToken, newRefreshToken, expiresIn) => {
      console.log('🔄 Token refreshed, saving to file...');
      try {
        await tokenStorage.saveTokens(newAccessToken, newRefreshToken, expiresIn);
        console.log('✅ New tokens saved to file successfully');
      } catch (error) {
        console.error('❌ Failed to save tokens to file:', error.message);
      }
    });
    
    console.log('✅ API client initialized successfully');
    
    // Log token status
    const tokenInfo = tokenStorage.getTokenInfo();
    console.log('📊 Token status:', {
      hasTokens: tokenInfo.hasAccessToken && tokenInfo.hasRefreshToken,
      expiresIn: tokenInfo.expiresInSeconds ? `${Math.floor(tokenInfo.expiresInSeconds / 60)} minutes` : 'unknown',
      isExpired: tokenInfo.isExpired
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize API client:', error.message);
    throw error;
  }
}

// Middleware to ensure API is initialized
const ensureAPIInitialized = (req, res, next) => {
  if (!electroluxAPI) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'API_NOT_INITIALIZED',
        message: 'API client not initialized yet',
        details: 'Server is still starting up'
      }
    });
  }
  next();
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.get('/api/appliances', ensureAPIInitialized, async (req, res) => {
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

app.get('/api/appliances/:id/info', ensureAPIInitialized, async (req, res) => {
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

app.get('/api/appliances/:id/state', ensureAPIInitialized, async (req, res) => {
  try {
    const state = await electroluxAPI.getApplianceState(req.params.id);
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

app.get('/api/appliances/:id/capabilities', ensureAPIInitialized, async (req, res) => {
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

app.put('/api/appliances/:id/control', ensureAPIInitialized, async (req, res) => {
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

// Token status endpoint
app.get('/api/token/status', (req, res) => {
  const tokenInfo = tokenStorage.getTokenInfo();
  
  res.json({
    success: true,
    data: {
      ...tokenInfo,
      apiInitialized: !!electroluxAPI,
      expiresInMinutes: tokenInfo.expiresInSeconds ? Math.floor(tokenInfo.expiresInSeconds / 60) : null
    },
    timestamp: new Date().toISOString()
  });
});

// Manual token refresh endpoint
app.post('/api/token/refresh', ensureAPIInitialized, async (req, res) => {
  try {
    await electroluxAPI.refreshAccessToken();
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual token refresh failed:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'TOKEN_REFRESH_ERROR',
        message: 'Failed to refresh token',
        details: error.message
      }
    });
  }
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

app.listen(PORT, async () => {
  console.log(`🌟 Electrolux AC Controller Server running on port ${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔧 API health check: http://localhost:${PORT}/api/health`);
  
  // Initialize API client with token management
  try {
    await initializeAPI();
  } catch (error) {
    console.error('❌ Failed to initialize API client:', error.message);
    console.warn('⚠️  Server started but API client is not available');
    console.warn('   Check your tokens and try restarting the server');
  }
});