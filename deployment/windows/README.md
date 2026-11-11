# Windows 隔离部署说明

生产网站使用独立根目录 `C:\Sites\svitla-text`，应用在 `app`，IIS 根目录在 `iis`，便携 Node 在 `runtime`，日志在 `logs`。

- Node 监听 `127.0.0.1:3088`，不直接暴露端口。
- 独立 IIS 站点和应用池：`SvitlaText-Isolated`，仅绑定 `svitla.it.com`。
- 独立启动任务：`SvitlaText-Isolated`，服务器启动后运行，失败自动重试。
- 独立证书续期任务：`SvitlaSSL-Isolated`。ACME 配置在本目录的 `acme/config`，不复用其他站点的续期配置。
- `app/data` 保存密码、文字、历史、底图和导出 PNG，不得作为静态目录公开，也不得提交 Git。
- 应用升级只替换 `app` 下源文件，保留 `data`。需要重启时仅停止本应用启动任务与对应 Node 进程，不运行 `iisreset`，不停止其他站点。
- `SvitlaProxy.cs` 放在 IIS 站点的 `App_Code` 下，配合本目录 `web.config`。无需全局安装 URL Rewrite 或 ARR。
- HTTP 验证文件路径 `.well-known/acme-challenge` 由 Node 读取应用根目录对应文件夹，用于证书签发和续期。

回退时只变更本域名 DNS 或本网站独立配置，不修改其他站点。需要先备份数据，再变更部署。
