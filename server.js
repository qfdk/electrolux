const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const cron = require('node-cron');
require('dotenv').config();

const { ElectroluxAPI } = require('./lib/electrolux-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let electroluxAPI = null;

// Initialize API client
async function initializeAPI() {
  try {
    // Use environment variables directly
    const accessToken = process.env.ELECTROLUX_TOKEN;
    const refreshToken = process.env.ELECTROLUX_REFRESH_TOKEN;
    
    if (!accessToken) {
      throw new Error('No access token available in environment');
    }
    
    console.log('🔧 Initializing API client...');
    electroluxAPI = new ElectroluxAPI(
      process.env.ELECTROLUX_API_KEY,
      accessToken,
      refreshToken
    );
    
    // Parse JWT to get expiry time
    try {
      const tokenParts = accessToken.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        if (payload.exp) {
          const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
          electroluxAPI.setTokenExpiry(expiresIn);
        }
      }
    } catch (e) {
      console.warn('Could not parse JWT token expiry');
    }
    
    // Set up token refresh callback to update .env file AND API client
    electroluxAPI.setTokenRefreshCallback(async (newAccessToken, newRefreshToken, expiresIn) => {
      console.log('🔄 Token refreshed, updating .env file and API client...');
      try {
        await updateEnvFile(newAccessToken, newRefreshToken);
        console.log('✅ .env file updated successfully');
        
        // Update process.env in memory
        process.env.ELECTROLUX_TOKEN = newAccessToken;
        if (newRefreshToken) {
          process.env.ELECTROLUX_REFRESH_TOKEN = newRefreshToken;
        }
        
        // Update the current API client instance with new tokens
        electroluxAPI.updateTokens(newAccessToken, newRefreshToken);
        console.log('✅ API client tokens updated successfully');
        
      } catch (error) {
        console.error('❌ Failed to update tokens:', error.message);
      }
    });
    
    console.log('✅ API client initialized successfully');
    
    // Start the token refresh scheduler
    startTokenRefreshScheduler();
    
  } catch (error) {
    console.error('❌ Failed to initialize API client:', error.message);
    throw error;
  }
}

// Function to update .env file
async function updateEnvFile(newAccessToken, newRefreshToken) {
  const envPath = path.join(__dirname, '.env');
  
  try {
    let envContent = await fs.readFile(envPath, 'utf8');
    
    // Update ELECTROLUX_TOKEN
    envContent = envContent.replace(
      /ELECTROLUX_TOKEN=.*/,
      `ELECTROLUX_TOKEN=${newAccessToken}`
    );
    
    // Update ELECTROLUX_REFRESH_TOKEN if provided
    if (newRefreshToken) {
      envContent = envContent.replace(
        /ELECTROLUX_REFRESH_TOKEN=.*/,
        `ELECTROLUX_REFRESH_TOKEN=${newRefreshToken}`
      );
    }
    
    await fs.writeFile(envPath, envContent, 'utf8');
    console.log('📝 .env file has been updated with new tokens');
  } catch (error) {
    console.error('Error updating .env file:', error);
    throw error;
  }
}

// Automatic token refresh scheduler
function startTokenRefreshScheduler() {
  // Schedule task to run every 2 hours: "0 */2 * * *"
  // This means: at minute 0 of every 2nd hour
  const task = cron.schedule('0 */2 * * *', async () => {
    console.log('🕐 Scheduled token refresh started...');
    
    if (!electroluxAPI) {
      console.warn('⚠️ API client not initialized, skipping scheduled refresh');
      return;
    }

    if (!process.env.ELECTROLUX_REFRESH_TOKEN) {
      console.warn('⚠️ No refresh token available, skipping scheduled refresh');
      return;
    }

    try {
      await electroluxAPI.refreshAccessToken();
      console.log('✅ Scheduled token refresh completed successfully');
    } catch (error) {
      console.error('❌ Scheduled token refresh failed:', error.message);
      
      // If it's a rate limiting error, that's expected behavior
      if (error.message.includes('429')) {
        console.log('ℹ️ Rate limited during scheduled refresh - this is normal if tokens were recently refreshed');
      }
    }
  }, {
    scheduled: false, // Don't start immediately
    timezone: "UTC"
  });

  // Start the scheduled task
  task.start();
  console.log('⏰ Token refresh scheduler started - will refresh every 2 hours');
  
  return task;
}

// Manual token refresh function (can be called on-demand)
async function performTokenRefresh() {
  if (!electroluxAPI) {
    throw new Error('API client not initialized');
  }

  if (!process.env.ELECTROLUX_REFRESH_TOKEN) {
    throw new Error('No refresh token available');
  }

  console.log('🔄 Manual token refresh initiated...');
  await electroluxAPI.refreshAccessToken();
  console.log('✅ Manual token refresh completed');
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
  let tokenInfo = {
    hasAccessToken: !!process.env.ELECTROLUX_TOKEN,
    hasRefreshToken: !!process.env.ELECTROLUX_REFRESH_TOKEN,
    apiInitialized: !!electroluxAPI,
    isExpired: false,
    expiryTime: null,
    expiresInSeconds: null,
    expiresInMinutes: null
  };

  // Check token expiry if API is initialized
  if (electroluxAPI) {
    tokenInfo.isExpired = electroluxAPI.isTokenExpired();
    
    // Try to parse JWT to get expiry info
    try {
      const token = process.env.ELECTROLUX_TOKEN;
      if (token) {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          if (payload.exp) {
            tokenInfo.expiryTime = new Date(payload.exp * 1000).toISOString();
            const expiresInSeconds = payload.exp - Math.floor(Date.now() / 1000);
            tokenInfo.expiresInSeconds = Math.max(0, expiresInSeconds);
            tokenInfo.expiresInMinutes = Math.max(0, Math.floor(expiresInSeconds / 60));
          }
        }
      }
    } catch (e) {
      console.error('Error parsing token:', e);
    }
  }
  
  res.json({
    success: true,
    data: tokenInfo,
    timestamp: new Date().toISOString()
  });
});

// Manual token refresh endpoint
app.post('/api/token/refresh', ensureAPIInitialized, async (req, res) => {
  try {
    await performTokenRefresh();
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