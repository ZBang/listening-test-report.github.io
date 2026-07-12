# Listening-test static report

该目录是可直接发布到 GitHub Pages 的静态结果网页，包含：

- 有效人数、总票数以及 16k/48k 总胜率；
- 100 组样本按票差排序的柱状图；
- 五组原始混叠语音、16k 和 48k 音频对比；
- 三列统一使用 0–24 kHz 纵轴的语谱图和可播放音频。

## 重新生成数据和资源

在 `Mos/github` 目录执行：

```bash
python3 build_site.py
```

默认输入：

```text
../anyan_api/exports/pairwise_35_votes.tsv
../anyan_api/survey_data/pairwise_demo.json
../anyan_api/survey_data/
/public/home/smiip/zbang/corpus/URGENT/validation_leaderboard_with_label/simulation_validation_leaderboard/noisy/noisy/
```

也可显式指定：

```bash
python3 build_site.py \
  --votes ../anyan_api/exports/pairwise_35_votes.tsv \
  --survey ../anyan_api/survey_data/pairwise_demo.json \
  --audio-root ../anyan_api/survey_data \
  --mixture-root /public/home/smiip/zbang/corpus/URGENT/validation_leaderboard_with_label/simulation_validation_leaderboard/noisy/noisy \
  --survey-id 35 \
  --top-k 5
```

构建脚本会重新生成：

- `data/results.json`
- `assets/audio/mixture/`
- `assets/audio/16k/`
- `assets/audio/48k/`
- `assets/spectrograms/`

## 本地预览

浏览器直接打开 `index.html` 时可能因 `file://` 限制无法读取 JSON，应启动静态服务器：

```bash
python3 -m http.server 8000
```

访问：

```text
http://127.0.0.1:8000/
```

## 发布到 GitHub Pages

将本目录内容提交到 GitHub 仓库，然后在仓库设置中选择：

```text
Settings → Pages → Deploy from a branch
```

选择包含这些文件的分支及目录即可。网页不依赖 Django、数据库或外部 JavaScript CDN。
