class ElectroluxController {
  constructor() {
    this.currentApplianceId = null;
    this.currentState = {};
    this.isSwingOn = false;
    this.isSleepModeOn = false;
    this.targetTemperature = 24;
    this.currentMode = 'COOL'; // Default to COOL mode (valid according to API)
    this.currentFanSpeed = 'AUTO';
    this.alerts = [];
    
    // Temperature adjustment debouncing
    this.temperatureDebounceTimer = null;
    this.pendingTemperature = null;
    this.isTemperatureAdjusting = false;
    
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.checkConnection();
    await this.refreshTokenStatus();
    await this.loadAppliances();
    this.startPeriodicUpdates();
  }

  bindEvents() {
    // Device refresh
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

    // Token status refresh
    document.getElementById('refreshTokenStatus').addEventListener('click', () => {
      this.refreshTokenStatus();
    });

    // Manual token refresh
    document.getElementById('manualRefreshToken').addEventListener('click', () => {
      this.manualRefreshToken();
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
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
      
      // Auto-select first device or test device
      if (appliances.length > 0) {
        const testId = '950011716506019911110697';
        const testDevice = appliances.find(a => (a.applianceId || a.id) === testId);
        const selectedId = testDevice ? testId : (appliances[0].applianceId || appliances[0].id);
        
        await this.selectAppliance(selectedId);
      } else {
        // If no appliances from API, use test device
        this.useTestDevice();
      }
    } catch (error) {
      console.error('Failed to load appliances:', error);
      this.showError('加载设备列表失败: ' + error.message);
      this.useTestDevice();
    } finally {
      this.hideLoading();
    }
  }

  useTestDevice() {
    // Use the known test device ID
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
        
        // Store device capabilities for dynamic UI control
        this.deviceCapabilities = info.capabilities;
        console.log('Device capabilities loaded:', this.deviceCapabilities);
        
        deviceInfo = {
          applianceName: `${applianceInfo?.brand || 'ELECTROLUX'} ${applianceInfo?.model || '空调'}`,
          deviceType: applianceInfo?.deviceType,
          model: applianceInfo?.model,
          variant: applianceInfo?.variant,
          connectionState: 'Unknown' // Info API doesn't have connection state
        };
      }

      // Update device state and get connection info from state
      let connectionState = 'Unknown';
      if (stateResponse.status === 'fulfilled') {
        const stateData = stateResponse.value.data;
        this.updateDeviceState(stateData);
        
        // Get connection state from state data
        const topLevelConnectionState = stateData?.connectionState;
        const propertiesConnectivityState = stateData?.properties?.reported?.connectivityState;
        connectionState = topLevelConnectionState || propertiesConnectivityState || 'Unknown';
      } else {
        console.warn('Could not load device state, using defaults');
        this.updateDeviceState({});
      }

      // Update device info display with connection state
      if (deviceInfo) {
        deviceInfo.connectionState = connectionState;
        this.updateDeviceInfo(deviceInfo);
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


  updateDeviceState(state) {
    this.currentState = state || {};
    
    // Extract properties from the actual API response structure
    const properties = state?.properties?.reported || {};
    
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

  updateDeviceInfo(deviceInfo) {
    const deviceNameEl = document.getElementById('deviceName');
    const deviceOnlineStatusEl = document.getElementById('deviceOnlineStatus');

    if (deviceInfo) {
      deviceNameEl.textContent = deviceInfo.applianceName || '未知设备';
      
      // Update online status with appropriate styling
      const isOnline = deviceInfo.connectionState?.toLowerCase() === 'connected';
      deviceOnlineStatusEl.textContent = isOnline ? '在线' : '离线';
      deviceOnlineStatusEl.className = `device-value ${isOnline ? 'online' : 'offline'}`;
    } else {
      deviceNameEl.textContent = '未知设备';
      deviceOnlineStatusEl.textContent = '离线';
      deviceOnlineStatusEl.className = 'device-value offline';
    }
  }

  updateModeButtons(activeMode) {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === activeMode);
    });
    
    // Update control availability based on current mode
    this.updateControlsAvailability(activeMode);
  }

