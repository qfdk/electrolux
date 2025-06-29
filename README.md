# Electrolux 空调远程控制器

一个现代化的 Web 应用，用于远程控制 Electrolux 空调设备。基于 Node.js/Express.js 后端和响应式前端设计。

## ✨ 功能特性

- 🌡️ **温度控制**: 16-32°C 范围调节，支持小数点
- 🔄 **运行模式**: 制冷、制热、除湿、送风、自动、关机
- 💨 **风扇控制**: 低速、中速、高速、自动风速调节
- 🌀 **摆风控制**: 垂直摆风开关
- 📱 **响应式设计**: 支持手机和桌面设备
- ⚡ **实时状态**: 自动刷新设备状态
- 🔄 **多设备支持**: 支持多个空调设备切换

## 🚀 快速开始

### 前置要求

- Node.js (>=16.0.0)
- pnpm (推荐) 或 npm
- Electrolux Developer API 凭据

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd electrolux-ac-controller
   ```

2. **安装依赖**
   ```bash
   pnpm install
   # 或
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   ```
   
   编辑 `.env` 文件，填入您的 API 凭据：
   ```env
   ELECTROLUX_API_KEY=your_api_key_here
   ELECTROLUX_TOKEN=your_jwt_token_here
   TEST_APPLIANCE_ID=your_device_id_here
   ```

4. **启动开发服务器**
   ```bash
   pnpm run dev
   # 或
   npm run dev
   ```

5. **访问应用**
   
   打开浏览器访问 [http://localhost:3000](http://localhost:3000)

## 🔐 获取 API 凭据

### 方法一：官方开发者门户

1. 访问 [Electrolux Developer Portal](https://developer.electrolux.one/)
2. 注册开发者账户
3. 创建应用并获取 API Key
4. 按照官方文档获取 JWT Token

### 方法二：浏览器开发者工具

如果您已经在使用 Electrolux 官方应用：

1. 在浏览器中打开 [Electrolux Web App](https://portal-eu-nonprod.electrolux.com/)
2. 登录您的账户
3. 打开浏览器开发者工具 (F12)
4. 切换到 Network 标签
5. 刷新页面或进行任何操作
6. 查找对 `api.developer.electrolux.one` 的请求
7. 复制请求头中的 `x-api-key` 和 `Authorization` 值

### API 凭据格式

```env
# API Key 格式 (以 'a_' 开头)
ELECTROLUX_API_KEY=a_your_api_key_here

# JWT Token 格式 (不包含 "Bearer " 前缀)
ELECTROLUX_TOKEN=eyJ...your_jwt_token_here

# 设备 ID (从设备列表 API 获取)
TEST_APPLIANCE_ID=your_device_id_here
```

## 🔧 API 测试

在配置正确的凭据后，您可以手动测试 API 端点：

```bash
# 健康检查
curl http://localhost:3000/api/health

# 获取设备列表
curl http://localhost:3000/api/appliances

# 获取设备信息
curl http://localhost:3000/api/appliances/YOUR_DEVICE_ID/info

# 获取设备状态
curl http://localhost:3000/api/appliances/YOUR_DEVICE_ID/state

# 发送控制命令
curl -X POST http://localhost:3000/api/appliances/YOUR_DEVICE_ID/control \
  -H "Content-Type: application/json" \
  -d '{
    "targetTemperatureC": 24,
    "mode": "COOL",
    "fanSpeedSetting": "AUTO"
  }'
```

## 📁 项目结构

```
electrolux-ac-controller/
├── server.js                 # Express 服务器主文件
├── lib/
│   └── electrolux-api.js     # Electrolux API 客户端
├── public/
│   ├── index.html            # 主页面
│   ├── style.css             # 样式文件
│   ├── script.js             # 前端主逻辑
│   └── api-client.js         # 前端 API 客户端
├── package.json              # 项目配置
├── .env                      # 环境变量 (需要创建)
├── .env.example              # 环境变量示例
├── .gitignore                # Git 忽略文件
├── CLAUDE.md                 # Claude Code 指南
└── README.md                 # 项目文档
```

## 🎮 使用指南

### 界面操作

1. **设备选择**: 从下拉列表中选择要控制的空调设备
2. **温度调节**: 使用 +/- 按钮调节目标温度 (16-32°C)
3. **模式切换**: 点击对应图标选择运行模式
4. **风速控制**: 选择风扇速度级别
5. **摆风开关**: 切换垂直摆风功能
6. **状态查看**: 实时查看设备运行状态

### 控制命令

应用支持以下空调控制参数：

- **温度**: 16-32°C (支持小数)
- **模式**: OFF, COOL, HEAT, DRY, FANONLY, AUTO
- **风速**: LOW, MIDDLE, HIGH, AUTO
- **摆风**: ON, OFF

## 🛠️ 开发指南

### 添加新功能

1. **后端 API**: 在 `server.js` 中添加新路由
2. **API 客户端**: 在 `lib/electrolux-api.js` 中添加新方法
3. **前端界面**: 在 `public/index.html` 中添加 UI 元素
4. **前端逻辑**: 在 `public/script.js` 中添加交互逻辑
5. **样式设计**: 在 `public/style.css` 中添加样式

### 调试技巧

- 查看浏览器控制台获取详细日志
- 使用 Network 标签监控 API 请求
- 检查服务器控制台输出
- 使用 `curl` 命令测试 API 端点

### 缓存策略

- **设备能力**: 长期缓存 (10 分钟)
- **设备状态**: 短期缓存 (30 秒)
- **设备列表**: 中期缓存 (1 分钟)

## 🔒 安全注意事项

- ✅ API 密钥和 Token 仅存储在服务器端
- ✅ 前端无法直接访问敏感凭据
- ✅ 所有控制命令都经过服务器验证
- ✅ 支持 CORS 安全配置
- ⚠️ 请勿将 `.env` 文件提交到版本控制

## 🌍 地区支持

应用支持以下地区的 Electrolux API：

- **EMEA**: 欧洲、中东、非洲 (默认)
- **APAC**: 亚太地区
- **NA**: 北美地区
- **LATAM**: 拉丁美洲
- **Frigidaire**: Frigidaire 品牌专用

在 `.env` 文件中设置 `REGION` 变量以指定地区。

## 📚 相关资源

- [Electrolux Developer Portal](https://developer.electrolux.one/)
- [API 管理门户](https://portal-eu-nonprod.electrolux.com/)
- [官方文档](https://developer.electrolux.one/documentation)
- [Swagger API 参考](https://developer.electrolux.one/documentation/reference)

## 🐛 故障排除

### 常见问题

**Q: API 返回 401 Unauthorized**
A: 检查 JWT Token 是否有效且未过期

**Q: API 返回 403 Forbidden**
A: 检查 API Key 是否正确配置

**Q: 设备列表为空**
A: 确认账户下有已连接的设备，或使用测试设备 ID

**Q: 控制命令失败**
A: 检查设备是否在线，命令参数是否有效

### 获取帮助

如果遇到问题：

1. 检查浏览器和服务器控制台日志
2. 验证 API 凭据是否正确
3. 测试网络连接
4. 查看 Electrolux 官方文档
5. 检查设备是否在线

## 📄 许可证

MIT License - 详见 LICENSE 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**注意**: 这是一个非官方应用，与 Electrolux 公司无关。请遵守 Electrolux API 使用条款。