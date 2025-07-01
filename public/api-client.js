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
        const errorMessage = data?.error?.details || data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      if (!data.success) {
        const errorMessage = data?.error?.details || data?.error?.message || 'API request failed';
        throw new Error(errorMessage);
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




  // Formatting utilities
  static formatTemperature(celsius) {
    return celsius ? `${celsius}°C` : '--';
  }

  static formatMode(mode) {
    // Based on actual API info response
    const modeUpper = typeof mode === 'string' ? mode.toUpperCase() : mode;
    const modeLabels = {
      'OFF': '关机',
      'AUTO': '自动',
      'COOL': '制冷', 
      'DRY': '除湿',
      'FANONLY': '送风'
    };
    return modeLabels[modeUpper] || mode || '--';
  }

  static formatFanSpeed(speed) {
    const speedUpper = typeof speed === 'string' ? speed.toUpperCase() : speed;
    const speedLabels = {
      'LOW': '低速',
      'MIDDLE': '中速',
      'HIGH': '高速',
      'AUTO': '自动'
    };
    return speedLabels[speedUpper] || speed || '--';
  }

  static formatSwing(swing) {
    // Handle both uppercase and lowercase values
    const swingLower = typeof swing === 'string' ? swing.toLowerCase() : swing;
    if (swingLower === 'on' || swing === true) return '开启';
    if (swingLower === 'off' || swing === false) return '关闭';
    return '--';
  }

  static formatConnectionStatus(online) {
    return online ? '在线' : '离线';
  }

  static formatSleepMode(sleepMode) {
    // Handle both uppercase and lowercase values
    const modeLower = typeof sleepMode === 'string' ? sleepMode.toLowerCase() : sleepMode;
    if (modeLower === 'on' || sleepMode === true) return '开启';
    if (modeLower === 'off' || sleepMode === false) return '关闭';
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