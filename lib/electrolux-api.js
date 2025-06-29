const axios = require('axios');

class ElectroluxAPI {
  constructor(apiKey, token) {
    this.apiKey = apiKey;
    this.token = token;
    this.baseURL = 'https://api.developer.electrolux.one/api/v1';
    this.ocpBaseURL = 'https://api.ocp.electrolux.one/api/v1';
    
    // Primary API client
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'x-api-key': this.apiKey,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'accept': '*/*'
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

    // Add response interceptor for better error handling
    this.setupInterceptors();
  }

  setupInterceptors() {
    const responseInterceptor = (response) => {
      console.log(`✅ API Request: ${response.config.method.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
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

  async getAppliances() {
    try {
      console.log('🔍 Fetching appliances list...');
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
      console.log(`🔍 Fetching appliance info for ID: ${applianceId}...`);
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
      console.log(`🔍 Fetching appliance state for ID: ${applianceId}...`);
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
      console.log(`🔍 Fetching appliance capabilities for ID: ${applianceId}...`);
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
      const response = await this.client.put(`/appliances/${applianceId}/command`, command);
      return response.data;
    } catch (error) {
      // For control commands, don't try OCP API as it may have different auth requirements
      console.error('❌ Control command failed:', error.message);
      
      // Provide more specific error messages
      if (error.message.includes('403')) {
        throw new Error('Access forbidden. This may indicate: 1) JWT token expired, 2) Insufficient permissions for control operations, 3) Device not authorized for remote control.');
      } else if (error.message.includes('401')) {
        throw new Error('Authentication failed. Please check your API key and JWT token.');
      } else {
        throw new Error(`Control command failed: ${error.message}`);
      }
    }
  }

  validateCommand(command) {
    // Based on actual device state - OFF mode does appear in state even if marked disabled
    // Allow OFF for compatibility but prefer executeCommand for power control
    const validModes = ['OFF', 'AUTO', 'COOL', 'DRY', 'FANONLY'];
    const validFanSpeeds = ['LOW', 'MIDDLE', 'HIGH', 'AUTO'];
    const validSwingSettings = ['ON', 'OFF'];
    const validSleepModes = ['ON', 'OFF'];
    const validExecuteCommands = ['ON', 'OFF']; // From API docs capabilities
    const validTempRepresentation = ['CELSIUS', 'FAHRENHEIT'];

    if (command.mode && !validModes.includes(command.mode)) {
      throw new Error(`Invalid mode: ${command.mode}. Valid modes: ${validModes.join(', ')}`);
    }

    if (command.executeCommand && !validExecuteCommands.includes(command.executeCommand)) {
      throw new Error(`Invalid execute command: ${command.executeCommand}. Valid commands: ${validExecuteCommands.join(', ')}`);
    }

    if (command.temperatureRepresentation && !validTempRepresentation.includes(command.temperatureRepresentation)) {
      throw new Error(`Invalid temperature representation: ${command.temperatureRepresentation}. Valid representations: ${validTempRepresentation.join(', ')}`);
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

    if (command.targetTemperatureC && (command.targetTemperatureC < 15.56 || command.targetTemperatureC > 32.22)) {
      throw new Error(`Invalid temperature: ${command.targetTemperatureC}°C. Valid range: 15.56-32.22°C`);
    }

    if (command.targetTemperatureF && (command.targetTemperatureF < 60 || command.targetTemperatureF > 90)) {
      throw new Error(`Invalid temperature: ${command.targetTemperatureF}°F. Valid range: 60-90°F`);
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

  // Helper method to get default test appliance ID
  getTestApplianceId() {
    return process.env.TEST_APPLIANCE_ID || '950011716506019911110697';
  }

  // Check if appliance uses DAM (Digital Appliance Model)
  static isDamAppliance(applianceId, applianceType) {
    return applianceId.startsWith('1:') || (applianceType && applianceType.startsWith('DAM_'));
  }

  // Parse DAM appliance capabilities and state
  static parseDamData(data) {
    if (data && data.dataModelVersion) {
      console.log(`📊 DAM Data Model Version: ${data.dataModelVersion}`);
      return {
        isDam: true,
        version: data.dataModelVersion,
        data: data
      };
    }
    return {
      isDam: false,
      data: data
    };
  }

  // Utility method to format temperature
  static formatTemperature(celsius) {
    return `${celsius}°C`;
  }

  // Utility method to format mode for display  
  static formatMode(mode) {
    // Based on actual API info response
    const modeLabels = {
      'OFF': '关机',
      'AUTO': '自动',
      'COOL': '制冷',
      'DRY': '除湿', 
      'FANONLY': '送风'
    };
    return modeLabels[mode] || mode;
  }

  // Utility method to format fan speed for display
  static formatFanSpeed(speed) {
    const speedLabels = {
      'LOW': '低速',
      'MIDDLE': '中速',
      'HIGH': '高速',
      'AUTO': '自动'
    };
    return speedLabels[speed] || speed;
  }
}

module.exports = { ElectroluxAPI };