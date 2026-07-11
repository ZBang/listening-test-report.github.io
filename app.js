const SVG_NS = "http://www.w3.org/2000/svg";

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function renderSummary(data) {
  const metrics = [
    { label: "有效参与者", value: data.meta.participants, detail: "完成全部题目的问卷", color: "#65e6a7" },
    { label: "总投票数", value: formatNumber(data.overall.totalVotes), detail: `${data.meta.audioGroups} 组音频对比`, color: "#5386ff" },
    { label: "16k 获胜", value: `${data.overall.rate16k}%`, detail: `${data.overall.wins16k} 票`, color: "#ff9b64" },
    { label: "48k 获胜", value: `${data.overall.rate48k}%`, detail: `${data.overall.wins48k} 票`, color: "#55d6e8" },
  ];
  const grid = document.querySelector("#summary-grid");
  grid.replaceChildren(...metrics.map((metric) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.style.setProperty("--accent", metric.color);
    card.innerHTML = `
      <span class="metric-card__label">${metric.label}</span>
      <strong class="metric-card__value">${metric.value}</strong>
      <span class="metric-card__detail">${metric.detail}</span>
    `;
    return card;
  }));

  const balance = document.querySelector("#overall-balance");
  balance.innerHTML = `
    <div class="balance-labels">
      <span>16k · ${data.overall.rate16k}%</span>
      <span>48k · ${data.overall.rate48k}%</span>
    </div>
    <div class="balance-bar" aria-label="16k 与 48k 总体得票比例">
      <span class="balance-bar__16" style="width:${data.overall.rate16k}%"></span>
      <span class="balance-bar__48" style="width:${data.overall.rate48k}%"></span>
    </div>
  `;
}

