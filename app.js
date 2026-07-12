const SVG_NS = "http://www.w3.org/2000/svg";

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
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
    { label: "Valid Participants", value: data.meta.participants, detail: "Completed the full survey", color: "#65e6a7" },
    { label: "Total Votes", value: formatNumber(data.overall.totalVotes), detail: `${data.meta.audioGroups} audio comparisons`, color: "#5386ff" },
    { label: "16k Wins", value: `${data.overall.rate16k}%`, detail: `${data.overall.wins16k} votes`, color: "#ff9b64" },
    { label: "48k Wins", value: `${data.overall.rate48k}%`, detail: `${data.overall.wins48k} votes`, color: "#55d6e8" },
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
    <div class="balance-bar" aria-label="Overall vote share for 16k and 48k">
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
      "aria-label": `${item.fileid}, vote difference ${difference}, 16k ${item.wins16k} votes, 48k ${item.wins48k} votes`,
    });
    const showTooltip = (event) => {
      const sign = difference > 0 ? "+" : "";
      tooltip.innerHTML = `<strong>${item.fileid}</strong><br>16k: ${item.wins16k} votes<br>48k: ${item.wins48k} votes<br>Difference: ${sign}${difference}`;
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
  xLabel.textContent = `${sorted.length} audio pairs sorted by vote difference`;
  svg.append(xLabel);

  const yLabel = svgElement("text", {
    x: 16,
    y: margin.top + plotHeight / 2,
    fill: "#9ca9bd",
    "font-size": "12",
    "text-anchor": "middle",
    transform: `rotate(-90 16 ${margin.top + plotHeight / 2})`,
  });
  yLabel.textContent = "Vote difference (48k − 16k)";
  svg.append(yLabel);
  document.querySelector("#vote-chart").replaceChildren(svg);
}

function audioPanel(item, key, label, modifier) {
  const info = item[`info${key}`];
  const article = document.createElement("article");
  article.className = "audio-panel";
  article.innerHTML = `
    <div class="audio-panel__top">
      <span class="rate-label rate-label--${modifier}">${label}</span>
      <span class="audio-meta">${(info.sampleRate / 1000).toFixed(0)} kHz file · ${info.duration.toFixed(2)} s</span>
    </div>
    <div class="spectrogram-frame">
      <img src="${item[`spectrogram${key}`]}" alt="${label} spectrogram for ${item.fileid}" loading="lazy">
    </div>
    <audio controls preload="metadata" src="${item[`audio${key}`]}">
      Your browser does not support audio playback.
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
          <p>Survey question ${item.question}</p>
        </div>
      </header>
    `;
    const grid = document.createElement("div");
    grid.className = "spectrogram-grid";
    grid.append(
      audioPanel(item, "Mixture", "Original Mixture", "mixture"),
      audioPanel(item, "16k", "16k Condition", "16"),
      audioPanel(item, "48k", "48k Condition", "48"),
    );
    card.append(grid);
    return card;
  });
  list.replaceChildren(...cards);
}

function showError(error) {
  const message = document.createElement("div");
  message.className = "error-state";
  message.textContent = `Unable to load results: ${error.message}`;
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
    document.querySelector("#generated-at").textContent = `Updated ${formatDate(data.meta.generatedAt)}`;
    renderSummary(data);
    renderChart(data.series);
    renderComparisons(data);
  } catch (error) {
    console.error(error);
    showError(error);
  }
}

initialize();
