# 可达鸭动作跟随

基于 Vite 与 Three.js 的摄像头上半身动作跟随第一版。当前采用 `shoulder_flap` 运动模型：5 骨骼 SkinnedMesh，每侧肩部带动整片短鳍，肩根保留柔性过渡，不设置肘关节或拳状掌面。导出 GLB 后由页面重新加载。页面提供待机、单侧抬手、张臂、抱头、歪头、摆动六种预设及自动演示，无需摄像头即可使用。

## 架构与隐私

- 姿态检测使用 `@mediapipe/tasks-vision@0.10.22-rc.20250304` 的 CPU WASM classic Worker，固定 Lite task 版本 1 和 SHA-256。
- 初次访问不初始化姿态识别、不申请相机。点击开始后才请求视频流，`audio: false`。运行资源同源加载，不上传图像帧或关键点，不默认录制。
- 仅支持单人上半身，不支持全身、精细手指表情或真实空间位移。
- 跟随使用肩到腕的方向和抱头意图，明确忽略人体肘点；校准不要求肘点有效。预览骨架显示实际使用的肩腕连线。抱头为选定的肩部举翼姿态，不是两连杆 IK。
- Worker 不兼容时停止、清理并提示重试，预设动作仍可用；当前没有主线程推理 fallback。

## 本地启动

使用 Node.js 22 或更新版本及 npm：

```bash
npm ci
npm run prepare:assets
npm start
```

资源准备会下载约 5.8 MB 的固定模型，并复制约 19 MB 的 WASM 运行时到 `public/`；这些可下载资源不纳入 Git。`npm run build` 会自动准备并校验资源，干净源树只需 `npm ci` 和 `npm run build` 即可构建；摘要校验通过的模型缓存不会重复下载，缺失或损坏时重新获取，校验失败则构建失败。摄像头需要 localhost 或 HTTPS 和用户授权。

仓库保留 `public/models/psyduck_rigged.glb`。需要重新生成时运行 `npm run generate:rig`，它使用源 `psyduck_neutral.glb`，需要本机 Chrome。

## 验证

```bash
npm test
npm run build
npm run test:browser
npm run test:dev
npm run test:clean-build
npm audit
```

浏览器测试使用本机 Chrome（Playwright `channel: chrome`）。`test:browser` 需要先构建，再用普通静态服务器实际挂载 `/psyduck-demo/` 子路径。`test:clean-build` 在只复制 Git 候选源文件的新目录执行安装、构建和浏览器验证，不复用被忽略的资源缓存。

浏览器测试覆盖实际 CPU Worker 空画面与公开姿态样例图推理，以及模拟摄像头、权限、取消、角色加载重试和资源释放。公开样例图首次测试时按固定摘要下载到被 Git 忽略的 `test-results/`，不进入生产包；来源见 `tests/prepare-pose-fixture.mjs`。没有开启真人相机；真人跟随准确性、体感延迟、Safari 和手机摄像头尚未验收。

当前姿态对照是可选的本地研究工具：`node tests/flap-study.mjs final` 需要 `test-results/pose-reference-baseline/`、`test-results/pose-reference-round3/` 的历史截图/测量记录及 `references/psyduck_sugimori.jpg`。它明确区分历史两连杆静态姿态和当前整片举翼，并输出无摄像头的时间采样。版权参考与历史工件不纳入 Git；默认 `npm test`、`npm run build` 和 `test:browser` 不依赖它们。对照只作等比头部对齐，不保证精确复刻手绘画法。

`pose-reference`、`pose-candidates`、`pose-ablation`、`pose-snapshot`、`final-artifacts` 和旧 `shoulders` CLI 保留为历史记录，但在当前五骨骼模型下明确拒绝执行，防止用不存在的肘骨计算结果或覆盖旧证据。历史快照和图片仍可由新对照工具读取；不要把旧版本脚本当作当前 rig 验收。浏览器原始截图按每次运行的独立目录保留。

## 范围与保留内容

- 生产 base 当前为 `/psyduck-demo/`，未来 Pages 仓库名不同时需调整。当前没有远端部署或 GitHub Actions 发布流程。
- 旧静态页面在 `static.html`。`anime.js`、`scene.js` 和历史渲染脚本保留；历史脚本依赖未纳入仓库的 `references/`、`iterations/` 等本地工件，干净克隆不能直接重放历史对照图。
- 新页面使用简化 PBR 与描边外观，旧插画 shader 保留在静态页。GLB 中的基础色、骨架和权重可重载；应用描边和灯光不保证在所有外部查看器中一致。

## 文档与授权边界

[历史设计文档](interaction_design.md) · [历史设计审查](design_review.md) · [建模 Skill](SKILL.md) · [资源来源与摘要](asset-manifest.json)

旧设计中的两连杆动作方案已被用户指定的 `shoulder_flap` 替代；当前运动契约以本页、`src/rig.js` 和导出资产的 motionModel 元数据为准。

代码、MediaPipe 库及模型、宝可梦角色权益分别处理。第三方参考图和私人测试视频不随代码提交。公开发布前需核对相关授权；本项目不授予宝可梦角色版权许可，源码许可证尚未指定。
