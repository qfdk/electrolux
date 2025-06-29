# Token获取指南

本指南将帮助您获取 Electrolux API 的访问令牌和刷新令牌。

## 方法一: 官方开发者控制台（推荐）

### 步骤 1: 获取 API Key
1. 访问 [Electrolux API Key 页面](https://developer.electrolux.one/documentation/apiKey)
2. 按照指南获取您的 API Key

### 步骤 2: 获取访问令牌
1. 打开 [Electrolux Dashboard](https://developer.electrolux.one/dashboard)
2. 点击 **GET ACCESS TOKEN** 按钮
3. 完成身份验证流程

这会返回：
- `accessToken`: JWT访问令牌（用于Authorization头）
- `tokenType`: 令牌类型（通常是"Bearer"）
- `expiresIn`: 有效期（秒数）
- `refreshToken`: 刷新令牌（用于获取新的访问令牌）

## 方法二: 通过浏览器开发者工具获取

### 步骤 1: 使用浏览器登录
1. 打开浏览器，访问 [Electrolux Web Portal](https://portal-eu-nonprod.electrolux.com/)
2. 使用您的 Electrolux 账户登录

### 步骤 2: 打开开发者工具
1. 按 `F12` 或右键点击 "检查元素" 打开开发者工具
2. 切换到 **Network** (网络) 标签页
3. 确保 "Preserve log" (保留日志) 选项已勾选

### 步骤 3: 触发API请求
1. 在网页上进行任何操作（如查看设备状态、控制设备等）
2. 在Network标签页中查找对 `api.developer.electrolux.one` 的请求

### 步骤 4: 提取令牌
1. 点击任意一个 API 请求
2. 在 **Headers** (请求头) 部分查找：
   - `x-api-key`: 复制这个值作为 `ELECTROLUX_API_KEY`
   - `Authorization`: 复制 "Bearer " 后面的值作为 `ELECTROLUX_TOKEN`

### 步骤 5: 获取刷新令牌
刷新令牌通常包含在登录响应或令牌刷新响应中：

1. 查找对 `/token` 或 `/auth` 端点的请求
2. 在响应体中查找 `refreshToken` 字段
3. 复制这个值作为 `ELECTROLUX_REFRESH_TOKEN`

如果找不到刷新令牌：
1. 退出登录并重新登录
2. 在登录过程中监控网络请求
3. 查找包含 `refreshToken` 的响应

## 方法二: 使用移动应用抓包

### 前提条件
- 已安装 Electrolux 移动应用
- 抓包工具（如 Charles Proxy、Fiddler）

### 步骤
1. 配置代理服务器
2. 在移动设备上设置代理
3. 在应用中登录并操作
4. 从抓包工具中提取令牌

## 配置环境变量

获取令牌后，更新您的 `.env` 文件：

```env
# API 配置
ELECTROLUX_API_KEY=a_your_api_key_here
ELECTROLUX_TOKEN=your_access_token_here
ELECTROLUX_REFRESH_TOKEN=your_refresh_token_here

# 设备配置
TEST_APPLIANCE_ID=your_device_id_here

# 服务器配置
PORT=3000
NODE_ENV=development
```

## 令牌说明

### 访问令牌 (Access Token)
- **格式**: JWT (JSON Web Token)
- **有效期**: 通常 12 小时
- **用途**: 授权 API 请求
- **示例**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 刷新令牌 (Refresh Token)
- **格式**: 随机字符串
- **有效期**: 通常 7-30 天（根据 Electrolux API 配置）
- **用途**: 获取新的访问令牌
- **过期行为**: 过期后需要重新登录获取
- **示例**: `rtok_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456`

### API 密钥 (API Key)
- **格式**: 以 'a_' 开头的字符串
- **有效期**: 长期有效
- **用途**: 识别应用
- **示例**: `a_41c696eb-045a-4edd-8f00-bb0bd11f0fc6`

## 故障排除

### 问题 1: 找不到刷新令牌
**解决方案:**
1. 确保在登录过程中监控网络请求
2. 查找包含 'refresh' 关键字的请求
3. 检查 localStorage 或 sessionStorage

### 问题 2: 令牌快速过期
**解决方案:**
1. 确认您使用的是正确的访问令牌
2. 检查系统时间是否正确
3. 尝试重新获取令牌

### 问题 3: API 返回 401 错误
**解决方案:**
1. 检查 API 密钥是否正确
2. 确认访问令牌没有过期
3. 验证请求头格式

### 问题 4: 刷新令牌过期
**解决方案:**
1. 重新执行令牌获取流程
2. 在浏览器中重新登录 Electrolux 账户
3. 更新 `.env` 文件中的刷新令牌
4. 重启应用服务器

### 问题 5: 自动刷新失败
**解决方案:**
1. 检查界面上的令牌状态面板
2. 确认刷新令牌没有过期
3. 查看服务器日志了解具体错误
4. 手动刷新令牌测试功能

## 安全注意事项

⚠️ **重要提醒:**
- 令牌具有完整的账户访问权限
- 不要在公共场所或不安全的网络中获取令牌
- 不要将令牌分享给他人
- 定期更换令牌
- 使用 `.gitignore` 确保令牌不会被提交到版本控制

## 自动化令牌管理

配置完成后，应用会自动：
- 在令牌过期前 5 分钟自动刷新
- 将新令牌保存到 `.tokens.json` 文件  
- 在服务器重启时恢复令牌状态
- 在界面上显示令牌状态和剩余时间
- 处理 401 错误并自动重试

## 官方文档参考

- [Authorization 文档](https://developer.electrolux.one/documentation/authorization)
- [API Key 获取](https://developer.electrolux.one/documentation/apiKey)  
- [开发者 Dashboard](https://developer.electrolux.one/dashboard)
- [API 参考文档](https://developer.electrolux.one/documentation/reference)

如需帮助，请查看控制台日志或联系支持。