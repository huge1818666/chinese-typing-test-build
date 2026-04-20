# 中文打字测速网页

一个适合面试场景的中文打字测速网页，支持：

- 自定义测试时长
- 自定义达标线
- 候选人姓名录入
- 历史成绩记录
- Docker 部署

页面是纯静态站点，容器内使用 `nginx` 提供服务，适合部署在普通 Linux 主机、NAS、爱快路由器 Docker 等环境。

## 开源说明

本项目采用 [MIT License](./LICENSE) 开源。你可以在保留原始版权与许可声明的前提下自由使用、修改、分发和商用。

为了方便别人直接复用，这里额外说明一下：

- 项目是纯前端静态页面，直接打开或放进任意静态站点都能跑
- 历史成绩默认保存在浏览器本地 `localStorage`，不会自动同步到服务器
- 项目按“现状”提供，如需用于正式招聘流程，建议你自行评估数据留存和流程合规性

## 功能特点

- 输入第一个汉字后自动开始倒计时
- 只统计正确输入的汉字数量
- 达标判断按当前自定义规则实时生效
- 支持候选人历史成绩记录
- 历史记录默认最多保留 10 条
- 禁止粘贴，适合面试现场使用
- 纯前端部署，无需数据库

## 使用方式

外层界面可以：

- 输入候选人姓名
- 设置测试时长
- 设置达标线
- 查看最近历史成绩

进入测试页后：

- 系统会根据当前规则开始计时
- 结束后自动判断是否达标
- 成绩会自动保存到当前浏览器本地

注意：

- 历史记录保存在浏览器本地 `localStorage`
- 更换浏览器、清理浏览器数据或更换设备后，记录不会同步

## 本地直接打开

直接用浏览器打开 [index.html](./index.html) 即可。

## Docker 构建与运行

构建镜像：

```bash
docker build -t chinese-typing-test:latest .
```

运行容器：

```bash
docker run -d --name chinese-typing-test -p 8080:80 chinese-typing-test:latest
```

浏览器访问：

[http://localhost:8080](http://localhost:8080)

也可以使用 Compose：

```bash
docker compose up -d
```

## 导入镜像包

如果你不是自己构建镜像，而是下载现成镜像包，导入方式如下：

```bash
gunzip chinese-typing-test-latest-linux-amd64.tar.gz
docker load -i chinese-typing-test-latest-linux-amd64.tar
docker run -d --name chinese-typing-test -p 8080:80 chinese-typing-test:latest
```

架构选择：

- `amd64`：常见 x86 服务器、工控机、PC
- `arm64`：Apple Silicon、部分 ARM Linux 设备

## 爱快 Docker 部署说明

如果部署在爱快路由器 Docker，请注意：

- 容器内部端口是 `80`
- 如果你想从外部访问 `9000`，应配置为 `宿主机 9000 -> 容器 80`

示例：

```text
外部访问: http://你的IP或域名:9000
端口映射: 9000:80
```

不要配置成 `9000:9000`，否则通常会访问失败。

## GitHub Actions 构建

仓库内置 GitHub Actions 工作流，会自动生成两份镜像归档：

- `linux/amd64`
- `linux/arm64`

产物会出现在 Actions 的 `docker-images` artifact 中。

## 项目结构

- [index.html](./index.html)：页面结构
- [styles.css](./styles.css)：页面样式
- [app.js](./app.js)：测速逻辑、记录逻辑
- [Dockerfile](./Dockerfile)：容器镜像定义
- [nginx.conf](./nginx.conf)：静态站点配置
- [.github/workflows/build-docker-images.yml](./.github/workflows/build-docker-images.yml)：GitHub Actions 镜像构建流程

## 开源许可

本项目采用 [MIT License](./LICENSE)。