function renderChart(series) {
  const width = 1160;
  const height = 430;
  const margin = { top: 20, right: 24, bottom: 58, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const sorted = [...series].sort((left, right) =>
    left.margin48k - right.margin48k || left.question - right.question
  );
  const maxDifference = Math.max(2, ...sorted.map((item) => Math.abs(item.margin48k)));
  const limit = Math.ceil(maxDifference / 2) * 2;
  const y = (value) => margin.top + ((limit - value) / (limit * 2)) * plotHeight;
  const zeroY = y(0);
  const bandWidth = plotWidth / sorted.length;
  const barWidth = Math.max(2, bandWidth * 0.72);
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}` });

  for (let value = -limit; value <= limit; value += 2) {
    const gridY = y(value);
    svg.append(svgElement("line", {
      x1: margin.left,
      y1: gridY,
      x2: width - margin.right,
      y2: gridY,
      stroke: value === 0 ? "rgba(255,255,255,.52)" : "rgba(255,255,255,.09)",
      "stroke-width": value === 0 ? "1.5" : "1",
      "stroke-dasharray": value === 0 ? "5 4" : "none",
    }));
    const label = svgElement("text", {
      x: margin.left - 12,
      y: gridY + 4,
      fill: "#8290a5",
      "font-size": "11",
      "text-anchor": "end",
    });
    label.textContent = value;
    svg.append(label);
  }

  const tooltip = document.querySelector("#chart-tooltip");
  sorted.forEach((item, index) => {
    const difference = item.margin48k;
    const top = difference > 0 ? y(difference) : zeroY;
    const bottom = difference < 0 ? y(difference) : zeroY;
    const heightValue = difference === 0 ? 4 : Math.abs(bottom - top);
    const color = difference < 0 ? "#4fa9dc" : difference > 0 ? "#f2a007" : "#8d9299";
    const bar = svgElement("rect", {
      x: margin.left + index * bandWidth + (bandWidth - barWidth) / 2,
      y: difference === 0 ? zeroY - 2 : Math.min(top, bottom),
      width: barWidth,
      height: heightValue,
      rx: Math.min(2, barWidth / 3),
      fill: color,
      tabindex: "0",
      "aria-label": `${item.fileid}，票差${difference}，16k ${item.wins16k}票，48k ${item.wins48k}票`,
    });
    const showTooltip = (event) => {
      const sign = difference > 0 ? "+" : "";
      tooltip.innerHTML = `<strong>${item.fileid}</strong><br>16k：${item.wins16k} 票<br>48k：${item.wins48k} 票<br>票差：${sign}${difference}`;
      tooltip.hidden = false;
      const source = event.touches?.[0] || event;
      const bounds = bar.getBoundingClientRect();
      const clientX = Number.isFinite(source.clientX) ? source.clientX : bounds.left;
      const clientY = Number.isFinite(source.clientY) ? source.clientY : bounds.top;
      tooltip.style.left = `${Math.min(clientX + 14, window.innerWidth - 190)}px`;
      tooltip.style.top = `${Math.max(clientY - 86, 8)}px`;
    };
    bar.addEventListener("mousemove", showTooltip);
    bar.addEventListener("focus", showTooltip);
    bar.addEventListener("mouseleave", () => { tooltip.hidden = true; });
    bar.addEventListener("blur", () => { tooltip.hidden = true; });
    svg.append(bar);
  });

  const xLabel = svgElement("text", {
    x: margin.left + plotWidth / 2,
    y: height - 3,
    fill: "#9ca9bd",
    "font-size": "12",
    "text-anchor": "middle",
  });
  xLabel.textContent = `按票差从低到高排列的 ${sorted.length} 组音频`;
  svg.append(xLabel);

  const yLabel = svgElement("text", {
    x: 16,
    y: margin.top + plotHeight / 2,
    fill: "#9ca9bd",
    "font-size": "12",
    "text-anchor": "middle",
    transform: `rotate(-90 16 ${margin.top + plotHeight / 2})`,
  });
  yLabel.textContent = "票差（48k − 16k）";
  svg.append(yLabel);
  document.querySelector("#vote-chart").replaceChildren(svg);
}

function audioPanel(item, rate) {
  const info = item[`info${rate}`];
  const article = document.createElement("article");
  article.className = "audio-panel";
  article.innerHTML = `
    <div class="audio-panel__top">
      <span class="rate-label rate-label--${rate}">${rate} 条件</span>
      <span class="audio-meta">${(info.sampleRate / 1000).toFixed(0)} kHz 文件 · ${info.duration.toFixed(2)} 秒</span>
    </div>
    <div class="spectrogram-frame">
      <img src="${item[`spectrogram${rate}`]}" alt="${item.fileid} 的 ${rate} 音频语谱图" loading="lazy">
    </div>
    <audio controls preload="metadata" src="${item[`audio${rate}`]}">
      浏览器不支持音频播放。
    </audio>
  `;
  return article;
}

function renderComparisons(data) {
  const list = document.querySelector("#comparison-list");
  const cards = data.topComparisons.map((item) => {
    const card = document.createElement("article");
    card.className = "comparison-card";
    card.innerHTML = `
      <header class="comparison-card__header">
        <div class="rank">#${item.rank}</div>
        <div class="comparison-card__title">
          <h3>${item.fileid}</h3>
          <p>问卷第 ${item.question} 题</p>
        </div>
      </header>
    `;
    const grid = document.createElement("div");
    grid.className = "spectrogram-grid";
    grid.append(audioPanel(item, "16k"), audioPanel(item, "48k"));
    card.append(grid);
    return card;
  });
  list.replaceChildren(...cards);
}

function showError(error) {
  const message = document.createElement("div");
  message.className = "error-state";
  message.textContent = `无法载入结果数据：${error.message}`;
  document.querySelector("#summary-grid").replaceChildren(message);
}

async function initialize() {
  try {
    const response = await fetch("data/results.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const surveyLabel = `${data.meta.surveyGroup} / ${data.meta.surveyName} · Survey ${data.meta.surveyId}`;
    document.querySelector("#survey-name").textContent = surveyLabel;
    document.querySelector("#footer-survey").textContent = surveyLabel;
    document.querySelector("#generated-at").textContent = `更新于 ${formatDate(data.meta.generatedAt)}`;
    renderSummary(data);
    renderChart(data.series);
    renderComparisons(data);
  } catch (error) {
    console.error(error);
    showError(error);
  }
}

initialize();
