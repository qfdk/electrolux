const axios = require('axios');

class ElectroluxAPI {
    constructor(apiKey, token, refreshToken = null) {
        this.apiKey = apiKey;
        this.token = token;
        this.refreshToken = refreshToken;
        this.baseURL = 'https://api.developer.electrolux.one/api/v1';
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
    }

    // Token management methods
    async ensureValidToken() {
        // Skip automatic token refresh - only check if token is expired
        if (this.isTokenExpired()) {
            console.warn('⚠️ Token is expired. Manual token refresh may be required.');
            // Don't automatically refresh - let the error propagate
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        console.log('🔄 Refreshing access token...');
        this.isRefreshing = true;

        try {
            console.log(`🔑 Using refresh token: ${this.refreshToken ? this.refreshToken.substring(0, 20) + '...' : 'MISSING'}`);

            // Check if current token is expired
            const isCurrentTokenExpired = this.isTokenExpired();
            console.log(`🎫 Current token expired: ${isCurrentTokenExpired}`);

            const requestBody = {refreshToken: this.refreshToken};

            // Try with current token first, even if expired (as per API docs)
            const headers = {
                'accept': 'application/json',
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            };

            const response = await axios.post(
                `${this.baseURL}/token/refresh`,
                requestBody,
                {
                    headers,
                    timeout: 10000
                }
            );

            const {accessToken, refreshToken, expiresIn} = response.data;

            this.token = accessToken;
            this.refreshToken = refreshToken || this.refreshToken; // Keep old refresh token if not provided
            this.tokenExpiryTime = Date.now() + (expiresIn * 1000);

            console.log(`✅ Token refreshed successfully. Expires in ${expiresIn} seconds`);

            // Emit event for server to update .env file
            this.onTokenRefresh && this.onTokenRefresh(accessToken, this.refreshToken, expiresIn);

        } catch (error) {
            console.error(`❌ Token refresh failed:`, error.message);

            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);

                // Provide specific error messages for different status codes
                if (error.response.status === 429) {
                    throw new Error(`Token refresh failed: ${error.response.status} - ${JSON.stringify(error.response.data)} (Rate limited - please wait before retrying)`);
                }

                throw new Error(`Token refresh failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }

            throw new Error(`Token refresh failed: ${error.message}`);
        } finally {
            this.isRefreshing = false;
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

    // Method to update tokens in the existing client instance
    updateTokens(newAccessToken, newRefreshToken) {
        console.log('🔄 Updating API client tokens...');

        // Update instance variables
        this.token = newAccessToken;
        if (newRefreshToken) {
            this.refreshToken = newRefreshToken;
        }

        // Update the axios client default Authorization header
        this.client.defaults.headers['Authorization'] = `Bearer ${newAccessToken}`;

        console.log('✅ API client tokens updated');
    }


    async getAppliances() {
        const response = await this.client.get('/appliances');
        return response.data;
    }

    async getApplianceInfo(applianceId) {
        const response = await this.client.get(`/appliances/${applianceId}/info`);
        return response.data;
    }

    async getApplianceState(applianceId) {
        const response = await this.client.get(`/appliances/${applianceId}/state`);
        return response.data;
    }

    async getApplianceCapabilities(applianceId) {
        const response = await this.client.get(`/appliances/${applianceId}/capabilities`);
        return response.data;
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
            }
            // Token is valid - no need to log this repeatedly

            return isExpired;
        } catch (error) {
            console.warn('⚠️ Could not validate token expiration:', error.message);
            return true;
        }
    }

}

module.exports = {ElectroluxAPI};
