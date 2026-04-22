# 一二布布生存游戏部署指南

本指南用于把当前项目部署到云服务器上。项目是 Vite + Phaser 3 前端，同时 `server/index.mjs` 可以在生产环境中提供：

- 静态页面：`dist/`
- 本地/线上联机 WebSocket 服务
- 健康检查：`/health`

推荐部署方式：**Node.js + PM2 + Nginx + HTTPS**。

## 1. 服务器准备

以下命令以 Ubuntu/Debian 服务器为例。

```bash
sudo apt update
sudo apt install -y git curl nginx
```

安装 Node.js LTS。推荐使用 Node 20 或更高版本：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

安装 PM2，用于让 Node 服务常驻后台：

```bash
sudo npm install -g pm2
```

## 2. 拉取项目

进入你想放项目的目录，例如 `/var/www`：

```bash
cd /var/www
sudo git clone https://github.com/zzlee666/yierSurvival.git
sudo chown -R $USER:$USER yierSurvival
cd yierSurvival
```

安装依赖：

```bash
npm install
```

构建生产包：

```bash
npm run build
```

## 3. 启动生产服务

项目的生产启动脚本是：

```bash
npm run start:prod
```

默认读取：

- `PORT=3000`
- `HOST=127.0.0.1`

如果你使用 Nginx 反代，推荐保持 `HOST=127.0.0.1`，不要直接把 Node 服务暴露到公网。

用 PM2 启动：

```bash
PORT=3000 HOST=127.0.0.1 pm2 start npm --name yier-survival -- run start:prod
pm2 save
pm2 startup
```

执行 `pm2 startup` 后，终端会输出一条 `sudo env ... pm2 startup ...` 命令。复制它并执行一次，让服务器重启后 PM2 自动恢复服务。

查看状态：

```bash
pm2 status
pm2 logs yier-survival
```

本机健康检查：

```bash
curl http://127.0.0.1:3000/health
```

正常会看到类似：

```json
{"ok":true,"clients":0}
```

## 4. 配置 Nginx

假设你的域名是：

```text
your-domain.com
```

创建 Nginx 配置：

```bash
sudo nano /etc/nginx/sites-available/yier-survival
```

写入以下内容，把 `your-domain.com` 改成你的真实域名：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 联机连接同样走这个 Node 服务。
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

当前服务端会接受任意路径上的 WebSocket upgrade。前端生产环境默认会连接当前域名，例如：

- `http://your-domain.com/?online=1` 使用 `ws://your-domain.com`
- `https://your-domain.com/?online=1` 使用 `wss://your-domain.com`

所以即使没有专门使用 `/ws` 路径，`location /` 也能代理联机。保留 `/ws` 是为了以后如果前端改成显式 `/ws`，Nginx 不用再大改。

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/yier-survival /etc/nginx/sites-enabled/yier-survival
sudo nginx -t
sudo systemctl reload nginx
```

如果默认站点占用了域名，可以禁用默认站点：

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

现在访问：

```text
http://your-domain.com
```

## 5. 配置 HTTPS

安装 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
```

申请证书：

```bash
sudo certbot --nginx -d your-domain.com
```

完成后访问：

```text
https://your-domain.com
```

在线联机测试：

```text
https://your-domain.com/?online=1
```

打开两个浏览器窗口，两个窗口都进入 `?online=1`：

- 第一个连接者控制一二。
- 第二个连接者控制布布。

## 6. 云服务器防火墙

云服务商控制台需要放行：

- `80` HTTP
- `443` HTTPS

如果你使用 Nginx 反代，不需要公网放行 `3000`。

如果服务器系统启用了 `ufw`：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 7. 后续更新发布

以后你本地改完并 push 到 GitHub 后，服务器上执行：

```bash
cd /var/www/yierSurvival
git pull
npm install
npm run build
pm2 restart yier-survival
```

检查：

```bash
pm2 status
curl http://127.0.0.1:3000/health
```

## 8. 环境变量说明

项目提供了 `.env.production.example` 作为示例。

生产服务端常用变量：

```bash
PORT=3000
HOST=127.0.0.1
```

前端联机地址：

```bash
VITE_WS_URL=wss://your-domain.com
```

通常不需要设置 `VITE_WS_URL`。生产环境前端会自动根据当前页面域名选择：

- HTTP 页面：`ws://当前域名`
- HTTPS 页面：`wss://当前域名`

只有当前端和 WebSocket 服务不在同一个域名时，才需要设置 `VITE_WS_URL`，然后重新构建：

```bash
VITE_WS_URL=wss://ws.your-domain.com npm run build
pm2 restart yier-survival
```

## 9. 常见问题

### 页面打不开

检查 Node 服务：

```bash
pm2 status
pm2 logs yier-survival
curl http://127.0.0.1:3000/health
```

检查 Nginx：

```bash
sudo nginx -t
sudo systemctl status nginx
```

### `?online=1` 不能联机

先看浏览器控制台是否有 WebSocket 报错。

如果是 HTTPS 页面，WebSocket 必须是 `wss://`，不能是 `ws://`。

确认 Nginx 包含：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### 推送 GitHub 或服务器拉代码失败

优先检查服务器是否能访问 GitHub：

```bash
git ls-remote https://github.com/zzlee666/yierSurvival.git
```

如果网络不通，需要配置服务器网络代理，或者改用 SSH key。

### 修改后网页没变化

确认服务器重新构建并重启了：

```bash
npm run build
pm2 restart yier-survival
```

浏览器也可以强制刷新：

```text
Ctrl + F5
```

## 10. 最小部署命令汇总

只想快速跑起来，可以按这个顺序：

```bash
cd /var/www
git clone https://github.com/zzlee666/yierSurvival.git
cd yierSurvival
npm install
npm run build
PORT=3000 HOST=127.0.0.1 pm2 start npm --name yier-survival -- run start:prod
pm2 save
```

然后配置 Nginx 反代到：

```text
http://127.0.0.1:3000
```
