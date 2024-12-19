/* global document, window, d3 */

class BarChartRace {
  constructor(containerId, config = {}) {
    this.containerId = containerId;
    
    // 默認配置
    const defaultConfig = {
      type: "barRace",
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 50,
            right: 250,
            bottom: 30,
            left: 150
          }
        },
        animation: {
          duration: 250,
          easing: "linear"
        },
        scales: {
          x: {
            type: "linear",
            position: "bottom",
            title: {
              display: true,
              text: "銷量"
            }
          },
          y: {
            type: "category",
            position: "left",
            title: {
              display: true,
              text: "品牌"
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: "手機品牌銷量排行"
          },
          legend: {
            display: false
          }
        }
      }
    };

    // 深度合併配置
    this.config = this.mergeConfig(defaultConfig, config);
    this.currentFrame = 0;
    this.isPlaying = false;

    // 添加控制項設置
    this.settings = {
      keepZeroItems: false,
      duration: 250
    };

    // 添加曾經出現過的品牌記錄
    this.appearedBrands = new Set();

    this.initialize();
  }

  // 深度合併配置對象
  mergeConfig(target, source) {
    const merged = { ...target };

    for (const key in source) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        merged[key] = this.mergeConfig(target[key] || {}, source[key]);
      } else {
        merged[key] = source[key];
      }
    }

    return merged;
  }

  initialize() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      throw new Error(`Container with id "${this.containerId}" not found`);
    }

    // 添加控制項容器 (移到最前面)
    const controls = document.createElement("div");
    controls.className = "controls";
    controls.style.margin = "20px";
    controls.style.textAlign = "center";
    container.insertBefore(controls, container.firstChild);  // 改用 insertBefore

    // 添加進度條容器
    const progressContainer = document.createElement("div");
    progressContainer.className = "progress-container";
    progressContainer.style.display = "flex";
    progressContainer.style.alignItems = "center";
    progressContainer.style.justifyContent = "center";
    progressContainer.style.marginBottom = "20px";
    progressContainer.style.gap = "20px";
    controls.appendChild(progressContainer);

    // 添加開始時間標籤
    this.startTimeLabel = document.createElement("span");
    this.startTimeLabel.className = "time-label";
    this.startTimeLabel.style.minWidth = "80px";
    this.startTimeLabel.style.textAlign = "center";
    this.startTimeLabel.style.fontSize = "14px";
    this.startTimeLabel.style.fontFamily = "monospace";
    progressContainer.appendChild(this.startTimeLabel);

    // 添加進度條
    this.progressBar = document.createElement("input");
    this.progressBar.type = "range";
    this.progressBar.id = "progress";
    this.progressBar.min = "0";
    this.progressBar.max = "100";
    this.progressBar.value = "0";
    this.progressBar.style.width = "80%";
    progressContainer.appendChild(this.progressBar);

    // 添加結束時間標籤
    this.endTimeLabel = document.createElement("span");
    this.endTimeLabel.className = "time-label";
    this.endTimeLabel.style.minWidth = "80px";
    this.endTimeLabel.style.textAlign = "center";
    this.endTimeLabel.style.fontSize = "14px";
    this.endTimeLabel.style.fontFamily = "monospace";
    progressContainer.appendChild(this.endTimeLabel);

    // 添加按鈕容器
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "button-container";
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "10px";
    progressContainer.appendChild(buttonContainer);

    // 添加播放/暫停按鈕
    this.playPauseButton = document.createElement("button");
    this.playPauseButton.className = "control-button";
    this.playPauseButton.style.width = "48px";
    this.playPauseButton.style.height = "48px";
    this.playPauseButton.style.borderRadius = "50%";
    this.playPauseButton.style.border = "none";
    this.playPauseButton.style.backgroundColor = "#007AFF";
    this.playPauseButton.style.color = "white";
    this.playPauseButton.style.cursor = "pointer";
    this.playPauseButton.style.fontSize = "18px";
    this.playPauseButton.style.display = "flex";
    this.playPauseButton.style.alignItems = "center";
    this.playPauseButton.style.justifyContent = "center";
    this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
    buttonContainer.appendChild(this.playPauseButton);

    // 添加重置按鈕
    this.resetButton = document.createElement("button");
    this.resetButton.className = "control-button";
    this.resetButton.style.width = "48px";
    this.resetButton.style.height = "48px";
    this.resetButton.style.borderRadius = "50%";
    this.resetButton.style.border = "none";
    this.resetButton.style.backgroundColor = "#007AFF";
    this.resetButton.style.color = "white";
    this.resetButton.style.cursor = "pointer";
    this.resetButton.style.fontSize = "18px";
    this.resetButton.style.display = "flex";
    this.resetButton.style.alignItems = "center";
    this.resetButton.style.justifyContent = "center";
    this.resetButton.innerHTML = "<i class=\"fas fa-redo\"></i>";
    buttonContainer.appendChild(this.resetButton);

    // 添加設置容器
    const settingsContainer = document.createElement("div");
    settingsContainer.className = "settings-container";
    settingsContainer.style.margin = "10px 0";
    settingsContainer.style.textAlign = "center";
    controls.appendChild(settingsContainer);

    // 添加保留零值選項
    const keepZeroLabel = document.createElement("label");
    keepZeroLabel.className = "setting-item";
    keepZeroLabel.style.display = "inline-flex";
    keepZeroLabel.style.alignItems = "center";
    keepZeroLabel.style.gap = "5px";
    keepZeroLabel.style.cursor = "pointer";
    settingsContainer.appendChild(keepZeroLabel);

    this.keepZeroCheckbox = document.createElement("input");
    this.keepZeroCheckbox.type = "checkbox";
    this.keepZeroCheckbox.id = "keepZeroItems";
    this.keepZeroCheckbox.checked = this.settings.keepZeroItems;
    keepZeroLabel.appendChild(this.keepZeroCheckbox);

    const keepZeroText = document.createTextNode("保留零值項目");
    keepZeroLabel.appendChild(keepZeroText);

    // 初始化 D3.js 圖表 (移到控制項之後)
    const margin = this.config.options.layout.padding;
    this.width = container.clientWidth - margin.left - margin.right;
    this.height = container.clientHeight - margin.top - margin.bottom;
    
    this.svg = d3.select(`#${this.containerId}`)
      .append("svg")
      .attr("width", container.clientWidth)
      .attr("height", container.clientHeight)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // 初始化比例尺
    this.x = d3.scaleLinear().range([0, this.width]);
    this.y = d3.scaleBand()
      .range([0, this.height])
      .padding(0.2);

    // 添加固定的最大顯示數量
    this.maxBars = 12;  // 設定最大顯示數量

    // 添加日期標籤
    this.dateLabel = this.svg.append("text")
      .attr("class", "date-label")
      .attr("x", this.width - 50)
      .attr("y", this.height - 25)
      .style("font-size", "24px")
      .style("font-weight", "bold")
      .style("fill", "#666");

    // 設置事件監聽器
    this.setupEventListeners();

    // 設置初始時間標籤
    if (this.config.data.labels && this.config.data.labels.length > 0) {
      this.startTimeLabel.textContent = this.config.data.labels[0];
      this.endTimeLabel.textContent = this.config.data.labels[this.config.data.labels.length - 1];
    }

    // 添加 Font Awesome 樣式表（如果還沒有添加）
    if (!document.querySelector("link[href*=\"font-awesome\"]")) {
      const fontAwesome = document.createElement("link");
      fontAwesome.rel = "stylesheet";
      fontAwesome.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css";
      document.head.appendChild(fontAwesome);
    }
  }

  setupEventListeners() {
    this.progressBar.addEventListener("input", () => {
      const wasPlaying = this.isPlaying;
      this.pause();
      
      this.currentFrame = Math.floor((this.progressBar.value / 100) * 
        (this.config.data.labels.length - 1));
      this.updateChart(this.getCurrentData());

      if (wasPlaying) {
        this.play();
      }
    });

    this.playPauseButton.addEventListener("click", () => {
      if (this.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    });

    this.resetButton.addEventListener("click", () => {
      this.reset();
    });

    this.keepZeroCheckbox.addEventListener("change", () => {
      this.settings.keepZeroItems = this.keepZeroCheckbox.checked;
      this.updateChart(this.getCurrentData());
    });
  }

  getCurrentData() {
    const currentData = this.config.data.datasets.map(dataset => {
      const value = dataset.data[this.currentFrame];
      if (value > 0) {
        this.appearedBrands.add(dataset.label);
      }
      return {
        label: dataset.label,
        value: value,
        color: dataset.backgroundColor,
        date: this.config.data.labels[this.currentFrame]
      };
    });

    return currentData
      .sort((a, b) => b.value - a.value)
      .filter(d => {
        if (d.value > 0) return true;
        if (!this.settings.keepZeroItems) return false;
        return this.appearedBrands.has(d.label);
      })
      .slice(0, this.maxBars);  // 限制顯示數量
  }

  updateChart(data) {
    // 固定長條圖高度和間距
    const barHeight = 30;  // 固定每個長條的高度
    const barPadding = 15; // 固定長條之間的間距
    const totalBarSpace = barHeight + barPadding; // 每個長條佔用的總空間

    // 計算所需的總高度
    const totalHeight = data.length * totalBarSpace;
    
    // 更新比例尺
    this.x.domain([0, d3.max(data, d => d.value)]);
    this.y
      .domain(data.map(d => d.label))
      .range([0, totalHeight])
      .padding(barPadding / (barHeight + barPadding));  // 根據實際間距計算padding

    // 更新 SVG 容器高度
    const margin = this.config.options.layout.padding;
    const svgHeight = totalHeight + margin.top + margin.bottom;
    this.svg.attr("height", svgHeight);

    // 更新長條
    const bars = this.svg.selectAll("rect")
      .data(data, d => d.label);

    // 移除舊的長條
    bars.exit()
      .transition()
      .duration(this.config.options.animation.duration * 0.2)
      .ease(d3.easeLinear)
      .attr("y", svgHeight)  // 移動到底部
      .style("opacity", 0)
      .transition()
      .duration(0)
      .attr("width", 0)
      .remove();

    // 添加新的長條
    const barsEnter = bars.enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("width", 0)
      .attr("y", d => this.y(d.label))
      .attr("height", this.y.bandwidth())
      .attr("fill", d => d.color || "#1f77b4");

    // 合併現有和新的長條，並應用過渡
    bars.merge(barsEnter)
      .transition()
      .duration(this.config.options.animation.duration)
      .ease(d3.easeLinear)
      .attr("width", d => this.x(d.value))
      .attr("y", d => this.y(d.label))
      .attr("height", this.y.bandwidth());

    // 更新標籤
    const labels = this.svg.selectAll(".bar-label")
      .data(data, d => d.label);

    // 標籤也使用相同的退出動畫
    labels.exit()
      .transition()
      .duration(this.config.options.animation.duration * 0.2)
      .ease(d3.easeLinear)
      .attr("y", svgHeight)
      .style("opacity", 0)
      .remove();

    const formatNumber = d3.format(",");
    
    labels.enter()
      .append("text")
      .attr("class", "bar-label")
      .attr("x", d => this.x(d.value) + 5)
      .attr("y", d => this.y(d.label) + this.y.bandwidth() / 2)
      .attr("dy", ".35em")
      .text(d => `${d.label}: 0`)  // 初始值設為 0
      .merge(labels)
      .transition()
      .duration(this.config.options.animation.duration)
      .attr("x", d => this.x(d.value) + 5)
      .attr("y", d => this.y(d.label) + this.y.bandwidth() / 2)
      .tween("text", function(d) {
        const node = this;
        const currentValue = node._currentValue || 0;  // 獲取當前值
        const i = d3.interpolate(currentValue, d.value);  // 創建插值器
        node._currentValue = d.value;  // 保存新值
        return function(t) {
          node.textContent = `${d.label}: ${formatNumber(Math.round(i(t)))}`;
        };
      });

    // 更新日期標籤
    if (data[0] && data[0].date) {
      this.dateLabel.text(data[0].date);
    }
  }

  play() {
    this.isPlaying = true;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-pause\"></i>";
    this.animate();
  }

  pause() {
    this.isPlaying = false;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
  }

  reset() {
    this.currentFrame = 0;
    this.progressBar.value = 0;
    this.updateChart(this.getCurrentData());
    this.play();
  }

  animate() {
    if (!this.isPlaying) return;

    const currentData = this.getCurrentData();
    this.updateChart(currentData);

    this.progressBar.value = (this.currentFrame / (this.config.data.labels.length - 1)) * 100;
    this.currentFrame = (this.currentFrame + 1) % this.config.data.labels.length;
    
    if (this.currentFrame < this.config.data.labels.length) {
      setTimeout(() => this.animate(), this.config.options.animation.duration);
    } else {
      this.pause();
    }
  }
}

// 確保在瀏覽器環境中可用
if (typeof window !== "undefined") {
  window.BarChartRace = BarChartRace;
}

// 如果在 Node.js 環境中
if (typeof module !== "undefined" && module.exports) {
  // 在 Node.js 環境中需要的依賴
  const d3 = require("d3");
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  
  // 設置全局變量
  global.document = dom.window.document;
  global.window = dom.window;
  
  module.exports = BarChartRace;
} 