  updateControlsAvailability(currentMode) {
    // Get restrictions from actual device capabilities (synchronous)
    const restrictions = this.getModeRestrictionsSync(currentMode);

    // Update fan speed buttons
    document.querySelectorAll('.fan-btn').forEach(btn => {
      const speed = btn.dataset.speed;
      const isAllowed = restrictions.allowedFanSpeeds.includes(speed);
      const isReadonly = restrictions.fanSpeedReadonly;
      
      if (!isAllowed || isReadonly) {
        btn.setAttribute('disabled', 'disabled');
        btn.classList.add('disabled');
      } else {
        btn.removeAttribute('disabled');
        btn.classList.remove('disabled');
      }
    });

    // Update temperature controls
    const tempControls = ['tempDown', 'tempUp'];
    tempControls.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        if (restrictions.temperatureDisabled) {
          btn.setAttribute('disabled', 'disabled');
          btn.classList.add('disabled');
        } else {
          btn.removeAttribute('disabled');
          btn.classList.remove('disabled');
        }
      }
    });

    // Update sleep mode button
    const sleepToggle = document.getElementById('sleepToggle');
    if (sleepToggle) {
      if (restrictions.sleepModeDisabled) {
        sleepToggle.setAttribute('disabled', 'disabled');
        sleepToggle.classList.add('disabled');
      } else {
        sleepToggle.removeAttribute('disabled');
        sleepToggle.classList.remove('disabled');
      }
    }
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
    // Temperature range based on actual device capabilities
    const minTemp = 16;
    const maxTemp = 32;
    
    const newTemp = Math.max(minTemp, Math.min(maxTemp, this.targetTemperature + delta));
    if (newTemp === this.targetTemperature) return;

    // Update target temperature immediately for UI responsiveness
    this.targetTemperature = newTemp;
    this.pendingTemperature = newTemp;
    
    // Update display immediately
    document.getElementById('targetTemp').textContent = newTemp;
    
    // Show visual feedback if not already adjusting
    if (!this.isTemperatureAdjusting) {
      this.isTemperatureAdjusting = true;
      this.showTemperatureAdjusting();
    }
    
    // Clear previous timer and set new one
    if (this.temperatureDebounceTimer) {
      clearTimeout(this.temperatureDebounceTimer);
    }
    
    // Set new timer to execute command after user stops clicking (500ms)
    this.temperatureDebounceTimer = setTimeout(async () => {
      await this.executeTemperatureCommand();
    }, 500);
  }

  async executeTemperatureCommand() {
    if (!this.pendingTemperature || !this.isTemperatureAdjusting) return;
    
    const targetTemp = this.pendingTemperature;
    const previousTemp = this.targetTemperature;
    
    try {
      // Send only temperature parameter - device rejects multiple parameters
      const command = {
        targetTemperatureC: targetTemp
      };

      await this.sendCommand(command, `设置温度为 ${targetTemp}°C`);
      
      // Wait and verify temperature change
      await this.waitForTemperatureChange(targetTemp, 15000);
      
      this.showSuccess(`温度已设置为 ${targetTemp}°C`);
      
    } catch (error) {
      console.error('Temperature change failed:', error);
      this.showError(`温度设置失败: ${error.message}`);
      // Revert to previous temperature on failure
      this.targetTemperature = previousTemp;
      document.getElementById('targetTemp').textContent = previousTemp;
    } finally {
      this.hideTemperatureAdjusting();
      this.isTemperatureAdjusting = false;
      this.pendingTemperature = null;
      this.temperatureDebounceTimer = null;
    }
  }

  showTemperatureAdjusting() {
    // Show subtle visual feedback that temperature is being adjusted
    const tempDisplay = document.getElementById('targetTemp');
    if (tempDisplay) {
      tempDisplay.classList.add('loading');
      tempDisplay.style.opacity = '0.8';
    }
    
    // Disable temperature controls to prevent rapid clicking
    const tempControls = ['tempDown', 'tempUp'];
    tempControls.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.style.opacity = '0.7';
      }
    });
  }

  hideTemperatureAdjusting() {
    // Remove visual feedback
    const tempDisplay = document.getElementById('targetTemp');
    if (tempDisplay) {
      tempDisplay.classList.remove('loading');
      tempDisplay.style.opacity = '1';
    }
    
    // Re-enable temperature controls
    const tempControls = ['tempDown', 'tempUp'];
    tempControls.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.style.opacity = '1';
        btn.disabled = false;
      }
    });
  }


  async waitForTemperatureChange(expectedTemp, timeout = 15000) {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every 1 second
    
    while (Date.now() - startTime < timeout) {
      try {
        const state = await electroluxClient.getApplianceState(this.currentApplianceId);
        const currentTemp = state.data?.properties?.reported?.targetTemperatureC;
        
        if (currentTemp === expectedTemp) {
          console.log(`✅ Temperature successfully changed to ${expectedTemp}°C`);
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        console.warn('Error checking temperature change:', error);
      }
    }
    
    throw new Error(`Temperature change to ${expectedTemp}°C did not complete within ${timeout}ms`);
  }

  async setMode(mode) {
    const upperMode = mode.toUpperCase();
    if (upperMode === this.currentMode) return;

    const previousMode = this.currentMode;
    
    // Show loading state immediately
    this.showModeLoading(upperMode);
    
    try {
      // Get current device state and capabilities
      const currentState = await electroluxClient.getApplianceState(this.currentApplianceId);
      const currentProperties = currentState.data?.properties?.reported || {};
      
      // Get fresh capabilities for the target mode
      const modeRestrictions = await this.getModeRestrictions(upperMode, true);
      
      // Build optimal command based on capabilities and current state
      const command = await this.buildOptimalModeCommand(upperMode, currentProperties, modeRestrictions);
      
      // Send the optimized command
      await this.sendCommandSilent(command);
      
      // Wait and verify mode change
      const actualMode = await this.waitForModeChange(upperMode);
      
      // Update current mode after successful change (use actual mode if different)
      const finalMode = typeof actualMode === 'string' ? actualMode : upperMode;
      this.currentMode = finalMode;
      
      if (finalMode === upperMode) {
        this.showSuccess(`模式已切换为 ${ElectroluxClient.formatMode(finalMode)}`);
      } else {
        this.showWarning(`设备自动选择了 ${ElectroluxClient.formatMode(finalMode)} 模式（而非 ${ElectroluxClient.formatMode(upperMode)}）`);
      }
      
    } catch (error) {
      console.error('Mode change failed:', error);
      this.showError(`模式切换失败: ${error.message}`);
      // Revert to previous mode on failure
      this.currentMode = previousMode;
    } finally {
      this.hideModeLoading();
      // Update buttons based on actual current state
      this.updateModeButtons(this.currentMode);
    }
  }

  async buildOptimalModeCommand(targetMode, currentProperties, modeRestrictions) {
    const command = { mode: targetMode };
    
    // Only add additional parameters if they're allowed in the target mode
    // and if they differ from current device state
    
    // Add temperature if it's allowed and we have a target temperature
    if (!modeRestrictions.temperatureDisabled && this.targetTemperature) {
      const currentTemp = currentProperties.targetTemperatureC;
      if (currentTemp !== this.targetTemperature) {
        command.targetTemperatureC = this.targetTemperature;
      }
    }
    
    // Add fan speed if it's writable in the target mode
    if (!modeRestrictions.fanSpeedReadonly && this.currentFanSpeed) {
      const currentFanSpeed = currentProperties.fanSpeedSetting?.toUpperCase();
      if (currentFanSpeed !== this.currentFanSpeed && 
          modeRestrictions.allowedFanSpeeds.includes(this.currentFanSpeed)) {
        command.fanSpeedSetting = this.currentFanSpeed;
      }
    }
    
    // If command has multiple parameters, check if device supports multi-parameter commands
    const paramCount = Object.keys(command).length;
    if (paramCount > 1) {
      console.log(`⚠️ Command has ${paramCount} parameters - device may reject multi-parameter commands`);
      // Return only mode for now, let device handle other parameters automatically
      return { mode: targetMode };
    }
    
    return command;
  }

  showModeLoading(targetMode) {
    // Disable all mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.mode === targetMode) {
        btn.classList.add('loading');
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>切换中...</span>`;
      }
    });
  }

  hideModeLoading() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('loading');
      // Restore original button content based on mode
      const mode = btn.dataset.mode;
      const icon = this.getModeIcon(mode);
      const label = ElectroluxClient.formatMode(mode);
      btn.innerHTML = `<i class="${icon}"></i><span>${label}</span>`;
    });
  }

  getModeIcon(mode) {
    const icons = {
      'AUTO': 'fas fa-magic',
      'COOL': 'fas fa-snowflake', 
      'HEAT': 'fas fa-fire',
      'DRY': 'fas fa-tint',
      'FANONLY': 'fas fa-wind'
    };
    return icons[mode] || 'fas fa-cog';
  }

  async waitForModeChange(expectedMode, timeout = 20000) {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every 1 second
    let lastKnownMode = null;
    
    console.log(`🔄 Waiting for mode change to ${expectedMode}...`);
    
    while (Date.now() - startTime < timeout) {
      try {
        const state = await electroluxClient.getApplianceState(this.currentApplianceId);
        const currentMode = state.data?.properties?.reported?.mode?.toUpperCase();
        
        if (lastKnownMode !== currentMode) {
          console.log(`📱 Device mode is now: ${currentMode}`);
          lastKnownMode = currentMode;
        }
        
        if (currentMode === expectedMode) {
          console.log(`✅ Mode successfully changed to ${expectedMode}`);
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        console.warn('Error checking mode change:', error);
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }
    
    // If we get here, the mode change didn't complete as expected
    const finalState = await electroluxClient.getApplianceState(this.currentApplianceId);
    const finalMode = finalState.data?.properties?.reported?.mode?.toUpperCase();
    
    if (finalMode !== expectedMode) {
      console.log(`⚠️ Mode change timeout. Expected: ${expectedMode}, Actual: ${finalMode}`);
      // Don't throw error if device chose a different mode - this might be intentional
      if (finalMode && finalMode !== 'OFF') {
        console.log(`Device chose ${finalMode} mode instead of ${expectedMode} - this may be due to smart logic`);
        return finalMode; // Return the actual mode instead of throwing
      }
    }
    
    throw new Error(`Mode change to ${expectedMode} did not complete within ${timeout}ms. Device is in ${finalMode} mode.`);
  }

  async getModeRestrictions(mode, refreshCapabilities = false) {
    // Refresh capabilities if requested
    if (refreshCapabilities) {
      await this.refreshCapabilities();
    }

    // Use cached capabilities if available, otherwise use default restrictions
    if (!this.deviceCapabilities) {
      console.warn('Device capabilities not loaded, using default restrictions');
      return this.getDefaultModeRestrictions(mode);
    }

    return this.parseCapabilitiesForMode(mode);
  }

  getModeRestrictionsSync(mode) {
    // Synchronous version for immediate use with cached capabilities
    if (!this.deviceCapabilities) {
      console.warn('Device capabilities not loaded, using default restrictions');
      return this.getDefaultModeRestrictions(mode);
    }

    return this.parseCapabilitiesForMode(mode);
  }

  getDefaultModeRestrictions(mode) {
    const defaultRestrictions = {
      'FANONLY': { fanSpeedReadonly: false, temperatureDisabled: true, sleepModeDisabled: true },
      'DRY': { fanSpeedReadonly: true, temperatureDisabled: true, sleepModeDisabled: true },
      'AUTO': { fanSpeedReadonly: true, temperatureDisabled: false, sleepModeDisabled: false },
      'COOL': { fanSpeedReadonly: false, temperatureDisabled: false, sleepModeDisabled: false },
      'HEAT': { fanSpeedReadonly: false, temperatureDisabled: false, sleepModeDisabled: false }
    };
    return defaultRestrictions[mode] || defaultRestrictions['COOL'];
  }

  parseCapabilitiesForMode(mode) {
    const capabilities = this.deviceCapabilities;
    const restrictions = {
      fanSpeedReadonly: false,
      temperatureDisabled: false,
      sleepModeDisabled: false,
      allowedFanSpeeds: ['AUTO', 'HIGH', 'LOW', 'MIDDLE']
    };

    // Parse mode triggers to find restrictions for this specific mode
    if (capabilities.mode && capabilities.mode.triggers) {
      for (const trigger of capabilities.mode.triggers) {
        const condition = trigger.condition;
        
        // Check if this trigger applies to the specified mode
        if (condition.operand_2 === mode && condition.operator === 'eq') {
          const actions = trigger.action;
          
          // Parse fanSpeedSetting restrictions
          if (actions.fanSpeedSetting) {
            restrictions.fanSpeedReadonly = actions.fanSpeedSetting.access === 'read';
            if (actions.fanSpeedSetting.values) {
              restrictions.allowedFanSpeeds = Object.keys(actions.fanSpeedSetting.values);
            }
          }
          
          // Parse temperature restrictions
          if (actions.targetTemperatureC) {
            restrictions.temperatureDisabled = actions.targetTemperatureC.disabled === true;
          }
          
          // Parse sleep mode restrictions
          if (actions.sleepMode) {
            restrictions.sleepModeDisabled = actions.sleepMode.disabled === true;
          }
          
          break;
        }
      }
    }

    return restrictions;
  }

  async loadDeviceCapabilities(force = false) {
    try {
      // Always reload if forced, or if capabilities not cached
      if (force || !this.deviceCapabilities) {
        console.log('Loading fresh device capabilities...');
        const response = await electroluxClient.getApplianceInfo(this.currentApplianceId);
        this.deviceCapabilities = response.data.capabilities;
        console.log('Device capabilities loaded:', this.deviceCapabilities);
      }
      return this.deviceCapabilities;
    } catch (error) {
      console.error('Failed to load device capabilities:', error);
      this.deviceCapabilities = null;
      return null;
    }
  }

  async refreshCapabilities() {
    return await this.loadDeviceCapabilities(true);
  }

  async setFanSpeed(speed) {
    const upperSpeed = speed.toUpperCase();
    if (upperSpeed === this.currentFanSpeed) return;

    // Get fresh capabilities to check current restrictions
    const modeRestrictions = await this.getModeRestrictions(this.currentMode, true);
    if (modeRestrictions.fanSpeedReadonly) {
      console.log(`Cannot change fan speed in ${this.currentMode} mode - fan speed is read-only`);
      this.showError(`当前模式下无法调节风速`);
      return;
    }

    if (!modeRestrictions.allowedFanSpeeds.includes(upperSpeed)) {
      console.log(`Fan speed ${upperSpeed} not allowed in ${this.currentMode} mode`);
      this.showError(`当前模式下不支持 ${ElectroluxClient.formatFanSpeed(upperSpeed)} 风速`);
      return;
    }

    const previousSpeed = this.currentFanSpeed;
    
    // Show loading state immediately
    this.showFanSpeedLoading(upperSpeed);
    
    try {
      // Send only fan speed parameter - device rejects multiple parameters
      const command = {
        fanSpeedSetting: upperSpeed
      };

      await this.sendCommand(command, `设置风速为 ${ElectroluxClient.formatFanSpeed(upperSpeed)}`);
      
      // Wait and verify fan speed change
      await this.waitForFanSpeedChange(upperSpeed, 5000);
      
      // Update fan speed after successful change
      this.currentFanSpeed = upperSpeed;
      this.showSuccess(`风速已设置为 ${ElectroluxClient.formatFanSpeed(upperSpeed)}`);
      
    } catch (error) {
      console.error('Fan speed change failed:', error);
      this.showError(`风速设置失败: ${error.message}`);
      // Revert to previous fan speed on failure
      this.currentFanSpeed = previousSpeed;
    } finally {
      this.hideFanSpeedLoading();
      // Update buttons based on actual current fan speed
      this.updateFanSpeedButtons(this.currentFanSpeed);
    }
  }

  showFanSpeedLoading(targetSpeed) {
    // Disable all fan speed buttons
    document.querySelectorAll('.fan-btn').forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.speed === targetSpeed) {
        btn.classList.add('loading');
        const originalContent = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>设置中...</span>`;
        btn.dataset.originalContent = originalContent;
      }
    });
  }

  hideFanSpeedLoading() {
    document.querySelectorAll('.fan-btn').forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('loading');
      // Restore original content if it was changed
      if (btn.dataset.originalContent) {
        btn.innerHTML = btn.dataset.originalContent;
        delete btn.dataset.originalContent;
      }
    });
  }

  async waitForFanSpeedChange(expectedSpeed, timeout = 15000) {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every 1 second
    
    while (Date.now() - startTime < timeout) {
      try {
        const state = await electroluxClient.getApplianceState(this.currentApplianceId);
        const currentSpeed = state.data?.properties?.reported?.fanSpeedSetting?.toUpperCase();
        
        if (currentSpeed === expectedSpeed) {
          console.log(`✅ Fan speed successfully changed to ${expectedSpeed}`);
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        console.warn('Error checking fan speed change:', error);
      }
    }
    
    throw new Error(`Fan speed change to ${expectedSpeed} did not complete within ${timeout}ms`);
  }

  async toggleSwing() {
    this.isSwingOn = !this.isSwingOn;
    this.updateSwingButton(this.isSwingOn);

    // Send only swing parameter - device rejects multiple parameters
    await this.sendCommand({
      verticalSwing: this.isSwingOn ? 'ON' : 'OFF'
    }, `${this.isSwingOn ? '开启' : '关闭'}摆风`);
  }

  async toggleSleepMode() {
    this.isSleepModeOn = !this.isSleepModeOn;
    this.updateSleepModeButton(this.isSleepModeOn);

    // Send only sleep mode parameter - device rejects multiple parameters
    await this.sendCommand({
      sleepMode: this.isSleepModeOn ? 'ON' : 'OFF'
    }, `${this.isSleepModeOn ? '开启' : '关闭'}睡眠模式`);
  }

  async sendCommand(command, description) {
    if (!this.currentApplianceId) {
      this.showError('请先选择设备');
      return;
    }


    this.showLoading(`${description}...`);
    this.disableAllButtons(); // 禁用所有按钮防止重复操作

    try {
      const response = await electroluxClient.controlAppliance(this.currentApplianceId, command);
      
      // Wait for state change with polling
      await this.waitForStateChange(command, description);
      
      this.showSuccess(`${description}成功`);
    } catch (error) {
      console.error('Command failed:', error);
      this.showError(`${description}失败: ${error.message}`);
    } finally {
      this.hideLoading();
      this.enableControls(); // 重新启用按钮
    }
  }

  async sendCommandSilent(command) {
    if (!this.currentApplianceId) {
      throw new Error('No appliance selected');
    }

    try {
      const response = await electroluxClient.controlAppliance(this.currentApplianceId, command);
      
      if (!response.success) {
        throw new Error(response.error?.details || '命令发送失败');
      }
      
      console.log('✅ Silent command sent successfully:', command);
      
      // Wait for state changes to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return response;
    } catch (error) {
      console.error('❌ Silent command failed:', error);
      throw error;
    }
  }

  async waitForStateChange(command, description) {
    const maxAttempts = 10; // 最多等待50秒 (5秒 x 10次)
    const delayBetweenAttempts = 5000; // 每5秒检查一次
    
    // 记录预期的状态变化
    const expectedChanges = this.getExpectedStateChanges(command);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      
      // 等待一段时间让设备状态更新
      await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      
      try {
        // 获取最新状态
        const response = await electroluxClient.getApplianceState(this.currentApplianceId);
        const newState = response.data;
        const properties = newState?.properties?.reported || {};
        
        // 检查是否发生了预期的状态变化
        if (this.hasStateChanged(properties, expectedChanges)) {
          this.updateDeviceState(newState);
          return; // 状态已改变，退出等待
        }
        
        // 更新loading消息显示进度
        this.updateLoadingText(`${description}... (${attempt * 5}秒)`);
        
      } catch (error) {
        console.warn(`Failed to check state on attempt ${attempt}:`, error.message);
      }
    }
    
    // 超时后最后刷新一次状态
    await this.refreshStatus(false);
  }

  getExpectedStateChanges(command) {
    const changes = {};
    
    if (command.executeCommand === 'OFF') {
      changes.applianceState = 'off';
    } else if (command.executeCommand === 'ON' || command.mode) {
      changes.applianceState = 'running';
    }
    
    if (command.mode) {
      changes.mode = command.mode.toUpperCase();
    }
    
    if (command.targetTemperatureC) {
      changes.targetTemperatureC = command.targetTemperatureC;
    }
    
    if (command.fanSpeedSetting) {
      changes.fanSpeedSetting = command.fanSpeedSetting.toUpperCase();
    }
    
    return changes;
  }

  hasStateChanged(currentProperties, expectedChanges) {
    let hasAnyChange = false;
    
    for (const [key, expectedValue] of Object.entries(expectedChanges)) {
      const currentValue = currentProperties[key];
      
      if (key === 'applianceState') {
        // 特殊处理电源状态
        const currentLower = currentValue?.toLowerCase();
        const expectedLower = expectedValue?.toLowerCase();
        if (currentLower === expectedLower) {
          console.log(`⚡ Power state matched: ${currentLower}`);
          hasAnyChange = true;
        }
      } else if (key === 'targetTemperatureC') {
        // 温度可能有小数差异
        if (Math.abs(currentValue - expectedValue) < 0.1) {
          console.log(`🌡️ Temperature matched: ${currentValue}`);
          hasAnyChange = true;
        }
      } else {
        // 其他属性直接比较
        if (currentValue?.toString().toLowerCase() === expectedValue?.toString().toLowerCase()) {
          console.log(`🔄 ${key} matched: ${currentValue}`);
          hasAnyChange = true;
        }
      }
    }
    
    return hasAnyChange;
  }

  updateLoadingText(text) {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) {
      loadingText.textContent = text;
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

  disableAllButtons() {
    // 在执行命令期间禁用所有控制按钮
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

    // Check token status every 5 minutes
    setInterval(() => {
      this.refreshTokenStatus(false);
    }, 300000);
  }

  async refreshTokenStatus(showMessage = true) {
    if (showMessage) this.showLoading('检查Token状态...');

    try {
      const response = await electroluxClient.getTokenStatus();
      const tokenData = response.data;
      
      this.updateTokenStatusDisplay(tokenData);
      
      if (showMessage) this.showSuccess('Token状态已更新');
    } catch (error) {
      console.error('Failed to refresh token status:', error);
      this.updateTokenStatusDisplay(null);
      if (showMessage) this.showError('检查Token状态失败: ' + error.message);
    } finally {
      if (showMessage) this.hideLoading();
    }
  }

  updateTokenStatusDisplay(tokenData) {
    const accessTokenStatus = document.getElementById('accessTokenStatus');
    const tokenTimeLeft = document.getElementById('tokenTimeLeft');
    const manualRefreshBtn = document.getElementById('manualRefreshToken');
    const tokenHelp = document.getElementById('tokenHelp');

    if (!tokenData) {
      // Error state
      accessTokenStatus.textContent = '检查失败';
      accessTokenStatus.className = 'token-status invalid';
      
      tokenTimeLeft.textContent = '未知';
      tokenTimeLeft.className = 'token-status invalid';
      
      manualRefreshBtn.disabled = true;
      return;
    }

    // Access token status
    if (tokenData.hasAccessToken) {
      accessTokenStatus.textContent = tokenData.isExpired ? '已过期' : '有效';
      accessTokenStatus.className = `token-status ${tokenData.isExpired ? 'invalid' : 'valid'}`;
    } else {
      accessTokenStatus.textContent = '缺失';
      accessTokenStatus.className = 'token-status invalid';
    }

    // Time left
    if (tokenData.expiresInMinutes !== null) {
      if (tokenData.expiresInMinutes <= 0) {
        tokenTimeLeft.textContent = '已过期';
        tokenTimeLeft.className = 'token-status invalid';
      } else if (tokenData.expiresInMinutes < 30) {
        tokenTimeLeft.textContent = `${tokenData.expiresInMinutes}分钟`;
        tokenTimeLeft.className = 'token-status warning';
      } else {
        const hours = Math.floor(tokenData.expiresInMinutes / 60);
        const minutes = tokenData.expiresInMinutes % 60;
        const timeText = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
        tokenTimeLeft.textContent = timeText;
        tokenTimeLeft.className = 'token-status valid';
      }
    } else {
      tokenTimeLeft.textContent = '未知';
      tokenTimeLeft.className = 'token-status warning';
    }

    // Manual refresh button and help
    manualRefreshBtn.disabled = !tokenData.hasRefreshToken || !tokenData.apiInitialized || tokenData.isRefreshTokenExpired;
    
    // Show help if refresh token is missing or expired
    if (tokenData.hasRefreshToken && !tokenData.isRefreshTokenExpired) {
      tokenHelp.style.display = 'none';
    } else {
      tokenHelp.style.display = 'block';
      
      // Update help message based on the issue
      const helpText = tokenHelp.querySelector('.help-text p');
      if (!tokenData.hasRefreshToken) {
        helpText.textContent = '需要在.env文件中配置ELECTROLUX_REFRESH_TOKEN才能自动刷新访问令牌';
      } else if (tokenData.isRefreshTokenExpired) {
        helpText.textContent = '刷新令牌已过期，需要重新获取新的ELECTROLUX_REFRESH_TOKEN';
      }
    }
  }

  async manualRefreshToken() {
    this.showLoading('刷新Token...');

    try {
      const response = await electroluxClient.refreshToken();
      this.showSuccess('Token刷新成功');
      
      // Refresh token status display
      setTimeout(() => {
        this.refreshTokenStatus(false);
      }, 1000);
      
    } catch (error) {
      console.error('Manual token refresh failed:', error);
      
      // Show specific error message for missing refresh token
      if (error.message.includes('refresh token')) {
        this.showError('无法刷新Token: 缺少刷新令牌。请在.env文件中配置ELECTROLUX_REFRESH_TOKEN');
      } else {
        this.showError('Token刷新失败: ' + error.message);
      }
    } finally {
      this.hideLoading();
    }
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      if (tabName === 'mode' && content.id === 'modeTab') {
        content.classList.add('active');
      } else if (tabName === 'token' && content.id === 'tokenTab') {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
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

}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.electroluxController = new ElectroluxController();
});