# 微信云开发：云函数 HTTP 访问设置指南

为了让您的 Web 前端能够调用现有的 AI 助手云函数，您需要按照以下步骤开启 HTTP 访问能力。

## 1. 开启 HTTP 触发路径
1. 打开 **微信开发者工具**。
2. 进入 **云开发控制台**。
3. 点击上方菜单栏的 **云函数**。
4. 找到 `assistant` 云函数。
5. 在操作列点击 **更多 -> HTTP 访问** (或者在旧版中叫云接入)。
6. 点击 **添加路由**：
   - **路径**：例如 `/assistant` (对应云函数 `assistant`)
   - **云函数**：选择 `assistant`
7. 保存后，您会得到一个类似 `https://xxxx-xxxx-xxxx.service.tcloudbase.com/assistant` 的 URL。

## 2. 配置跨域 (CORS)
Web 前端在浏览器中运行时，由于同源策略，必须允许跨域访问。
1. 在云接入管理页面，找到 **域名设置**。
2. 在 **安全域名** 中添加您的 Web 开发域名（例如本地开发时添加 `http://localhost:5173`，部署后添加您的正式域名）。

## 3. 在 Web 前端代码中填入 URL
打开 `web-client/src/App.tsx`，将 `CLOUD_FUNCTION_URL` 变量替换为您在第一步中获得的完整 URL。

```typescript
const CLOUD_FUNCTION_URL = 'https://xxxx.service.tcloudbase.com/assistant';
```

## 4. 关于身份识别
由于 Web 端没有微信系统的 OpenID，您在云函数中可能需要通过请求头或参数手动传递 `studentId`。
- 您可以修改 `App.tsx` 中的发送逻辑，将登录时输入的 `username` 作为标识传给云函数。
- 云函数端需相应调整，如果检测到非小程序环境调用，则使用传入的标识。
