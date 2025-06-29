const axios = require('axios');

class ElectroluxAPI {
  constructor(apiKey, token, refreshToken = null) {
    this.apiKey = apiKey;
    this.token = token;
    this.refreshToken = refreshToken;
    this.baseURL = 'https://api.developer.electrolux.one/api/v1';
    this.ocpBaseURL = 'https://api.ocp.electrolux.one/api/v1';
    this.tokenExpiryTime = null;
    this.isRefreshing = false;
    
    // Primary API client
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'accept': 'application/json',
        'x-api-key': this.apiKey,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // OCP API client (fallback)
    this.ocpClient = axios.create({
      baseURL: this.ocpBaseURL,
      headers: {
        'x-api-key': this.apiKey,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'accept': '*/*'
      },
      timeout: 10000
    });

    // Add interceptors for better error handling and token refresh
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor to check token expiry
    this.client.interceptors.request.use(
      async (config) => {
        await this.ensureValidToken();
        config.headers.Authorization = `Bearer ${this.token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.ocpClient.interceptors.request.use(
      async (config) => {
        await this.ensureValidToken();
        config.headers.Authorization = `Bearer ${this.token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptors
    const responseInterceptor = (response) => {
      return response;
    };

    const errorInterceptor = (error) => {
      if (error.response) {
        console.error(`❌ API Error: ${error.response.status} - ${error.response.statusText}`);
        console.error('Response data:', error.response.data);
        throw new Error(`API Error ${error.response.status}: ${error.response.data.message || error.response.statusText}`);
      } else if (error.request) {
        console.error('❌ Network Error:', error.message);
        throw new Error(`Network Error: ${error.message}`);
      } else {
        console.error('❌ Request Error:', error.message);
        throw new Error(`Request Error: ${error.message}`);
      }
    };

    this.client.interceptors.response.use(responseInterceptor, errorInterceptor);
    this.ocpClient.interceptors.response.use(responseInterceptor, errorInterceptor);
  }

  // Token management methods
  async ensureValidToken() {
    if (!this.refreshToken) {
      console.log('⚠️ No refresh token available, using current token');
      return;
    }

    // Check if token is expired or will expire soon (5 minutes buffer)
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    if (this.tokenExpiryTime && Date.now() < this.tokenExpiryTime - bufferTime) {
      return; // Token is still valid
    }

    if (this.isRefreshing) {
      // Wait for ongoing refresh to complete
      await this.waitForTokenRefresh();
      return;
    }

    await this.refreshAccessToken();
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    console.log('🔄 Refreshing access token...');
    this.isRefreshing = true;

    try {
      const response = await axios.post(
        `${this.baseURL}/token/refresh`,
        { refreshToken: this.refreshToken },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'accept': 'application/json'
          }
        }
      );

      const { accessToken, refreshToken, expiresIn } = response.data;
      
      this.token = accessToken;
      this.refreshToken = refreshToken;
      this.tokenExpiryTime = Date.now() + (expiresIn * 1000);

      console.log(`✅ Token refreshed successfully. Expires in ${expiresIn} seconds`);
      
      // Emit event for server to update environment
      this.onTokenRefresh && this.onTokenRefresh(accessToken, refreshToken, expiresIn);
      
    } catch (error) {
      console.error('❌ Failed to refresh token:', error.message);
      throw new Error(`Token refresh failed: ${error.message}`);
    } finally {
      this.isRefreshing = false;
    }
  }

  async waitForTokenRefresh() {
    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 100; // 100ms
    let waitedTime = 0;

    while (this.isRefreshing && waitedTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitedTime += checkInterval;
    }

    if (this.isRefreshing) {
      throw new Error('Token refresh timeout');
    }
  }

  // Method to set token refresh callback
  setTokenRefreshCallback(callback) {
    this.onTokenRefresh = callback;
  }

  // Method to manually set token expiry time (if known from initial auth)
  setTokenExpiry(expiresIn) {
    this.tokenExpiryTime = Date.now() + (expiresIn * 1000);
    console.log(`🕒 Token expiry set to ${new Date(this.tokenExpiryTime).toISOString()}`);
  }


  async getAppliances() {
    try {
      const response = await this.client.get('/appliances');
      return response.data;
    } catch (error) {
      console.log('⚠️ Primary API failed, trying OCP API...');
      try {
        const response = await this.ocpClient.get('/appliances');
        return response.data;
      } catch (ocpError) {
        throw new Error(`Both APIs failed - Primary: ${error.message}, OCP: ${ocpError.message}`);
      }
    }
  }

  async getApplianceInfo(applianceId) {
    try {
      const response = await this.client.get(`/appliances/${applianceId}/info`);
      return response.data;
    } catch (error) {
      console.log('⚠️ Primary API failed, trying OCP API...');
      try {
        const response = await this.ocpClient.get(`/appliances/${applianceId}/info`);
        return response.data;
      } catch (ocpError) {
        throw new Error(`Both APIs failed - Primary: ${error.message}, OCP: ${ocpError.message}`);
      }
    }
  }

  async getApplianceState(applianceId) {
    try {
      const response = await this.client.get(`/appliances/${applianceId}/state`);
      return response.data;
    } catch (error) {
      console.log('⚠️ Primary API failed, trying OCP API...');
      try {
        const response = await this.ocpClient.get(`/appliances/${applianceId}/state`);
        return response.data;
      } catch (ocpError) {
        throw new Error(`Both APIs failed - Primary: ${error.message}, OCP: ${ocpError.message}`);
      }
    }
  }

  async getApplianceCapabilities(applianceId) {
    try {
      const response = await this.client.get(`/appliances/${applianceId}/capabilities`);
      return response.data;
    } catch (error) {
      console.log('⚠️ Primary API failed, trying OCP API...');
      try {
        const response = await this.ocpClient.get(`/appliances/${applianceId}/capabilities`);
        return response.data;
      } catch (ocpError) {
        throw new Error(`Both APIs failed - Primary: ${error.message}, OCP: ${ocpError.message}`);
      }
    }
  }

  async controlAppliance(applianceId, command) {
    console.log(`🎛️ Sending control command to appliance ${applianceId}:`, command);
    
    // Check token expiration before sending control commands
    if (this.isTokenExpired()) {
      console.warn('⚠️ JWT Token appears to be expired');
      throw new Error('JWT Token expired. Please refresh your token.');
    }
    
    // Validate command parameters
    this.validateCommand(command);
    
    try {
      // Use PUT method and encode appliance ID for special characters
      const encodedApplianceId = encodeURIComponent(applianceId);
      const response = await this.client.put(`/appliances/${encodedApplianceId}/command`, command);
      return response.data;
    } catch (error) {
      console.error('❌ Control command failed:', error.message);
      
      // Handle specific API validation errors based on the documentation
      if (error.message.includes('406')) {
        if (error.message.includes('disconnected')) {
          throw new Error('Appliance is disconnected and cannot receive commands.');
        } else if (error.message.includes('Remote control disabled')) {
          throw new Error('Remote control is disabled on this appliance. Please enable it using the physical device or app.');
        } else if (error.message.includes('Access not allowed')) {
          throw new Error('Command not allowed. The appliance may be off or the command may conflict with current state.');
        } else {
          throw new Error('Command validation failed. Please check that the appliance supports this command and is in the correct state.');
        }
      } else if (error.message.includes('403')) {
        throw new Error('Access forbidden. This may indicate: 1) JWT token expired, 2) Insufficient permissions for control operations, 3) Device not authorized for remote control.');
      } else if (error.message.includes('401')) {
        throw new Error('Authentication failed. Please check your API key and JWT token.');
      } else {
        throw new Error(`Control command failed: ${error.message}`);
      }
    }
  }

  validateCommand(command) {
    // Based on actual device capabilities from /info endpoint
    const validModes = ['AUTO', 'COOL', 'DRY', 'FANONLY', 'HEAT']; // OFF is disabled
    const validFanSpeeds = ['LOW', 'MIDDLE', 'HIGH', 'AUTO'];
    const validSwingSettings = ['ON', 'OFF']; // verticalSwing
    const validSleepModes = ['ON', 'OFF'];
    const validExecuteCommands = ['ON', 'OFF'];
    const validUiLockModes = ['ON', 'OFF']; // uiLockMode

    if (command.mode && !validModes.includes(command.mode)) {
      throw new Error(`Invalid mode: ${command.mode}. Valid modes: ${validModes.join(', ')}`);
    }

    if (command.executeCommand && !validExecuteCommands.includes(command.executeCommand)) {
      throw new Error(`Invalid execute command: ${command.executeCommand}. Valid commands: ${validExecuteCommands.join(', ')}`);
    }

    if (command.fanSpeedSetting && !validFanSpeeds.includes(command.fanSpeedSetting)) {
      throw new Error(`Invalid fan speed: ${command.fanSpeedSetting}. Valid speeds: ${validFanSpeeds.join(', ')}`);
    }

    if (command.verticalSwing && !validSwingSettings.includes(command.verticalSwing)) {
      throw new Error(`Invalid swing setting: ${command.verticalSwing}. Valid settings: ${validSwingSettings.join(', ')}`);
    }

    if (command.sleepMode && !validSleepModes.includes(command.sleepMode)) {
      throw new Error(`Invalid sleep mode: ${command.sleepMode}. Valid settings: ${validSleepModes.join(', ')}`);
    }

    if (command.uiLockMode && !validUiLockModes.includes(command.uiLockMode)) {
      throw new Error(`Invalid UI lock mode: ${command.uiLockMode}. Valid settings: ${validUiLockModes.join(', ')}`);
    }

    // Temperature validation based on actual capabilities: min=16, max=32, step=1
    if (command.targetTemperatureC && (command.targetTemperatureC < 16 || command.targetTemperatureC > 32)) {
      throw new Error(`Invalid temperature: ${command.targetTemperatureC}°C. Valid range: 16-32°C`);
    }

    // Timer validation (startTime/stopTime): min=0, max=86400, step=1800 (30min intervals)
    if (command.startTime !== undefined) {
      if (command.startTime < 0 || command.startTime > 86400 || command.startTime % 1800 !== 0) {
        throw new Error(`Invalid start time: ${command.startTime}. Must be 0-86400 seconds in 30-minute intervals`);
      }
    }

    if (command.stopTime !== undefined) {
      if (command.stopTime < 0 || command.stopTime > 86400 || command.stopTime % 1800 !== 0) {
        throw new Error(`Invalid stop time: ${command.stopTime}. Must be 0-86400 seconds in 30-minute intervals`);
      }
    }

    console.log('✅ Command validation passed');
  }

  // JWT Token validation helper
  isTokenExpired() {
    try {
      if (!this.token) {
        console.warn('⚠️ No JWT token provided');
        return true;
      }
      
      const parts = this.token.split('.');
      if (parts.length !== 3) {
        console.warn('⚠️ Invalid JWT token format - should have 3 parts separated by dots');
        return true;
      }
      
      const payload = JSON.parse(atob(parts[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (!payload.exp) {
        console.warn('⚠️ JWT token does not contain expiration time');
        return false; // Assume valid if no exp claim
      }
      
      const isExpired = currentTime >= payload.exp;
      
      if (isExpired) {
        const expiredDate = new Date(payload.exp * 1000);
        console.warn(`⚠️ JWT token expired at: ${expiredDate.toISOString()}`);
      } else {
        const expiresDate = new Date(payload.exp * 1000);
        console.log(`ℹ️ JWT token valid until: ${expiresDate.toISOString()}`);
      }
      
      return isExpired;
    } catch (error) {
      console.warn('⚠️ Could not validate token expiration:', error.message);
      return true;
    }
  }

}

module.exports = { ElectroluxAPI };