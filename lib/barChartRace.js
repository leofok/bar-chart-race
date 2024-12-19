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
        },
        container: {
          showFrame: true,  // 是否顯示外框
          padding: 20,      // 框內邊距
          background: "white",
          borderRadius: 8,
          shadow: "0 2px 4px rgba(0,0,0,0.1)"
        }
      }
    };

    // 深度合併配置
    this.config = this.mergeConfig(defaultConfig, config);
    this.currentFrame = 0;
    this.isPlaying = false;
    this.isDragging = false;
    this.animationTimer = null;  // 添加動畫計時器引用

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
    container.insertBefore(controls, container.firstChild);

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
    
    // 從配置中獲取圖表大小，如果沒有設置則使用容器大小
    this.width = this.config.options.width || 1200;
    this.height = this.config.options.height || 500;
    
    // 計算實際繪圖區域大小
    this.width = this.width - margin.left - margin.right;
    this.height = this.height - margin.top - margin.bottom;
    
    this.svg = d3.select(`#${this.containerId}`)
      .append("svg")
      .attr("width", this.width + margin.left + margin.right)
      .attr("height", this.height + margin.top + margin.bottom)
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
    let wasPlaying = false;

    // 開始拖動
    this.progressBar.addEventListener("mousedown", () => {
      this.isDragging = true;
      wasPlaying = this.isPlaying;
      
      // 停止所有動畫
      this.stopAnimation();
    });

    // 拖動中
    this.progressBar.addEventListener("input", () => {
      if (this.isDragging) {
        this.currentFrame = Math.floor((this.progressBar.value / 100) * 
          (this.config.data.labels.length - 1));
        this.updateChart(this.getCurrentData(), false);
      }
    });

    // 拖動結束
    const endDragging = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.updateChart(this.getCurrentData(), true);
        
        // 等待最後一個更新完成後再恢復播放
        if (wasPlaying) {
          setTimeout(() => {
            if (!this.isDragging) {  // 再次確認沒有新的拖動
              this.play();
            }
          }, this.config.options.animation.duration);
        }
      }
    };

    this.progressBar.addEventListener("mouseup", endDragging);
    this.progressBar.addEventListener("mouseleave", endDragging);

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
    // 檢查是否已到結束位置
    if (this.currentFrame >= this.config.data.labels.length) {
      this.currentFrame = this.config.data.labels.length - 1;  // 確保不會超出範圍
    }

    const currentData = this.config.data.datasets.map(dataset => {
      const value = dataset.data[this.currentFrame];
      if (value > 0) {
        this.appearedBrands.add(dataset.label);
      }
      return {
        label: dataset.label,
        value: value || 0,  // 確保值為數字
        color: dataset.backgroundColor,
        date: this.config.data.labels[this.currentFrame]
      };
    });

    // 根據設置過濾數據
    const filteredData = currentData
      .sort((a, b) => b.value - a.value)
      .filter(d => {
        if (d.value > 0) return true;
        if (!this.settings.keepZeroItems) return false;
        // 只保留曾經出現過的品牌
        return this.appearedBrands.has(d.label);
      })
      .slice(0, this.maxBars);

    // 確保至少有一個項目
    if (filteredData.length === 0 && this.settings.keepZeroItems) {
      return currentData
        .filter(d => this.appearedBrands.has(d.label))
        .sort((a, b) => b.value - a.value)
        .slice(0, this.maxBars);
    }

    return filteredData;
  }

  updateChart(data, animate = true) {
    // 如果正在拖動，強制不使用動畫
    if (this.isDragging) {
      animate = false;
    }

    // 設定固定的長條圖參數
    const barHeight = 35;        // 每個長條的高度
    const barPadding = 20;       // 長條之間的間距
    const totalBarSpace = barHeight + barPadding;  // 每個長條的總空間

    // 計算所需的總高度
    const totalHeight = data.length * totalBarSpace;
    const margin = this.config.options.layout.padding;
    const svgHeight = totalHeight + margin.top + margin.bottom;

    // 更新 SVG 容器高度
    const svgContainer = this.svg.node().parentNode;
    svgContainer.setAttribute("height", svgHeight);

    // 更新比例尺
    this.x.domain([0, d3.max(data, d => d.value)]);
    this.y
      .domain(data.map(d => d.label))
      .range([0, totalHeight])
      .paddingInner(barPadding / totalBarSpace)  // 設定內部間距比例
      .paddingOuter(barPadding / (2 * totalBarSpace));  // 設定外部間距比例

    // 更新長條
    const bars = this.svg.selectAll("rect")
      .data(data, d => d.label);

    // 立即移除退出的元素（不使用動畫）
    if (!animate) {
      bars.exit().remove();
    } else {
      bars.exit()
        .transition()
        .duration(this.config.options.animation.duration * 0.2)
        .ease(d3.easeLinear)
        .attr("y", svgHeight)
        .style("opacity", 0)
        .remove();
    }

    // 添加新的長條
    const barsEnter = bars.enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("width", 0)
      .attr("y", d => this.y(d.label))
      .attr("height", barHeight)
      .attr("fill", d => d.color || "#1f77b4");

    // 合併現有和新的長條
    const barsUpdate = bars.merge(barsEnter);
    
    if (animate) {
      // 使用動畫過渡
      barsUpdate.transition()
        .duration(this.config.options.animation.duration)
        .ease(d3.easeLinear)
        .attr("width", d => this.x(d.value))
        .attr("y", d => this.y(d.label))
        .attr("height", barHeight);
    } else {
      // 立即更新，不使用動畫
      barsUpdate
        .attr("width", d => this.x(d.value))
        .attr("y", d => this.y(d.label))
        .attr("height", barHeight);
    }

    // 更新標籤
    const labels = this.svg.selectAll(".bar-label")
      .data(data, d => d.label);

    // 立即移除退出的標籤（不使用動畫）
    if (!animate) {
      labels.exit().remove();
    } else {
      labels.exit()
        .transition()
        .duration(this.config.options.animation.duration * 0.2)
        .ease(d3.easeLinear)
        .attr("y", svgHeight)
        .style("opacity", 0)
        .remove();
    }

    const labelsEnter = labels.enter()
      .append("text")
      .attr("class", "bar-label")
      .attr("x", d => this.x(d.value) + 5)
      .attr("y", d => this.y(d.label) + barHeight / 2)
      .attr("dy", ".35em")
      .text(d => `${d.label}: ${d3.format(",")(d.value)}`);

    const labelsUpdate = labels.merge(labelsEnter);

    if (animate) {
      // 使用動畫過渡
      labelsUpdate.transition()
        .duration(this.config.options.animation.duration)
        .attr("x", d => this.x(d.value) + 5)
        .attr("y", d => this.y(d.label) + barHeight / 2)
        .tween("text", function(d) {
          const node = this;
          let startValue = node._currentValue;
          if (typeof startValue !== "number") {
            startValue = 0;
          }
          const i = d3.interpolate(startValue, d.value);
          node._currentValue = d.value;

          return function(t) {
            const interpolatedValue = Math.round(i(t));
            node.textContent = `${d.label}: ${d3.format(",")(interpolatedValue)}`;
          };
        });
    } else {
      // 立即更新，不使用動畫
      labelsUpdate
        .attr("x", d => this.x(d.value) + 5)
        .attr("y", d => this.y(d.label) + barHeight / 2)
        .text(d => `${d.label}: ${d3.format(",")(d.value)}`);
    }

    // 更新日期標籤
    this.dateLabel
      .attr("y", totalHeight - 25);

    if (data[0] && data[0].date) {
      this.dateLabel.text(data[0].date);
    }

    // 更新容器大小
    const controlsHeight = document.querySelector(".controls").offsetHeight;  // 獲取控制項高度
    const containerWidth = this.width + margin.left + margin.right;
    const containerHeight = svgHeight + controlsHeight;  // 加上控制項高度
    
    const container = document.getElementById(this.containerId);
    if (this.config.options.container.showFrame) {
      // 設置容器樣式
      container.style.width = `${containerWidth}px`;
      container.style.height = `${containerHeight}px`;
      container.style.backgroundColor = this.config.options.container.background;
      container.style.padding = `${this.config.options.container.padding}px`;
      container.style.borderRadius = `${this.config.options.container.borderRadius}px`;
      container.style.boxShadow = this.config.options.container.shadow;

      // 調整控制項容器的位置
      const controls = document.querySelector(".controls");
      controls.style.marginTop = "0";  // 重置 margin
      controls.style.marginBottom = "20px";  // 保持與圖表的間距
    } else {
      container.style.backgroundColor = "transparent";
      container.style.padding = "0";
      container.style.borderRadius = "0";
      container.style.boxShadow = "none";
    }
  }

  play() {
    if (this.isDragging) return;  // 如果正在拖動，不開始播放
    
    // 如果已經播放完畢，重新開始
    if (this.currentFrame >= this.config.data.labels.length - 1) {
      this.currentFrame = 0;
      this.progressBar.value = 0;
    }
    
    this.isPlaying = true;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-pause\"></i>";
    this.animate();
  }

  pause() {
    this.isPlaying = false;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
    
    // 確保停止所有動畫
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
  }

  reset() {
    this.stopAnimation();  // 確保停止所��動畫
    this.currentFrame = 0;
    this.progressBar.value = 0;
    this.updateChart(this.getCurrentData(), true);
    this.play();
  }

  animate() {
    if (!this.isPlaying || this.isDragging) return;

    const currentData = this.getCurrentData();
    this.updateChart(currentData, true);

    this.progressBar.value = (this.currentFrame / (this.config.data.labels.length - 1)) * 100;
    this.currentFrame++;
    
    if (this.currentFrame < this.config.data.labels.length) {
      this.animationTimer = setTimeout(() => {
        if (!this.isDragging) {
          this.animate();
        }
      }, this.config.options.animation.duration);
    } else {
      // 結束時保持最後一幀的狀態
      this.currentFrame = this.config.data.labels.length - 1;
      this.updateChart(this.getCurrentData(), true);
      this.stopAnimation();
    }
  }

  stopAnimation() {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    
    this.svg.selectAll("*").interrupt();
    this.pause();

    // 確保進度條顯示正確的位置
    if (this.currentFrame >= this.config.data.labels.length) {
      this.currentFrame = this.config.data.labels.length - 1;
      this.progressBar.value = 100;
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