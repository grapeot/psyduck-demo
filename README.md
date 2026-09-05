# 可达鸭动作跟随

基于 Vite 与 Three.js 的摄像头上半身动作跟随第一版。模型采用 7 骨骼 SkinnedMesh，导出为 GLB 后由页面重新加载。页面提供待机、单侧抬手、张臂、抱头、歪头、摆动六种预设及自动演示，无需摄像头即可使用。

## 架构与隐私

- 姿态检测使用 `@mediapipe/tasks-vision@0.10.22-rc.20250304` 的 CPU WASM classic Worker，固定 Lite task 版本 1 和 SHA-256。
- 初次访问不初始化姿态识别、不申请相机。点击开始后才请求视频流，`audio: false`。运行资源同源加载，不上传图像帧或关键点，不默认录制。
- 仅支持单人上半身，不支持全身、精细手指表情或真实空间位移。
- Worker 不兼容时停止、清理并提示重试，预设动作仍可用；当前没有主线程推理 fallback。

## 本地启动

使用 Node.js 22 或更新版本及 npm：

```bash
npm ci
npm run prepare:assets
npm start
```

资源准备会下载约 5.8 MB 的固定模型，并复制约 19 MB 的 WASM 运行时到 `public/`；这些可下载资源不纳入 Git。摄像头需要 localhost 或 HTTPS 和用户授权。

仓库保留 `public/models/psyduck_rigged.glb`。需要重新生成时运行 `npm run generate:rig`，它使用源 `psyduck_neutral.glb`，需要本机 Chrome。

## 验证

```bash
npm test
npm run build
npm run test:browser
npm run test:dev
npm audit
```

浏览器测试使用本机 Chrome（Playwright `channel: chrome`）。`test:browser` 需要先构建，再用普通静态服务器实际挂载 `/psyduck-demo/` 子路径。

已运行实际 CPU Worker 空画面推理，以及模拟摄像头、权限、取消和资源释放测试。没有开启真人相机；真人跟随准确性、体感延迟、Safari 和手机摄像头尚未验收。

## 范围与保留内容

- 生产 base 当前为 `/psyduck-demo/`，未来 Pages 仓库名不同时需调整。当前没有远端部署或 GitHub Actions 发布流程。
- 旧静态页面在 `static.html`。`anime.js`、`scene.js` 和历史渲染脚本保留；历史脚本依赖未纳入仓库的 `references/`、`iterations/` 等本地工件，干净克隆不能直接重放历史对照图。
- 新页面使用简化 PBR 与描边外观，旧插画 shader 保留在静态页。GLB 中的基础色、骨架和权重可重载；应用描边和灯光不保证在所有外部查看器中一致。

## 文档与授权边界

[设计文档](interaction_design.md) · [设计审查](design_review.md) · [建模 Skill](SKILL.md) · [资源来源与摘要](asset-manifest.json)

代码、MediaPipe 库及模型、宝可梦角色权益分别处理。第三方参考图和私人测试视频不随代码提交。公开发布前需核对相关授权；本项目不授予宝可梦角色版权许可，源码许可证尚未指定。
