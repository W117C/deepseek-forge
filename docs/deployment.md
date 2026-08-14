# 公测部署方案（HTTPS + 域名 + 运维）

> 签名体系（ed25519 验签 + sha256 验哈希）只有在 HTTPS 下才有意义：
> 明文 HTTP 可被中间人替换制品。公测前必须先上 TLS。

## 0. 当前线上拓扑（已上线）

| 站点 | URL | Vercel 项目 | root | 触发 |
| --- | --- | --- | --- | --- |
| Marketplace 前端 | https://deepseek-forge-marketplace.vercel.app | deepseek-forge-marketplace | forge/ | 推送 main 自动部署 |
| 落地页 | https://deepseek-forge.vercel.app | deepseek-forge | landing/ | 推送 main 自动部署 |

- 均为 Vite 静态构建 + SPA rewrites（配置见各目录 vercel.json）；GitHub Actions 承担构建/类型检查门槛（.github/workflows/ci.yml）。
- Registry（有状态服务）尚未公测上线——下文的 Caddy + node registry 拓扑即其公测方案。

## 1. 拓扑

```
客户端 CLI ──HTTPS──> Caddy（TLS 终结）──> AgentHub Registry（node cli/agenthub.mjs registry /data）
```

- 单实例起步：Registry 与 Caddy 同机；数据目录挂持久卷。
- Caddy 自动申请/续期证书（Let's Encrypt）：

```
marketplace.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

- Registry 只监听 127.0.0.1；对外仅暴露 443。

## 2. 安全开关（上线必须全开）

```sh
# 启动 Registry（要求发布鉴权 + 运营鉴权）
AGENTHUB_OPERATOR_TOKEN=$(openssl rand -hex 32) \
  node cli/agenthub.mjs registry /srv/agenthub/data --port 8080
```

- `createRegistry` 参数：`requirePublisherAuth: true`、`operatorToken`（当前 CLI registry 命令需加对应 flag 透传——待补）。
- 官方发布者白名单 `officialPublishers` 只放自有组织 id。

## 3. 密钥与令牌运维

- 发布者私钥：保存在开发者本地（agenthub keygen 的 keys.json，0600），**永不上传 Registry**；公钥 + 签名上链 Registry。
- 发布者令牌：仅用于 publish 端点认证，泄露后重新 register 轮换（同公钥幂等返回原 token，轮换需换 keypair 或加 revoke 端点——待补）。
- 运营令牌：环境变量注入，泄露后重启轮换。

## 4. 备份与监控

- 备份：registry.json（元数据）+ artifacts/（制品）+ scan/（可重建）。每日 tar 快照 + 异地副本。
- 监控：/v1/health 探活；pending 队列长度告警（>N 天未审）；发布/安装/评分速率异常告警。
- 日志：不记录 Authorization 头与制品内容哈希以外的敏感信息；密钥永不落日志。

## 5. 上线检查清单（摘要，全量见 registry-production.md）

- [x] HTTPS + 域名
- [x] 发布鉴权 + 运营鉴权
- [x] 服务端扫描 + 信任定级 + 审核队列
- [x] 客户端验哈希 + 验签 + blocked 阻断
- [x] 评分限流 + 安装幂等 + 制品下载限速
- [ ] 制品签名 URL（防盗链）
- [ ] 备份演练
- [ ] 真实 DEEPSEEK_API_KEY 环境的 headless 全链路冒烟
