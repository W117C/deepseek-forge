# Registry 生产化设计（M3 收尾 → 上线前）

> 当前实现（M2/M3）：单进程内存索引 + JSON 文件持久化 + 制品 tgz 文件存储，零依赖。
> 本文定义多实例部署前的升级路径；**在单机/内网规模（数百 Agent、数千安装）下，当前实现足够**，不要过早拆微服务。

## 1. 容量与瓶颈判断

| 规模 | 建议 |
|---|---|
| 单机 / 团队内网（< 数百 Agent、< 万级安装） | 保持现状（JSON 文件 + 内存索引） |
| 公网公测（万级 Agent 页面浏览、安装计数与评分高频写） | PostgreSQL + 对象存储 |
| 多实例 / 高可用 | 见 §3 |

## 2. 数据模型（PostgreSQL）

沿用现有语义，换存储引擎：

```sql
publishers(id TEXT PRIMARY KEY, public_key_pem TEXT NOT NULL, name TEXT, official BOOLEAN DEFAULT false, created_at TIMESTAMPTZ);
agents(id TEXT PRIMARY KEY, name TEXT, publisher TEXT REFERENCES publishers(id),
       category TEXT, trust TEXT, score INT, manifest JSONB, installs INT DEFAULT 0,
       rating_sum INT DEFAULT 0, rating_count INT DEFAULT 0, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ);
agent_versions(agent_id TEXT REFERENCES agents(id), version TEXT, sha256 TEXT, signature TEXT,
               artifact_path TEXT, scan JSONB, manifest JSONB, installs INT DEFAULT 0, published_at TIMESTAMPTZ,
               PRIMARY KEY (agent_id, version));
pending(id TEXT, version TEXT, publisher TEXT, scan JSONB, trust TEXT, manifest JSONB,
        artifact_path TEXT, signature TEXT, sha256 TEXT, submitted_at TIMESTAMPTZ,
        PRIMARY KEY (id, version));
catalog_entries(name TEXT PRIMARY KEY, source TEXT, description TEXT, category TEXT, ingested_at TIMESTAMPTZ);
installations(agent_id TEXT, version TEXT, ts TIMESTAMPTZ);   -- 匿名事件，无用户标识
ratings(agent_id TEXT, client_key TEXT, score INT, ts TIMESTAMPTZ);  -- client_key=ip 哈希；窗口限流在应用层
```

- 制品：对象存储（S3/OSS/MinIO），路径 `agents/<id>/<version>.tgz`；artifact_path 存对象 key。
- 迁移：写一个 `registry.json → SQL` 一次性导出脚本；现网单机升级时先冻结写入。

## 3. 多实例与一致性

- API 无状态（db 为唯一状态源）→ 多实例水平扩展；内存索引改为每实例读库 + 短 TTL 缓存。
- 安装计数：单行 UPDATE agents SET installs = installs + 1（原子），installations 表仅留审计样本（采样写入即可）。
- 评分限流：Redis（key = client:agent，INCR + EXPIRE 10 分钟）。
- 发布原子性：制品先传对象存储，再插版本行（发布=单事务）；审批=把 pending 行移入 agents/agent_versions 的事务。

## 4. 安全边界清单（上线前必查）

- [x] 服务端零执行第三方代码（只静态扫描，扫描器在受限 worker 内跑，禁网禁写）
- [x] 发布验签（ed25519）+ 验哈希（sha256），trust-on-first-use 公钥
- [x] 服务端扫描定级（不信任自报 trust）+ 非官方发布者审核队列
- [x] 客户端安装前验哈希→验签→才解包；blocked 直接拒绝
- [x] 发布端点鉴权（requirePublisherAuth 模式：publisher-register 取令牌，publish 校验 Bearer；e2e-auth 覆盖 401/冒用）
- [x] 审核操作鉴权（operatorToken 配置后 /v1/review 强制校验；无令牌 401）
- [x] 安装上报幂等（eventId 24h 去重，重复上报不重复计数；评分限流 ip+agent 10 分钟 5 次）
- [x] 制品下载速率限制与防盗链（per-ip 10 次/分钟 + HMAC 签名 URL 5 分钟有效，e2e 覆盖 403/200/篡改）
- [x] 备份演练（scripts/backup.sh + restore.sh，e2e-backup 7/7 全链路）
- [ ] 评分/安装上报客户端身份去重（当前幂等键为随机 eventId；跨客户端伪造仍需账号体系）
- [ ] TLS 与仓库域名（Registry 必须 HTTPS，签名体系才有意义）

## 5. 部署形态

```
                    ┌── AgentHub API（Node，无状态）× N
                    │        │
  用户/CLI ── HTTPS ─┤        ├── PostgreSQL（元数据/计数/评分）
                    │        ├── S3（制品 tgz）
                    │        └── Redis（限流/缓存）
```

- 进程管理器：systemd 或容器编排；单实例过渡期可继续 `node cli/agenthub.mjs registry <dir>`。
