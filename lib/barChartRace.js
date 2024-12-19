/* global document, window, d3, requestAnimationFrame */

// 如果在 Node.js 環境中，添加 requestAnimationFrame polyfill
if (typeof requestAnimationFrame === "undefined") {
  global.requestAnimationFrame = callback => setTimeout(callback, 1000 / 60);
}

class BarChartRace {
  constructor(containerId, config = {}) {
    this.containerId = containerId;
    this.margin = {
      top: 30,
      right: 250,
      bottom: 30,
      left: 30
    };
    
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
          duration: 2000,
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

    // 添加曾經出現的品牌記
    this.appearedBrands = new Set();

    // 保存對 keepZeroLabel 的引用
    this.keepZeroLabel = null;

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
    controls.style.margin = "0";
    controls.style.marginBottom = "0";
    controls.style.textAlign = "center";
    container.insertBefore(controls, container.firstChild);

    // 添加進度條容器
    const progressContainer = document.createElement("div");
    progressContainer.className = "progress-container";
    progressContainer.style.display = "flex";
    progressContainer.style.flexDirection = "column";
    progressContainer.style.alignItems = "center";
    progressContainer.style.marginBottom = "0";
    progressContainer.style.paddingBottom = "0";  // 移除內邊距
    controls.appendChild(progressContainer);

    // 修改時間軸容器的樣式
    const timelineContainer = document.createElement("div");
    timelineContainer.style.display = "flex";
    timelineContainer.style.alignItems = "center";
    timelineContainer.style.justifyContent = "space-between";
    timelineContainer.style.width = "100%";
    timelineContainer.style.gap = "10px";
    progressContainer.appendChild(timelineContainer);

    // 添加開始時間標籤
    this.startTimeLabel = document.createElement("span");
    this.startTimeLabel.className = "time-label";
    this.startTimeLabel.style.minWidth = "80px";
    this.startTimeLabel.style.textAlign = "center";
    timelineContainer.appendChild(this.startTimeLabel);

    // 添加進度條
    this.progressBar = document.createElement("input");
    this.progressBar.type = "range";
    this.progressBar.min = "0";
    this.progressBar.max = "100";
    this.progressBar.value = "0";
    this.progressBar.style.flex = "1";
    this.progressBar.style.margin = "0 10px";
    timelineContainer.appendChild(this.progressBar);

    // 添加結束時間標籤
    this.endTimeLabel = document.createElement("span");
    this.endTimeLabel.className = "time-label";
    this.endTimeLabel.style.minWidth = "80px";
    this.endTimeLabel.style.textAlign = "center";
    timelineContainer.appendChild(this.endTimeLabel);

    // 添加按鈕容器
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "button-container";
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "10px";
    buttonContainer.style.marginLeft = "10px";
    timelineContainer.appendChild(buttonContainer);

    // 添加播放/暫停按鈕
    this.playPauseButton = document.createElement("button");
    this.playPauseButton.className = "control-button";
    this.playPauseButton.style.width = "36px";  // 稍微縮小按鈕
    this.playPauseButton.style.height = "36px";
    this.playPauseButton.style.borderRadius = "50%";
    this.playPauseButton.style.border = "none";
    this.playPauseButton.style.backgroundColor = "#007AFF";
    this.playPauseButton.style.color = "white";
    this.playPauseButton.style.cursor = "pointer";
    this.playPauseButton.style.fontSize = "14px";
    this.playPauseButton.style.display = "flex";
    this.playPauseButton.style.alignItems = "center";
    this.playPauseButton.style.justifyContent = "center";
    this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
    buttonContainer.appendChild(this.playPauseButton);

    // 添加重置按鈕
    this.resetButton = document.createElement("button");
    this.resetButton.className = "control-button";
    this.resetButton.style.width = "36px";  // 稍微縮小按鈕
    this.resetButton.style.height = "36px";
    this.resetButton.style.borderRadius = "50%";
    this.resetButton.style.border = "none";
    this.resetButton.style.backgroundColor = "#007AFF";
    this.resetButton.style.color = "white";
    this.resetButton.style.cursor = "pointer";
    this.resetButton.style.fontSize = "14px";
    this.resetButton.style.display = "flex";
    this.resetButton.style.alignItems = "center";
    this.resetButton.style.justifyContent = "center";
    this.resetButton.innerHTML = "<i class=\"fas fa-redo\"></i>";
    buttonContainer.appendChild(this.resetButton);

    // 添加日期標籤容器
    const dateLabelContainer = document.createElement("div");
    dateLabelContainer.style.width = "100%";
    dateLabelContainer.style.textAlign = "center";
    dateLabelContainer.style.marginTop = "10px";
    progressContainer.appendChild(dateLabelContainer);

    // 添加日期標籤
    this.dateLabel = document.createElement("div");
    this.dateLabel.className = "date-label";
    this.dateLabel.style.fontSize = "24px";
    this.dateLabel.style.fontWeight = "bold";
    this.dateLabel.style.color = "#666";
    dateLabelContainer.appendChild(this.dateLabel);

    // 添加設置容器
    const settingsContainer = document.createElement("div");
    settingsContainer.className = "settings-container";
    settingsContainer.style.margin = "0";
    settingsContainer.style.marginBottom = "0";
    settingsContainer.style.paddingBottom = "0";  // 移除內邊距
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

    // 保存引用
    this.keepZeroLabel = keepZeroLabel;

    this.keepZeroCheckbox = document.createElement("input");
    this.keepZeroCheckbox.type = "checkbox";
    this.keepZeroCheckbox.id = "keepZeroItems";
    this.keepZeroCheckbox.checked = this.settings.keepZeroItems;
    keepZeroLabel.appendChild(this.keepZeroCheckbox);

    const keepZeroText = document.createTextNode("保留零值項目");
    keepZeroLabel.appendChild(keepZeroText);

    // 初始化 D3.js 圖表 (移到控制項之後)
    this.margin = {
      top: 30,
      right: 250,
      bottom: 30,
      left: 30
    };
    
    // 從配置獲取圖表大小
    this.width = this.config.options.width || 1200;
    this.height = this.config.options.height || 500;
    
    // 計算實際繪圖區域大小
    this.width = this.width - this.margin.left - this.margin.right;
    // 保持原始高度設定
    
    // 創建主 SVG 容器
    const svg = d3.select(`#${this.containerId}`)
      .append("svg")
      .attr("width", this.width + this.margin.left + this.margin.right)
      .attr("height", this.height);  // 使用完整的高度

    // 創建主繪圖區域
    this.svg = svg.append("g")
      .attr("class", "main-chart")
      .attr("transform", `translate(${this.margin.left},${this.margin.top})`);

    // 創建 X 
    this.xAxis = this.svg.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.height})`);

    // 初始化比例尺
    this.x = d3.scaleLinear().range([0, this.width]);
    this.y = d3.scaleBand()
      .range([0, this.height])
      .padding(0.2);

    // 添加固定的最大顯示數量
    this.maxBars = 12;  // 設定最大顯示數量

    // 設置事件監聽器
    this.setupEventListeners();

    // 設置初始時間標籤
    if (this.config.data.labels && this.config.data.labels.length > 0) {
      this.startTimeLabel.textContent = this.config.data.labels[0];
      this.endTimeLabel.textContent = this.config.data.labels[this.config.data.labels.length - 1];
    }

    // 添加 Font Awesome 樣式表果還沒添加）
    if (!document.querySelector("link[href*=\"font-awesome\"]")) {
      const fontAwesome = document.createElement("link");
      fontAwesome.rel = "stylesheet";
      fontAwesome.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css";
      document.head.appendChild(fontAwesome);
    }

    // 設置日期標籤的初始字體大小
    const initialDateLabelSize = Math.max(14, Math.min(24, this.width / 30));
    this.dateLabel.style.fontSize = `${initialDateLabelSize}px`;

    // 設置時間標籤的初始字體大小
    const timeLabelsSize = Math.max(12, initialDateLabelSize * 0.6);
    this.startTimeLabel.style.fontSize = `${timeLabelsSize}px`;
    this.endTimeLabel.style.fontSize = `${timeLabelsSize}px`;

    // 設置控制項的初始字體大小
    const controlsFontSize = Math.max(12, Math.min(16, this.width / 50));
    this.keepZeroLabel.style.fontSize = `${controlsFontSize}px`;
    this.playPauseButton.style.fontSize = `${controlsFontSize}px`;
    this.resetButton.style.fontSize = `${controlsFontSize}px`;
  }

  setupEventListeners() {
    let wasPlaying = false;

    // 開始拖動
    this.progressBar.addEventListener("mousedown", () => {
      this.isDragging = true;
      wasPlaying = this.isPlaying;
      this.pause();
    });

    // 拖動中
    this.progressBar.addEventListener("input", () => {
      if (this.isDragging) {
        const newFrame = Math.floor((this.progressBar.value / 100) * 
          (this.config.data.labels.length - 1));
        
        this.currentFrame = Math.min(newFrame, this.config.data.labels.length - 1);
        
        // 更新日期文本
        const currentDate = this.config.data.labels[this.currentFrame];
        if (currentDate) {
          this.dateLabel.textContent = currentDate;
        }
        
        this.updateChart(this.getCurrentData(), true);
      }
    });

    // 拖動結束
    const endDragging = () => {
      if (this.isDragging) {
        this.isDragging = false;
        
        // 只有在不是最後一幀時才恢復播放
        if (wasPlaying && this.currentFrame < this.config.data.labels.length - 1) {
          this.play();
        } else if (this.currentFrame >= this.config.data.labels.length - 1) {
          // 如果是最後一幀，確保停在最後
          this.currentFrame = this.config.data.labels.length - 1;
          this.progressBar.value = 100;
          this.updateChart(this.getCurrentData(), false);
          this.stopAnimation();
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
      const isLastFrame = this.currentFrame >= this.config.data.labels.length - 1;
      this.settings.keepZeroItems = this.keepZeroCheckbox.checked;
      
      // 獲當前數據
      const currentData = this.getCurrentData();
      
      // 如果在最後一幀，特殊處理
      if (isLastFrame) {
        // 保當前的數值狀態
        const oldData = new Map();
        this.svg.selectAll(".bar-label").each(function(d) {
          // 從文本中提取當前顯示的數值
          const match = this.textContent.match(/: ([\d,]+)$/);
          if (match) {
            oldData.set(d.label, parseInt(match[1].replace(/,/g, "")));
          }
        });
        
        // 更新圖表，但保持原有數值
        currentData.forEach(d => {
          if (oldData.has(d.label)) {
            d._currentValue = oldData.get(d.label);
            d._keepValue = true;  // 標記需要保持值
          }
        });
      }
      
      // 更新圖表
      this.updateChart(currentData, true);
    });
  }

  getCurrentData() {
    // 檢查是否已到結束位置
    if (this.currentFrame >= this.config.data.labels.length) {
      this.currentFrame = this.config.data.labels.length - 1;
    }

    const currentData = this.config.data.datasets.map(dataset => {
      const value = dataset.data[this.currentFrame];
      // 只在值大於 0 時添加到出現過的品牌集合中
      if (value > 0) {
        this.appearedBrands.add(dataset.label);
      }
      return {
        label: dataset.label,
        value: value || 0,
        color: dataset.backgroundColor,
        date: this.config.data.labels[this.currentFrame]
      };
    });

    // 根據設過濾數據
    const filteredData = currentData
      .sort((a, b) => b.value - a.value)
      .filter(d => {
        // 如果值大於 0，保留
        if (d.value > 0) return true;
        // 如果未啟用保留零值，移除所有零值項目
        if (!this.settings.keepZeroItems) return false;
        // 如果啟用保留零值，只保留曾經出現過的品牌
        return this.appearedBrands.has(d.label);
      })
      .slice(0, this.maxBars);

    return filteredData;
  }

  updateChart(data, animate = true) {
    // 如果正在拖動強制不使用動畫
    if (this.isDragging) {
      animate = false;
    }

    // 計算可用空間
    const maxBars = Math.min(data.length, this.maxBars);
    const availableHeight = this.height - this.margin.top - 30;  // 底部邊距 30px
    
    // 計算每個 bar 的理想高度（包含間距）
    const totalBarSpace = availableHeight / maxBars;
    
    // bar 高度為總空間的 85%，間距為 15%（調整比例）
    const barHeight = totalBarSpace * 0.85;  // 從 0.98 改為 0.85
    const barPadding = totalBarSpace * 0.15;  // 從 0.02 改為 0.15

    // 計算實際總高度
    const totalHeight = availableHeight;  // 使用全部可用高度

    // 更新比例尺
    this.x.domain([0, d3.max(data, d => d.value)])
      .range([0, this.width]);
    this.y
      .domain(data.map(d => d.label))
      .range([0, totalHeight])
      .paddingInner(barPadding / totalBarSpace)  // 設置 bar 之間的間距
      .paddingOuter(0.01);  // 設置極小的上下邊距

    // 計算適合的字體大小
    const minFontSize = 10;
    const maxFontSize = 24;
    const idealFontSize = Math.max(minFontSize, Math.min(maxFontSize, barHeight * 0.7));
    
    // 計算日期標籤的字體大小
    const dateLabelSize = Math.max(14, Math.min(24, this.width / 30));
    
    // 更新日期標籤的字體大小
    this.dateLabel.style.fontSize = `${dateLabelSize}px`;

    if (animate) {
      const duration = this.isDragging ? 50 : this.config.options.animation.duration;
      const positionDuration = 200;  // 位置變化時間

      // 更新長條和標籤的位置和寬度
      const bars = this.svg.selectAll("rect")
        .data(data, d => d.label);

      const labels = this.svg.selectAll(".bar-label")
        .data(data, d => d.label);

      // 處理退出的元素（歸零項目）
      bars.exit()
        .transition()
        .duration(500)  // 使用 500ms 的消失動畫
        .ease(d3.easeLinear)
        .attr("y", this.height)  // 移動到底部
        .attr("height", 0)  // 高度漸變為 0
        .style("opacity", 0)  // 同時淡出
        .remove();

      labels.exit()
        .transition()
        .duration(500)  // 使用 500ms 的消失動畫
        .ease(d3.easeLinear)
        .attr("y", this.height)  // 移動到底部
        .style("opacity", 0)  // 淡出效果
        .remove();

      // 處理新增的長條
      const barsEnter = bars.enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", 0)
        .attr("width", 0)
        .attr("y", d => this.y(d.label))
        .attr("height", barHeight)
        .attr("fill", d => d.color || "#1f77b4");

      // 處理新增的標籤
      const labelsEnter = labels.enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("x", 5)
        .attr("y", d => this.y(d.label) + barHeight / 2)
        .attr("dy", ".35em")
        .style("font-size", `${idealFontSize}px`)  // 設置字體大小
        .text(d => `${d.label}: 0`);

      // 更新現有元素
      const allBars = bars.merge(barsEnter);
      const allLabels = labels.merge(labelsEnter);

      // 更新位置和寬度（分開更新）
      allBars
        .transition()
        .duration(positionDuration)  // 使用 200ms 的位置變化
        .ease(d3.easeLinear)
        .attr("y", d => this.y(d.label))
        .attr("height", barHeight)
        .transition()
        .duration(duration)
        .ease(d3.easeLinear)
        .attr("width", d => this.x(d.value));

      // 更新標籤（分開更新）
      allLabels
        .style("font-size", `${idealFontSize}px`)
        .transition()
        .duration(positionDuration)
        .ease(d3.easeLinear)
        .attr("y", d => this.y(d.label) + barHeight / 2)
        .transition()
        .duration(duration)
        .ease(d3.easeLinear)
        .attr("x", d => this.x(d.value) + 10)
        .each(function(d) {
          const node = this;
          const startValue = d._keepValue ? d._currentValue : (node._currentValue || 0);
          const endValue = d.value;
          const format = d3.format(",");
          
          // 保存當前值用於下一次動畫
          node._currentValue = endValue;
          
          // 創建一個更平滑的數字更新
          const numberTransition = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear);
          
          // 使用 d3.timer 進行更頻繁的更新
          let timer = d3.timer((elapsed) => {
            const progress = Math.min(1, elapsed / duration);
            const currentValue = startValue + (endValue - startValue) * progress;
            node.textContent = `${d.label}: ${format(Math.round(currentValue))}`;
            
            if (progress === 1) {
              timer.stop();
            }
          });
        });
    } else {
      // 立即更新，不使用動畫
      const bars = this.svg.selectAll("rect")
        .data(data, d => d.label);

      const labels = this.svg.selectAll(".bar-label")
        .data(data, d => d.label);

      bars.attr("width", d => this.x(d.value))
        .attr("y", d => this.y(d.label))
        .attr("height", barHeight);

      labels.exit()
        .remove();

      const labelsEnter = labels.enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("x", d => this.x(d.value) + 5)
        .attr("y", d => this.y(d.label) + barHeight / 2)
        .attr("dy", ".35em")
        .text(d => `${d.label}: ${d3.format(",")(d.value)}`);

      const labelsUpdate = labels.merge(labelsEnter);

      labelsUpdate
        .attr("x", d => this.x(d.value) + 5)
        .attr("y", d => this.y(d.label) + barHeight / 2)
        .text(d => `${d.label}: ${d3.format(",")(d.value)}`);
    }

    // 新日期文本
    const currentDate = this.config.data.labels[this.currentFrame];
    if (currentDate) {
      this.dateLabel.textContent = currentDate;
    }

    // 更新容器大小
    const controlsHeight = document.querySelector(".controls").offsetHeight;
    const containerWidth = this.width + this.margin.left + this.margin.right;
    const containerHeight = this.height + controlsHeight;  // 使用完整的高度

    // 更新容器樣式
    const container = document.getElementById(this.containerId);
    if (this.config.options.container.showFrame) {
      container.style.width = `${containerWidth}px`;
      container.style.height = `${containerHeight}px`;
      container.style.backgroundColor = this.config.options.container.background;
      container.style.padding = `${this.config.options.container.padding}px`;
      container.style.borderRadius = `${this.config.options.container.borderRadius}px`;
      container.style.boxShadow = this.config.options.container.shadow;
      container.style.overflow = "hidden";  // 防止內容溢出
    }

    // 更新時間標籤的字體大小
    this.startTimeLabel.style.fontSize = `${Math.max(12, dateLabelSize * 0.6)}px`;
    this.endTimeLabel.style.fontSize = `${Math.max(12, dateLabelSize * 0.6)}px`;

    // 更新控制項字體大小
    const controlsFontSize = Math.max(12, Math.min(16, this.width / 50));
    this.keepZeroLabel.style.fontSize = `${controlsFontSize}px`;
    this.playPauseButton.style.fontSize = `${controlsFontSize}px`;
    this.resetButton.style.fontSize = `${controlsFontSize}px`;
  }

  play() {
    if (this.isDragging) return;
    
    if (this.currentFrame >= this.config.data.labels.length - 1) {
      this.currentFrame = 0;
      this.progressBar.value = 0;
    }
    
    this.isPlaying = true;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-pause\"></i>";
    
    // 使用 window.requestAnimationFrame
    window.requestAnimationFrame(() => this.animate());
  }

  pause() {
    this.isPlaying = false;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
    
    // 確保停所有動畫
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
  }

  reset() {
    this.stopAnimation();  // 確保停止所有
    this.currentFrame = 0;
    this.progressBar.value = 0;
    this.updateChart(this.getCurrentData(), true);
    this.play();
  }

  animate() {
    if (!this.isPlaying || this.isDragging) return;

    const currentData = this.getCurrentData();
    
    if (this.currentFrame >= this.config.data.labels.length - 1) {
      this.currentFrame = this.config.data.labels.length - 1;
      this.progressBar.value = 100;
      this.updateChart(currentData, false);
      this.stopAnimation();
      return;
    }

    // 更新圖表和進度條
    this.updateChart(currentData, true);
    this.progressBar.value = (this.currentFrame / (this.config.data.labels.length - 1)) * 100;

    // 增加幀計數
    this.currentFrame++;
    
    // 使用簡單的 setTimeout 進行���一幀調度
    if (this.currentFrame < this.config.data.labels.length) {
      this.animationTimer = setTimeout(() => {
        window.requestAnimationFrame(() => this.animate());
      }, this.config.options.animation.duration);
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

// 確保在覽器環境中可
if (typeof window !== "undefined") {
  window.BarChartRace = BarChartRace;
}

// 如果在 Node.js 環境中
if (typeof module !== "undefined" && module.exports) {
  // 使用 require 引入 d3 並賦值給全局變量
  global.d3 = require("d3");
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  
  global.document = dom.window.document;
  global.window = dom.window;
  
  module.exports = BarChartRace;
} 