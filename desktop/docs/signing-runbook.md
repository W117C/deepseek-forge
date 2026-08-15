# DeepSeek Forge Desktop — 签名 / 公证 / 分发 Runbook

## 现状
- 生产构建产出：`src-tauri/target/release/bundle/macos/DeepSeek Forge.app` 与
  `.../dmg/DeepSeek Forge_<version>_<arch>.dmg`（`npm run tauri build`）。
- 未签名时：本机可右键 → 打开运行；**不能**分发给他人（Gatekeeper 会拦截）。

## 一次性准备
1. Apple Developer 账号 + `Developer ID Application` 证书（安装进钥匙串）。
2. 生成 App 专用密码（appleid.apple.com → Sign-In → App-Specific Passwords）。
3. 配置公证凭据（只执行一次）：
   ```bash
   xcrun notarytool store-credentials forge-notary \
     --apple-id <你的 Apple ID> --team-id <TEAM-ID> \
     --password <app 专用密码>
   ```

## 每次发布
```bash
cd desktop
npm run tauri build
APPLE_IDENTITY="Developer ID Application: 你的名字 (TEAMID)" ./scripts/sign-macos.sh
```
脚本会依次执行：codesign（hardened runtime + timestamp）→ 验签 → 公证提交并等待 →
stapler 装订 → Gatekeeper 评估。

## 验证清单
```bash
codesign -dv --verbose=4 "src-tauri/target/release/bundle/macos/DeepSeek Forge.app"
spctl -a -vv "src-tauri/target/release/bundle/macos/DeepSeek Forge.app"
xcrun stapler validate "src-tauri/target/release/bundle/macos/DeepSeek Forge.app"
```

## 发布前硬性清单（与签名无关）
- [ ] 真实 home 端到端验收通过（安装→profile 落盘→回滚，见 docs 验收记录）
- [ ] `npm run test:e2e`（桌面 UI 套件）全绿
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`（Rust 单测）
- [ ] registry 数据真实（无测试包）
- [ ] 版本号三处一致：tauri.conf.json / package.json / Cargo.toml

## 常见失败
| 症状 | 处理 |
|---|---|
| `errSecInternalComponent` | 钥匙串里证书私钥权限不对，重新导入 p12 |
| notarytool 401 | App 专用密码错误 / team-id 不对 |
| Gatekeeper 仍拦截 | 先 `xcrun stapler staple` 再分发；旧缓存放行用 `spctl --add` |
