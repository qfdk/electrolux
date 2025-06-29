class ElectroluxClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}/api${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      console.log(`🌐 API Request: ${config.method || 'GET'} ${endpoint}`);
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (!data.success) {
        throw new Error(data.error?.message || 'API request failed');
      }

      console.log(`✅ API Success: ${endpoint}`);
      return data;
    } catch (error) {
      console.error(`❌ API Error: ${endpoint}`, error);
      throw error;
    }
  }

  async getAppliances() {
    const response = await this.request('/appliances');
    return response;
  }

  async getApplianceInfo(applianceId) {
    const response = await this.request(`/appliances/${applianceId}/info`);
    return response;
  }

  async getApplianceState(applianceId) {
    const response = await this.request(`/appliances/${applianceId}/state`);
    return response;
  }

  async getApplianceCapabilities(applianceId) {
    const response = await this.request(`/appliances/${applianceId}/capabilities`);
    return response;
  }

  async controlAppliance(applianceId, command) {
    const response = await this.request(`/appliances/${applianceId}/control`, {
      method: 'PUT',
      body: JSON.stringify(command)
    });
    return response;
  }

  async checkHealth() {
    const response = await this.request('/health');
    return response;
  }

  async getTokenStatus() {
    const response = await this.request('/token/status');
    return response;
  }

  async refreshToken() {
    const response = await this.request('/token/refresh', {
      method: 'POST'
    });
    return response;
  }



  // Utility methods for command formatting
  static createTemperatureCommand(temperature, mode = null, fanSpeed = null, swing = null) {
    const command = { targetTemperatureC: temperature };
    
    if (mode) command.mode = mode;
    if (fanSpeed) command.fanSpeedSetting = fanSpeed;
    if (swing !== null) command.verticalSwing = swing ? 'ON' : 'OFF';
    
    return command;
  }

  static createModeCommand(mode, temperature = null, fanSpeed = null) {
    const command = { mode };
    
    if (temperature) command.targetTemperatureC = temperature;
    if (fanSpeed) command.fanSpeedSetting = fanSpeed;
    
    return command;
  }

  static createFanSpeedCommand(fanSpeed, mode = null, temperature = null) {
    const command = { fanSpeedSetting: fanSpeed };
    
    if (mode) command.mode = mode;
    if (temperature) command.targetTemperatureC = temperature;
    
    return command;
  }

  static createSwingCommand(swing, mode = null) {
    const command = { verticalSwing: swing ? 'ON' : 'OFF' };
    
    if (mode) command.mode = mode;
    
    return command;
  }

  // Formatting utilities
  static formatTemperature(celsius) {
    return celsius ? `${celsius}°C` : '--';
  }

  static formatMode(mode) {
    // Based on actual API info response
    const modeLabels = {
      'OFF': '关机',
      'AUTO': '自动',
      'COOL': '制冷', 
      'DRY': '除湿',
      'FANONLY': '送风'
    };
    return modeLabels[mode] || mode || '--';
  }

  static formatFanSpeed(speed) {
    const speedLabels = {
      'LOW': '低速',
      'MIDDLE': '中速',
      'HIGH': '高速',
      'AUTO': '自动'
    };
    return speedLabels[speed] || speed || '--';
  }

  static formatSwing(swing) {
    if (swing === 'ON' || swing === true) return '开启';
    if (swing === 'OFF' || swing === false) return '关闭';
    return '--';
  }

  static formatConnectionStatus(online) {
    return online ? '在线' : '离线';
  }

  static formatSleepMode(sleepMode) {
    if (sleepMode === 'ON' || sleepMode === true) return '开启';
    if (sleepMode === 'OFF' || sleepMode === false) return '关闭';
    return '--';
  }

  static formatNetworkQuality(quality) {
    const qualityLabels = {
      'EXCELLENT': '优秀',
      'VERY_GOOD': '很好',
      'GOOD': '良好',
      'POOR': '较差',
      'VERY_POOR': '很差',
      'UNDEFINED': '未知'
    };
    return qualityLabels[quality] || quality || '--';
  }

  static formatAlert(alertCode) {
    const alertLabels = {
      'BUS_HIGH_VOLTAGE': '总线高电压',
      'INDOOR_DEFROST_THERMISTOR_FAULT': '室内除霜温度传感器故障'
    };
    return alertLabels[alertCode] || alertCode;
  }

  static formatTimestamp(timestamp) {
    if (!timestamp) return '--';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return '--';
    }
  }
}

// Global instance
const electroluxClient = new ElectroluxClient();