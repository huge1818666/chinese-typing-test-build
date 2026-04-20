# 中文打字测速网页

一个适合面试场景的中文打字测速网页，支持自定义测试时长、达标线、候选人姓名录入，以及本地测试记录保存。

## 功能

- 测试时长可自定义，输入第一个汉字后自动开始倒计时
- 只统计正确输入的汉字数量
- 达标线可自定义，判定和记录会同步使用当前规则
- 实时显示当前速度、准确率和达标状态
- 外层界面支持录入候选人姓名
- 自动保存测试记录到当前浏览器本地，最多保留 10 条
- 禁止粘贴，适合面试现场使用
- 纯静态页面，使用 `nginx` 容器即可部署

## 本地直接打开

浏览器打开 `index.html` 即可使用。

## Docker 部署

构建镜像：

```bash
docker build -t chinese-typing-test .
```

启动容器：

```bash
docker run --rm -p 8080:80 chinese-typing-test
```

然后访问：

[http://localhost:8080](http://localhost:8080)

也可以直接用 Compose：

```bash
docker compose up -d
```

## 导入镜像包

如果本机没有 Docker，也可以直接使用仓库中的打包脚本生成可导入的镜像文件：

```bash
python3 build_image_archives.py
```

脚本会在 `dist/` 目录生成：

- `chinese-typing-test-latest-linux-amd64.tar`
- `chinese-typing-test-latest-linux-arm64.tar`
- `chinese-typing-test-latest-docker-archives.zip`

导入方式：

```bash
docker load -i chinese-typing-test-latest-linux-amd64.tar
```

如果目标 Docker 主机是 x86_64，优先使用 `amd64`；如果是 Apple Silicon 或 ARM Linux，使用 `arm64`。

## 适合面试的判定规则

- 测试时长固定 60 秒
- 达标线固定 40 字/分钟
- 判定依据为 60 秒内正确输入的汉字数量

如果你后面想加“候选人姓名”“成绩导出”“多题库管理”这些功能，这个版本也可以继续往上扩。 
