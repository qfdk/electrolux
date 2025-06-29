const fs = require('fs').promises;
const path = require('path');

class TokenStorage {
  constructor(filePath = './.tokens.json') {
    this.filePath = path.resolve(filePath);
    this.tokens = {
      accessToken: null,
      refreshToken: null,
      expiryTime: null,
      lastUpdated: null
    };
  }

  async loadTokens() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      this.tokens = JSON.parse(data);
      console.log('✅ Tokens loaded from file');
      return this.tokens;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️ Token file not found, will create on first save');
      } else {
        console.error('❌ Error loading tokens:', error.message);
      }
      return null;
    }
  }

  async saveTokens(accessToken, refreshToken, expiresIn = null) {
    try {
      this.tokens = {
        accessToken,
        refreshToken,
        expiryTime: expiresIn ? Date.now() + (expiresIn * 1000) : null,
        lastUpdated: new Date().toISOString()
      };

      await fs.writeFile(this.filePath, JSON.stringify(this.tokens, null, 2));
      console.log(`✅ Tokens saved to ${this.filePath}`);
      
      return this.tokens;
    } catch (error) {
      console.error('❌ Error saving tokens:', error.message);
      throw error;
    }
  }

  async updateTokens(accessToken, refreshToken, expiresIn = null) {
    return await this.saveTokens(accessToken, refreshToken, expiresIn);
  }

  getTokens() {
    return this.tokens;
  }

  isTokenExpired() {
    if (!this.tokens.expiryTime) {
      return true; // If no expiry time, assume expired
    }
    
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    return Date.now() >= (this.tokens.expiryTime - bufferTime);
  }

  getTimeUntilExpiry() {
    if (!this.tokens.expiryTime) {
      return null;
    }
    
    const timeLeft = this.tokens.expiryTime - Date.now();
    return Math.max(0, Math.floor(timeLeft / 1000)); // seconds
  }

  async deleteTokens() {
    try {
      await fs.unlink(this.filePath);
      console.log('✅ Token file deleted');
      this.tokens = {
        accessToken: null,
        refreshToken: null,
        expiryTime: null,
        lastUpdated: null
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Error deleting token file:', error.message);
      }
    }
  }

  // Check if tokens exist and are valid
  hasValidTokens() {
    return this.tokens.accessToken && 
           this.tokens.refreshToken && 
           !this.isTokenExpired();
  }

  // Get token info for debugging
  getTokenInfo() {
    return {
      hasAccessToken: !!this.tokens.accessToken,
      hasRefreshToken: !!this.tokens.refreshToken,
      expiryTime: this.tokens.expiryTime ? new Date(this.tokens.expiryTime).toISOString() : null,
      isExpired: this.isTokenExpired(),
      expiresInSeconds: this.getTimeUntilExpiry(),
      lastUpdated: this.tokens.lastUpdated
    };
  }
}

module.exports = TokenStorage;