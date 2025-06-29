class ElectroluxController {
  constructor() {
    this.currentApplianceId = null;
    this.currentState = {};
    this.isSwingOn = false;
    this.isSleepModeOn = false;
    this.targetTemperature = 24;
    this.currentMode = 'COOL'; // Default to COOL mode (valid according to API)
    this.currentFanSpeed = 'AUTO';
    this.temperatureUnit = 'CELSIUS'; // Always use CELSIUS
    this.alerts = [];
    
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.checkConnection();
    await this.loadAppliances();
    this.startPeriodicUpdates();
  }

  bindEvents() {
    // Device selection
    document.getElementById('deviceSelect').addEventListener('change', (e) => {
      this.selectAppliance(e.target.value);
    });

    document.getElementById('refreshDevices').addEventListener('click', () => {
      this.loadAppliances();
    });

    // Temperature controls
    document.getElementById('tempUp').addEventListener('click', () => {
      this.adjustTemperature(1);
    });

    document.getElementById('tempDown').addEventListener('click', () => {
      this.adjustTemperature(-1);
    });

    // Mode controls
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this.setMode(mode);
      });
    });

    // Fan speed controls
    document.querySelectorAll('.fan-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = btn.dataset.speed;
        this.setFanSpeed(speed);
      });
    });

    // Swing control
    document.getElementById('swingToggle').addEventListener('click', () => {
      this.toggleSwing();
    });

    // Sleep mode control
    document.getElementById('sleepToggle').addEventListener('click', () => {
      this.toggleSleepMode();
    });


    // Power controls
    document.getElementById('powerOff').addEventListener('click', () => {
      this.setPower('OFF');
    });

    document.getElementById('powerOn').addEventListener('click', () => {
      this.setPower('ON');
    });

    // Status refresh
    document.getElementById('refreshStatus').addEventListener('click', () => {
      this.refreshStatus();
    });

    // Debug: Add capabilities check
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        this.debugCapabilities();
      }
      // Force refresh status
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        console.log('🔄 Force refreshing status...');
        this.refreshStatus(true);
      }
      // Debug current state
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        console.log('📊 Current device state:', this.currentState);
        console.log('🔌 Connection info:', {
          topLevelConnection: this.currentState?.connectionState,
          propertiesConnectivity: this.currentState?.properties?.reported?.connectivityState,
          deviceStatusElement: document.getElementById('deviceStatus')?.textContent,
          connectionStatusElement: document.getElementById('deviceConnectionStatus')?.textContent
        });
      }
    });
  }

  async checkConnection() {
    try {
      await electroluxClient.checkHealth();
      this.updateConnectionStatus(true, '服务器连接正常');
    } catch (error) {
      this.updateConnectionStatus(false, '服务器连接失败');
      this.showError('无法连接到服务器，请检查网络连接');
    }
  }

  async loadAppliances() {
    this.showLoading('加载设备列表...');
    
    try {
      const response = await electroluxClient.getAppliances();
      const appliances = response.data || [];
      
      this.populateDeviceSelect(appliances);
      
      // Auto-select first device or test device
      if (appliances.length > 0) {
        const testId = '950011716506019911110697';
        const testDevice = appliances.find(a => (a.applianceId || a.id) === testId);
        const selectedId = testDevice ? testId : (appliances[0].applianceId || appliances[0].id);
        
        document.getElementById('deviceSelect').value = selectedId;
        await this.selectAppliance(selectedId);
      } else {
        // If no appliances from API, use test device
        this.addTestDevice();
      }
    } catch (error) {
      console.error('Failed to load appliances:', error);
      this.showError('加载设备列表失败: ' + error.message);
      this.addTestDevice();
    } finally {
      this.hideLoading();
    }
  }

  populateDeviceSelect(appliances) {
    const select = document.getElementById('deviceSelect');
    select.innerHTML = '<option value="">选择设备...</option>';
    
    appliances.forEach(appliance => {
      const option = document.createElement('option');
      option.value = appliance.applianceId || appliance.id;
      option.textContent = appliance.applianceName || appliance.name || `设备 ${appliance.applianceId || appliance.id}`;
      select.appendChild(option);
    });

    select.disabled = false;
  }

  addTestDevice() {
    const select = document.getElementById('deviceSelect');
    select.innerHTML = '<option value="">选择设备...</option>';
    
    const option = document.createElement('option');
    option.value = '950011716506019911110697';
    option.textContent = 'Electrolux AC (测试设备)';
    select.appendChild(option);
    
    select.disabled = false;
    select.value = '950011716506019911110697';
    this.selectAppliance('950011716506019911110697');
  }

  async selectAppliance(applianceId) {
    if (!applianceId) {
      this.currentApplianceId = null;
      this.disableControls();
      return;
    }

    this.currentApplianceId = applianceId;
    this.showLoading('加载设备信息...');

    try {
      // Load device info and state in parallel
      const [infoResponse, stateResponse] = await Promise.allSettled([
        electroluxClient.getApplianceInfo(applianceId),
        electroluxClient.getApplianceState(applianceId)
      ]);

      // Update device info - extract appliance name from appliances list or info
      let deviceInfo = null;
      if (infoResponse.status === 'fulfilled') {
        const info = infoResponse.value.data;
        const applianceInfo = info.applianceInfo;
        deviceInfo = {
          applianceName: `${applianceInfo?.brand || 'ELECTROLUX'} ${applianceInfo?.model || '空调'}`,
          deviceType: applianceInfo?.deviceType,
          model: applianceInfo?.model,
          variant: applianceInfo?.variant,
          connectionState: 'Unknown' // Info API doesn't have connection state
        };
      }

      // Update device state and get connection info from state
      if (stateResponse.status === 'fulfilled') {
        const stateData = stateResponse.value.data;
        this.updateDeviceState(stateData);
        
        // Update device info with connection state from state API  
        if (deviceInfo) {
          // Pass the connection state from state API to updateDeviceInfo
          this.updateDeviceInfo(deviceInfo, stateData.connectionState);
        } else {
          deviceInfo = {
            applianceName: '空调',
            connectionState: stateData.connectionState
          };
          this.updateDeviceInfo(deviceInfo);
        }
      } else {
        console.warn('Could not load device state, using defaults');
        this.updateDeviceState({});
        if (deviceInfo) {
          this.updateDeviceInfo(deviceInfo);
        }
      }

      this.enableControls();
      this.showSuccess('设备加载成功');
      
      // Ensure power button states are correct after enabling controls
      if (stateResponse.status === 'fulfilled') {
        const stateData = stateResponse.value.data;
        const properties = stateData?.properties?.reported || {};
        const applianceState = properties.applianceState;
        const actualPowerState = applianceState?.toLowerCase() === 'off' ? 'off' : 'running';
        this.updatePowerButtons(actualPowerState);
      }
    } catch (error) {
      console.error('Failed to select appliance:', error);
      this.showError('加载设备失败: ' + error.message);
      this.disableControls();
    } finally {
      this.hideLoading();
    }
  }

  updateDeviceInfo(info, forceConnectionState = null) {
    const deviceName = document.getElementById('deviceName');
    const deviceStatus = document.getElementById('deviceStatus');
    
    if (info) {
      deviceName.textContent = info.applianceName || info.name || '未知设备';
      
      // Use forced connection state if provided (from state API), otherwise use info
      const connectionState = forceConnectionState || info.connectionState;
      const isConnected = connectionState?.toLowerCase() === 'connected';
      
      deviceStatus.textContent = isConnected ? '在线' : '离线';
      deviceStatus.className = `device-status ${isConnected ? 'online' : 'offline'}`;
      
      // Also update header connection status
      this.updateConnectionStatus(isConnected, isConnected ? '设备已连接' : '设备未连接');
    } else {
      deviceName.textContent = '测试设备';
      deviceStatus.textContent = '未知';
      deviceStatus.className = 'device-status unknown';
    }

    document.getElementById('deviceInfo').style.display = 'flex';
  }

  updateDeviceState(state) {
    this.currentState = state || {};
    
    // Extract properties from the actual API response structure
    const properties = state?.properties?.reported || {};
    
    console.log('🔍 Updating device state with properties:', properties);
    
    // Always use Celsius temperature
    const currentTemp = properties.ambientTemperatureC;
    const targetTemp = properties.targetTemperatureC || 24;
    
    document.getElementById('currentTemp').textContent = currentTemp || '--';
    document.getElementById('targetTemp').textContent = targetTemp;
    this.targetTemperature = targetTemp;

    // Update mode - handle case where mode might be OFF after power on
    const mode = properties.mode ? properties.mode.toUpperCase() : 'COOL';
    this.currentMode = mode;
    this.updateModeButtons(mode.toUpperCase());
    
    // Update power state based on applianceState (the actual device state)
    const applianceState = properties.applianceState;
    // Use applianceState as the source of truth for power status
    const actualPowerState = applianceState?.toLowerCase() === 'off' ? 'off' : 'running';
    
    this.updatePowerButtons(actualPowerState);
    
    // Update connection state - check multiple sources (case-insensitive)
    const topLevelConnectionState = state?.connectionState;
    const propertiesConnectivityState = properties.connectivityState;
    const isConnected = 
      topLevelConnectionState?.toLowerCase() === 'connected' || 
      propertiesConnectivityState?.toLowerCase() === 'connected';
    
    console.log('💡 Power and connection state update:', {
      mode: mode,
      applianceState: applianceState,
      isOn: applianceState?.toLowerCase() === 'running',
      topLevelConnectionState: topLevelConnectionState,
      propertiesConnectivityState: propertiesConnectivityState,
      isConnected: isConnected,
      fullState: state
    });
    
    // Update device info panel
    const deviceStatus = document.getElementById('deviceStatus');
    if (deviceStatus) {
      deviceStatus.textContent = isConnected ? '在线' : '离线';
      deviceStatus.className = `device-status ${isConnected ? 'online' : 'offline'}`;
    }
    
    // Update header connection status
    this.updateConnectionStatus(isConnected, isConnected ? '设备已连接' : '设备未连接');

    // Update fan speed - using actual property path
    const fanSpeed = (properties.fanSpeedSetting || 'AUTO').toUpperCase();
    this.currentFanSpeed = fanSpeed;
    this.updateFanSpeedButtons(fanSpeed);

    // Update swing - check if this property exists in real API (case-insensitive)
    const swing = properties.verticalSwing;
    this.isSwingOn = swing?.toLowerCase() === 'on' || swing === true;
    this.updateSwingButton(this.isSwingOn);

    // Update sleep mode - confirmed in API example (case-insensitive)
    const sleepMode = properties.sleepMode;
    this.isSleepModeOn = sleepMode?.toLowerCase() === 'on' || sleepMode === true;
    this.updateSleepModeButton(this.isSleepModeOn);

    // Update alerts - from API example
    this.alerts = properties.alerts || [];
    this.updateAlertsDisplay();

    // Update status display
    this.updateStatusDisplay(state);
  }

  updateModeButtons(activeMode) {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === activeMode);
    });
  }

  updatePowerButtons(powerState) {
    // Based on applianceState: 'off' = OFF, anything else = ON
    const isOn = powerState?.toLowerCase() !== 'off';
    
    const powerOffBtn = document.getElementById('powerOff');
    const powerOnBtn = document.getElementById('powerOn');
    
    if (isOn) {
      // Device is ON: only OFF button is clickable and active
      powerOffBtn.classList.add('active');
      powerOffBtn.removeAttribute('disabled');
      powerOnBtn.classList.remove('active');
      powerOnBtn.setAttribute('disabled', 'disabled');
    } else {
      // Device is OFF: only ON button is clickable and active
      powerOnBtn.classList.add('active');
      powerOnBtn.removeAttribute('disabled');
      powerOffBtn.classList.remove('active');
      powerOffBtn.setAttribute('disabled', 'disabled');
    }
  }

  updateFanSpeedButtons(activeSpeed) {
    document.querySelectorAll('.fan-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.speed === activeSpeed);
    });
  }

  updateSwingButton(isOn) {
    const btn = document.getElementById('swingToggle');
    const status = document.getElementById('swingStatus');
    
    btn.classList.toggle('active', isOn);
    status.textContent = isOn ? '开启' : '关闭';
  }

  updateSleepModeButton(isOn) {
    const btn = document.getElementById('sleepToggle');
    const status = document.getElementById('sleepStatus');
    
    btn.classList.toggle('active', isOn);
    status.textContent = isOn ? '开启' : '关闭';
  }

  updateStatusDisplay(state) {
    // Extract properties from actual API response structure
    const properties = state?.properties?.reported || {};
    
    // Power status based on applianceState (the actual device state)
    const applianceState = properties.applianceState;
    // Device is ON if applianceState is not 'off'
    const isPowerOn = applianceState?.toLowerCase() !== 'off';
    document.getElementById('powerStatus').textContent = isPowerOn ? '开机' : '关机';
    
    // Update power status color
    const powerStatusElement = document.getElementById('powerStatus');
    powerStatusElement.style.color = isPowerOn ? '#10b981' : '#ef4444';
    powerStatusElement.style.fontWeight = 'bold';
    
    // Mode status
    document.getElementById('modeStatus').textContent = 
      ElectroluxClient.formatMode(properties.mode);
    
    // Fan setting (what user requested)
    document.getElementById('fanStatus').textContent = 
      ElectroluxClient.formatFanSpeed(properties.fanSpeedSetting);
    
    // Actual fan speed state (if available)
    document.getElementById('fanStateStatus').textContent = 
      properties.fanSpeedState ? ElectroluxClient.formatFanSpeed(properties.fanSpeedState) : '跟随设置';
    
    // Swing status - might not exist in all devices
    document.getElementById('swingStatusDisplay').textContent = 
      ElectroluxClient.formatSwing(properties.verticalSwing);
    
    // Sleep mode status - confirmed in API example
    document.getElementById('sleepModeStatus').textContent = 
      ElectroluxClient.formatSleepMode(properties.sleepMode);
    
    // Alert status
    document.getElementById('alertStatus').textContent = 
      this.alerts.length > 0 ? `${this.alerts.length} 个告警` : '正常';
    
    // Network quality from networkInterface
    const networkQuality = properties.networkInterface?.linkQualityIndicator;
    document.getElementById('networkQuality').textContent = 
      ElectroluxClient.formatNetworkQuality(networkQuality);
    
    // Connection status - check both connectionState and connectivityState (case-insensitive)
    const connectionState = state?.connectionState;
    const connectivityState = properties.connectivityState;
    const isConnected = 
      connectionState?.toLowerCase() === 'connected' || 
      connectivityState?.toLowerCase() === 'connected';
    
    const connectionStatusElement = document.getElementById('deviceConnectionStatus');
    connectionStatusElement.textContent = isConnected ? '在线' : '离线';
    connectionStatusElement.style.color = isConnected ? '#10b981' : '#ef4444';
    connectionStatusElement.style.fontWeight = 'bold';
    
    // Last update timestamp
    document.getElementById('lastUpdate').textContent = 
      ElectroluxClient.formatTimestamp(new Date().toISOString());
    
    // Log state changes for debugging (API raw data only)
    console.log('📊 API State Data:', {
      mode: properties.mode,
      applianceState: properties.applianceState,
      connectionState: state?.connectionState,
      connectivityState: properties.connectivityState
    });
  }


  updateAlertsDisplay() {
    const alertsSection = document.getElementById('alertsSection');
    const alertsContainer = document.getElementById('alertsContainer');
    
    if (this.alerts.length === 0) {
      alertsSection.style.display = 'none';
      alertsContainer.innerHTML = `
        <div class="no-alerts">
          <i class="fas fa-check-circle"></i>
          <span>暂无告警</span>
        </div>
      `;
    } else {
      alertsSection.style.display = 'block';
      alertsContainer.innerHTML = this.alerts.map(alert => `
        <div class="alert-item">
          <i class="fas fa-exclamation-triangle"></i>
          <span class="alert-code">${alert}</span>
          <span class="alert-desc">${ElectroluxClient.formatAlert(alert)}</span>
        </div>
      `).join('');
    }
  }


  async setPower(power) {
    if (power === 'OFF') {
      // Based on API info: OFF mode is disabled, so use executeCommand only
      await this.sendCommand({
        executeCommand: 'OFF'
      }, '关机');
    } else {
      // For power on, use current device settings
      const properties = this.currentState?.properties?.reported || {};
      const currentMode = this.getCurrentDeviceMode();
      const currentTemp = properties.targetTemperatureC || this.targetTemperature;
      const currentFanSpeed = properties.fanSpeedSetting || 'AUTO';
      
      console.log('🔄 Using current device settings for power on:', {
        mode: currentMode,
        temperature: currentTemp,
        fanSpeed: currentFanSpeed
      });
      
      try {
        // First try: executeCommand ON only
        await this.sendCommand({
          executeCommand: 'ON'
        }, '开机');
      } catch (error1) {
        console.log('executeCommand ON only failed, trying with current settings...');
        try {
          // Second try: Send current device settings without executeCommand
          await this.sendCommand({
            mode: currentMode,
            targetTemperatureC: currentTemp,
            fanSpeedSetting: currentFanSpeed
          }, '开机');
        } catch (error2) {
          console.log('Current settings failed, trying executeCommand + mode only...');
          // Third try: executeCommand + mode only
          await this.sendCommand({
            executeCommand: 'ON',
            mode: currentMode
          }, '开机');
        }
      }
    }
  }

  // Get current mode from device state
  getCurrentDeviceMode() {
    const properties = this.currentState?.properties?.reported || {};
    const currentMode = properties.mode;
    
    console.log('📋 Getting current device mode:', currentMode);
    
    // If device is OFF or mode is invalid, use COOL as fallback
    if (!currentMode || currentMode === 'OFF') {
      return 'COOL';
    }
    
    return currentMode.toUpperCase();
  }

  async adjustTemperature(delta) {
    // Temperature range in Celsius (from API docs)
    const minTemp = 15.56;
    const maxTemp = 32.22;
    
    const newTemp = Math.max(minTemp, Math.min(maxTemp, this.targetTemperature + delta));
    if (newTemp === this.targetTemperature) return;

    this.targetTemperature = Number(newTemp.toFixed(1));
    document.getElementById('targetTemp').textContent = this.targetTemperature;

    const command = {
      mode: this.currentMode,
      targetTemperatureC: this.targetTemperature,
      fanSpeedSetting: this.currentFanSpeed
    };

    await this.sendCommand(command, `设置温度为 ${this.targetTemperature}°C`);
  }

  async setMode(mode) {
    const upperMode = mode.toUpperCase();
    if (upperMode === this.currentMode) return;

    this.currentMode = upperMode;
    this.updateModeButtons(upperMode);

    const command = { mode: upperMode };
    if (upperMode !== 'OFF') {
      command.targetTemperatureC = this.targetTemperature;
      command.fanSpeedSetting = this.currentFanSpeed;
    }

    await this.sendCommand(command, `设置模式为 ${ElectroluxClient.formatMode(upperMode)}`);
  }

  async setFanSpeed(speed) {
    const upperSpeed = speed.toUpperCase();
    if (upperSpeed === this.currentFanSpeed) return;

    this.currentFanSpeed = upperSpeed;
    this.updateFanSpeedButtons(upperSpeed);

    const command = {
      fanSpeedSetting: upperSpeed,
      mode: this.currentMode,
      targetTemperatureC: this.targetTemperature
    };

    await this.sendCommand(command, `设置风速为 ${ElectroluxClient.formatFanSpeed(upperSpeed)}`);
  }

  async toggleSwing() {
    this.isSwingOn = !this.isSwingOn;
    this.updateSwingButton(this.isSwingOn);

    await this.sendCommand({
      verticalSwing: this.isSwingOn ? 'ON' : 'OFF',
      mode: this.currentMode
    }, `${this.isSwingOn ? '开启' : '关闭'}摆风`);
  }

  async toggleSleepMode() {
    this.isSleepModeOn = !this.isSleepModeOn;
    this.updateSleepModeButton(this.isSleepModeOn);

    await this.sendCommand({
      sleepMode: this.isSleepModeOn ? 'ON' : 'OFF',
      mode: this.currentMode
    }, `${this.isSleepModeOn ? '开启' : '关闭'}睡眠模式`);
  }

  async sendCommand(command, description) {
    if (!this.currentApplianceId) {
      this.showError('请先选择设备');
      return;
    }

    // Debug: Log current state before sending command
    console.log('📊 Current device state before command:', this.currentState);
    console.log('🎯 Sending command:', command);

    this.showLoading(`${description}...`);

    try {
      const response = await electroluxClient.controlAppliance(this.currentApplianceId, command);
      console.log('✅ Command response:', response);
      this.showSuccess(`${description}成功`);
      
      // Refresh state after delays to see the change (devices may take time to update)
      setTimeout(() => {
        this.refreshStatus(false);
      }, 3000);
      
      // Check again after longer delay
      setTimeout(() => {
        this.refreshStatus(false);
      }, 8000);
    } catch (error) {
      console.error('Command failed:', error);
      this.showError(`${description}失败: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  async refreshStatus(showMessage = true) {
    if (!this.currentApplianceId) return;

    if (showMessage) this.showLoading('刷新状态...');

    try {
      console.log('🔄 Fetching fresh device state (no cache)...');
      const response = await electroluxClient.getApplianceState(this.currentApplianceId);
      console.log('📥 Fresh state response:', response.data);
      console.log('🔌 Connection state from API:', {
        topLevel: response.data?.connectionState,
        inProperties: response.data?.properties?.reported?.connectivityState
      });
      
      this.updateDeviceState(response.data);
      
      if (showMessage) this.showSuccess('状态已更新');
    } catch (error) {
      console.error('Failed to refresh status:', error);
      if (showMessage) this.showError('刷新状态失败: ' + error.message);
    } finally {
      if (showMessage) this.hideLoading();
    }
  }

  enableControls() {
    // Enable all controls except power buttons (they have their own logic)
    document.querySelectorAll('button[disabled]').forEach(btn => {
      if (btn.id !== 'powerOn' && btn.id !== 'powerOff') {
        btn.disabled = false;
      }
    });
  }

  disableControls() {
    document.querySelectorAll('.temp-btn, .mode-btn, .fan-btn, #swingToggle, #sleepToggle, .power-btn').forEach(btn => {
      btn.disabled = true;
    });
  }

  updateConnectionStatus(connected, message) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    statusDot.className = `status-dot ${connected ? 'online' : 'offline'}`;
    statusText.textContent = message;
  }

  startPeriodicUpdates() {
    // Refresh status every 60 seconds
    setInterval(() => {
      if (this.currentApplianceId) {
        this.refreshStatus(false);
      }
    }, 60000);

    // Check connection every 30 seconds
    setInterval(() => {
      this.checkConnection();
    }, 30000);
  }

  // UI helpers
  showLoading(text = '处理中...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    
    loadingText.textContent = text;
    overlay.style.display = 'flex';
  }

  hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
  }

  showError(message) {
    this.showMessage(message, 'error');
  }

  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  showMessage(message, type) {
    const container = document.getElementById(`${type}Container`);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `${type}-message`;
    messageDiv.innerHTML = `
      <span>${message}</span>
      <button class="close-btn" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(messageDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (messageDiv.parentElement) {
        messageDiv.remove();
      }
    }, 5000);
  }

  // Helper to determine actual power state from multiple indicators
  isDeviceActuallyOn() {
    const properties = this.currentState?.properties?.reported || {};
    
    // Check multiple possible power indicators
    const mode = properties.mode;
    const applianceState = properties.applianceState;
    const executeCommand = properties.executeCommand;
    
    console.log('🔍 Power state indicators:', {
      mode,
      applianceState, 
      executeCommand,
      currentMode: this.currentMode
    });
    
    // Device is ON if:
    // 1. applianceState is 'running' OR
    // 2. mode is not 'off' (AUTO/COOL/DRY/FANONLY indicates it's on)
    const stateLower = applianceState?.toLowerCase();
    const modeLower = mode?.toLowerCase();
    
    return stateLower === 'running' || (modeLower && modeLower !== 'off');
  }

  // Debug method to check device capabilities
  async debugCapabilities() {
    if (!this.currentApplianceId) {
      console.log('No appliance selected');
      return;
    }

    try {
      console.log('🔍 Fetching device capabilities...');
      const response = await electroluxClient.getApplianceCapabilities(this.currentApplianceId);
      console.log('📋 Device Capabilities:', response.data);
      
      // Show supported properties for commands
      if (response.data && typeof response.data === 'object') {
        const writeableProps = [];
        const readOnlyProps = [];
        
        for (const [key, prop] of Object.entries(response.data)) {
          if (prop.access === 'readwrite' || prop.access === 'write') {
            writeableProps.push(key);
          } else if (prop.access === 'read') {
            readOnlyProps.push(key);
          }
        }
        
        console.log('✅ Supported command properties:', writeableProps);
        console.log('ℹ️ Read-only properties:', readOnlyProps);
      }
      
      // Also log current power state analysis
      console.log('⚡ Current power state analysis:', {
        isActuallyOn: this.isDeviceActuallyOn(),
        currentState: this.currentState?.properties?.reported
      });
      
      // Show which properties might be restricted based on current state
      const currentState = this.currentState?.properties?.reported || {};
      console.log('🔒 Current restrictions based on state:', {
        currentMode: currentState.mode,
        applianceState: currentState.applianceState,
        fanSpeedSetting: currentState.fanSpeedSetting,
        sleepMode: currentState.sleepMode
      });
    } catch (error) {
      console.error('Failed to fetch capabilities:', error);
    }
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.electroluxController = new ElectroluxController();
});