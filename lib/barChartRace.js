/* global document, window, d3, requestAnimationFrame, cancelAnimationFrame */

// 如果在 Node.js 環境中，添加 requestAnimationFrame polyfill
if (typeof requestAnimationFrame === "undefined") {
  global.requestAnimationFrame = callback => setTimeout(callback, 1000 / 60);
}

// 在文件頂部添加 ResizeObserver polyfill
const ResizeObserver = typeof window !== "undefined" ? 
  window.ResizeObserver : 
  class ResizeObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
  };

class BarChartRace {
  constructor(containerId, config = {}) {
    this.containerId = containerId;
    this.margin = {
      top: 30,
      right: 250,
      bottom: 30,
      left: 150
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

    // 添加曾經出現的品牌集合
    this.appearedBrands = new Set();

    // 保存 keepZeroLabel 的引用
    this.keepZeroLabel = null;

    // 添加字體大小相關的實例變量
    this.fontSizes = {
      date: null,
      controls: null,
      labels: null
    };

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
    // 獲取容器元素
    const container = document.getElementById(this.containerId);
    if (!container) {
      throw new Error("Container not found: " + this.containerId);
    }

    // 使用配置中的寬度和高度
    const CHART_WIDTH = this.config.options.width || 1200;
    const CHART_HEIGHT = this.config.options.height || 600;

    // 設置容器大小和樣式
    container.style.width = CHART_WIDTH + "px";
    container.style.height = CHART_HEIGHT + "px";
    container.style.position = "relative";
    container.style.overflow = "hidden";

    // 創建 SVG 元素
    const svg = d3.select("#" + this.containerId)
      .append("svg")
      .attr("width", CHART_WIDTH)
      .attr("height", CHART_HEIGHT - 30)
      .style("margin-top", "30px");

    // 創建主繪圖區域，不設置初始轉換
    this.svg = svg.append("g")
      .attr("class", "main-chart");

    // 初始化控制項（修正字符）
    this.initializeControls();

    // 設置事件監聽器（只調用一次）
    this.setupEventListeners();

    // 設置左右邊距
    const calculateMargins = (data) => {
      // 計算最長名稱所需的寬度
      const maxLabelWidth = d3.max(data, d => d.label.length) * (this.fontSizes.labels * 0.7);
      // 計算最大數值所需的寬度
      const maxValue = d3.max(data, d => d.value);
      const maxValueWidth = d3.format(",")(Math.round(maxValue)).length * (this.fontSizes.labels * 0.7);
      
      // 設置邊距（加上額外的間距）
      this.margin = {
        top: 15,
        right: Math.max(100, maxValueWidth + 40), // 確保至少 100px
        bottom: 30,
        left: Math.max(150, maxLabelWidth + 40)   // 確保至少 150px
      };
    };

    // 在初始化時就掃描所有數據，收集曾經出現過的品牌
    this.appearedBrands = new Set();  // 確保是新的 Set
    this.scanAllBrands();  // 使用新的方法掃描品牌

    // 獲取初始數據
    const validData = this.getCurrentData();
    calculateMargins(validData);

    // 重新計算可用空間
    this.width = CHART_WIDTH - this.margin.left - this.margin.right;
    this.availableHeight = CHART_HEIGHT - 30 - this.margin.top - this.margin.bottom - 80;

    // 過濾數據時考慮 keepZeroItems 設置
    let filteredData = validData;
    if (!this.settings.keepZeroItems) {
      filteredData = validData.filter(d => d.value > 0);
    }

    // 計算 bar 的高度和間距
    const minBarSpacing = 12;
    const totalSpacing = (filteredData.length + 1) * minBarSpacing;
    const availableHeight = this.availableHeight - totalSpacing;
    
    // 計算單個 bar 的高度
    this.barHeight = Math.floor(availableHeight / filteredData.length);
    this.barHeight = Math.min(this.barHeight, 30);
    this.barHeight = Math.max(20, this.barHeight);

    // 計算實際總高度（含頂部和底部間距）
    const totalBarHeight = this.barHeight * filteredData.length;
    const actualTotalHeight = totalBarHeight + totalSpacing;
    this.actualHeight = Math.min(actualTotalHeight, this.availableHeight);

    // 初始化 x 軸比例尺
    const maxValue = d3.max(filteredData, d => d.value || 0);
    const domainMax = Math.max(1, maxValue * 1.1);
    
    this.x = d3.scaleLinear()
      .domain([0, domainMax])
      .range([0, this.width]);

    // 設置 y 軸比例尺
    this.y = d3.scaleBand()
      .domain(filteredData.map(d => d.label))
      .range([0, this.actualHeight - minBarSpacing])
      .padding(0.3);

    // 驗證 bar 位置
    const positions = filteredData.map(d => this.y(d.label));
    const uniquePositions = new Set(positions);
    if (positions.length !== uniquePositions.size) {
      console.warn("Duplicate bar positions detected");
    }

    // 確保所有元素使用絕對位置
    this.xAxis = this.svg.append("g")
      .attr("class", "x-axis")
      .style("position", "absolute")
      .style("top", "0px");

    // 立即設置初始樣式
    this.setupXAxisStyle();

    // 移除 x 軸的主軸線和最右邊的垂直線
    this.xAxis.select(".domain").remove();
    this.xAxis.selectAll("line")
      .filter(function(d, i, nodes) {
        return i < nodes.length - 1;
      });

    // 然後再創建和更新 bars
    const bars = this.svg.selectAll("rect.bar")
      .data(filteredData, d => d.label);

    // 計算字體大小
    const idealFontSize = Math.max(10, Math.min(24, this.barHeight * 0.7));
    this.fontSizes.labels = idealFontSize;

    // 處理新增的 bars，確保初始位置正確
    const barsEnter = bars.enter()
      .append("rect")
      .attr("class", "bar")
      .style("position", "absolute")
      .attr("x", 0)
      .attr("y", d => this.y(d.label))
      .attr("height", this.y.bandwidth())
      .attr("width", d => Math.max(0, this.x(d.value || 0)))
      .attr("fill", d => d.color || "#1f77b4");

    // 更新現有的 bars，不使用過渡效果
    bars.merge(barsEnter)
      .attr("y", d => this.y(d.label))
      .attr("height", this.y.bandwidth())
      .attr("width", d => Math.max(0, this.x(d.value)));

    // 移除不需要的 bars
    bars.exit().remove();

    // 創建標籤
    const labels = this.svg.selectAll(".bar-label")
      .data(filteredData, d => d.label);

    // 處理新增標籤
    const labelsEnter = labels.enter()
      .append("g")
      .attr("class", "bar-label");

    // 計算最長標籤的寬度並保存為實例變量
    const calculateMaxLabelWidth = (data) => {
      const tempText = this.svg.append("text")
        .style("font-size", `${this.fontSizes.labels}px`)
        .style("visibility", "hidden");

      const maxWidth = d3.max(data, d => {
        tempText.text(d.label);
        return tempText.node().getComputedTextLength();
      });

      tempText.remove();
      return maxWidth;
    };

    // 保存為實例變量
    this.maxLabelWidth = calculateMaxLabelWidth(filteredData);
    
    // 更新左邊距留最小必要空間
    this.margin.left = this.maxLabelWidth + 20;  // 減少邊距

    // 更新 SVG 的寬度和位置
    const svgWidth = this.width + this.margin.left + this.margin.right;
    svg.attr("width", svgWidth)
      .attr("viewBox", `0 0 ${svgWidth} ${CHART_HEIGHT - 30}`);

    // 更新主繪圖區域的位置
    this.svg.attr("transform", `translate(${this.margin.left},${this.margin.top})`);

    // 添加標籤，位置從最左邊開始
    labelsEnter.append("text")
      .attr("class", "item-name")
      .attr("x", -5)  // 改為固定的小間距
      .attr("y", d => this.y(d.label) + this.y.bandwidth() / 2)
      .attr("dy", ".35em")
      .attr("text-anchor", "end")  // 改為靠右對齊
      .style("font-size", `${this.fontSizes.labels}px`)
      .text(d => d.label);

    // 添加右側數值
    labelsEnter.append("text")
      .attr("class", "value-label")
      .attr("x", d => this.x(d.value || 0) + 10)
      .attr("y", d => this.y(d.label) + this.y.bandwidth() / 2)
      .attr("dy", ".35em")
      .style("font-size", `${this.fontSizes.labels}px`)
      .text(d => d3.format(",")(Math.round(d.value || 0)));

    // 設置初始時間標籤
    if (this.config.data.labels && this.config.data.labels.length > 0) {
      this.startTimeLabel.textContent = this.config.data.labels[0];
      this.endTimeLabel.textContent = this.config.data.labels[this.config.data.labels.length - 1];
    }

    //  Font Awesome 樣式表果還沒添加）
    if (!document.querySelector("link[href*=\"font-awesome\"]")) {
      const fontAwesome = document.createElement("link");
      fontAwesome.rel = "stylesheet";
      fontAwesome.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css";
      document.head.appendChild(fontAwesome);
    }

    // 設置基礎字體大小
    const calculateFontSizes = () => {
      // 基於尺寸計算基礎字體大小
      const baseFontSize = Math.min(
        this.width / 50,  // 寬度基準
        this.availableHeight / 25  // 高度基準
      );

      // 設置不同元素的字體大小
      this.fontSizes = {
        date: Math.max(16, Math.min(32, baseFontSize * 1.5)),    // 日期標籤最大
        labels: Math.max(14, Math.min(28, baseFontSize * 1.2)),  // bar 標籤次之
        axis: Math.max(12, Math.min(20, baseFontSize * 0.9)),    // 軸標籤再次之
        controls: Math.max(12, Math.min(18, baseFontSize * 0.8))  // 控制項
      };
    };

    // 初始計字體大小
    calculateFontSizes();

    // 更新所有文字元素的字體大小
    const updateFontSizes = () => {
      // 更新日期標籤
      this.dateLabel.style.fontSize = `${this.fontSizes.date}px`;
      
      // 更新時間標籤
      this.startTimeLabel.style.fontSize = `${this.fontSizes.controls}px`;
      this.endTimeLabel.style.fontSize = `${this.fontSizes.controls}px`;
      
      // 更新控制項
      this.keepZeroLabel.style.fontSize = `${this.fontSizes.controls}px`;
      this.playPauseButton.style.fontSize = `${this.fontSizes.controls}px`;
      this.resetButton.style.fontSize = `${this.fontSizes.controls}px`;
      
      // 新 bar 標籤
      this.svg.selectAll(".x-axis text")
        .style("font-size", `${this.fontSizes.axis}px`);
      
      // 更新 bar 標籤
      this.svg.selectAll(".bar-label text")
        .style("font-size", `${this.fontSizes.labels}px`);
    };

    // 初始更新字體大小
    updateFontSizes();

    // 添加 resize 監聽器
    this.resizeObserver = new ResizeObserver(() => {
      calculateFontSizes();
      updateFontSizes();
    });

    // 監聽容器大小變化
    this.resizeObserver.observe(document.getElementById(this.containerId));

    // 新容器樣式（如果需要）
    if (this.config.options.container.showFrame) {
      container.style.backgroundColor = this.config.options.container.background;
      container.style.padding = `${this.config.options.container.padding}px`;
      container.style.borderRadius = `${this.config.options.container.borderRadius}px`;
      container.style.boxShadow = this.config.options.container.shadow;
    }
  }

  initializeControls() {
    const container = document.getElementById(this.containerId);
    
    // 創建控制項容器
    const controls = document.createElement("div");
    controls.className = "controls";
    Object.assign(controls.style, {
      position: "relative",
      top: "0",
      width: "100%",
      padding: "0",
      height: "30px",
      display: "flex",
      flexDirection: "column",
      gap: "0"
    });
    container.insertBefore(controls, container.firstChild);

    // 創建時間軸容器
    const timelineContainer = document.createElement("div");
    Object.assign(timelineContainer.style, {
      display: "flex",
      alignItems: "center",
      width: "100%",
      gap: "4px",
      height: "25px"
    });
    controls.appendChild(timelineContainer);

    // 修改時間軸設置
    this.timelineSlider = document.createElement("input");
    this.timelineSlider.type = "range";
    this.timelineSlider.min = "0";
    // 確保最大值正確
    this.timelineSlider.max = String(this.config.data.labels.length - 1);
    this.timelineSlider.value = "0";
    this.timelineSlider.style.flex = "1";

    // 創建時間標籤
    this.startTimeLabel = document.createElement("div");
    this.endTimeLabel = document.createElement("div");
    Object.assign(this.startTimeLabel.style, {
      minWidth: "50px",
      fontSize: this.fontSizes.controls + "px"
    });
    Object.assign(this.endTimeLabel.style, {
      minWidth: "50px",
      fontSize: this.fontSizes.controls + "px"
    });

    // 創建播放按鈕
    this.playPauseButton = document.createElement("button");
    this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
    this.playPauseButton.style.marginLeft = "10px";

    // 創建重置按鈕
    this.resetButton = document.createElement("button");
    this.resetButton.innerHTML = "<i class=\"fas fa-redo\"></i>";
    this.resetButton.style.marginLeft = "10px";

    // 按照順序添加元素
    timelineContainer.appendChild(this.startTimeLabel);  // 1. 起始時間標籤
    timelineContainer.appendChild(this.timelineSlider);  // 2. 時間軸
    timelineContainer.appendChild(this.endTimeLabel);    // 3. 終結時間標籤
    timelineContainer.appendChild(this.playPauseButton); // 4. 播放按鈕
    timelineContainer.appendChild(this.resetButton);     // 5. 重置按鈕

    // 創建底部容器
    const bottomContainer = document.createElement("div");
    Object.assign(bottomContainer.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      height: "18px",
      lineHeight: "18px"
    });
    controls.appendChild(bottomContainer);

    // 創建日期標籤容器
    const dateLabelContainer = document.createElement("div");
    dateLabelContainer.className = "date-label-container";
    Object.assign(dateLabelContainer.style, {
      flex: "1",
      textAlign: "center"
    });
    bottomContainer.appendChild(dateLabelContainer);

    // 創建保留零值選項
    this.keepZeroLabel = document.createElement("label");
    this.keepZeroLabel.style.cursor = "pointer";
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.settings.keepZeroItems;
    this.keepZeroLabel.appendChild(checkbox);
    
    const text = document.createTextNode(" 保留零值項目");
    this.keepZeroLabel.appendChild(text);
    
    bottomContainer.appendChild(this.keepZeroLabel);

    // 創建日期標籤
    this.dateLabel = document.createElement("div");
    Object.assign(this.dateLabel.style, {
      position: "absolute",
      left: "50%",
      transform: "translateX(-50%)",
      top: "25px",
      fontWeight: "bold",
      fontSize: this.fontSizes.date + "px",
      color: "#333"
    });
    dateLabelContainer.appendChild(this.dateLabel);
  }

  setupEventListeners() {
    let wasPlaying = false;

    // 開始拖動
    this.timelineSlider.addEventListener("input", (e) => {
      // 完全停止當前動畫
      if (this.isPlaying) {
        wasPlaying = true;
        this.stopAnimation();  // 使用 stopAnimation 而不是 pause
      }
      
      this.isDragging = true;
      const value = parseInt(e.target.value);
      this.currentFrame = value;
      
      // 直接更新到新位置，不使用動畫
      this.updateChart(this.getCurrentData(), false);
      
      // 更新日期標籤
      if (this.config.data.labels) {
        this.dateLabel.textContent = this.config.data.labels[this.currentFrame];
      }
    });

    // 拖動結束
    this.timelineSlider.addEventListener("change", () => {
      this.isDragging = false;
      if (wasPlaying) {
        wasPlaying = false;
        // 重新開始播放，使用新的起始時間
        this.startNewAnimation(this.currentFrame);
      }
    });

    // 播放/暫停按鈕事件
    this.playPauseButton.addEventListener("click", () => {
      if (this.isPlaying) {
        this.pause();
      } else {
        // 從當前位置開始播放
        const startProgress = this.currentFrame / (this.config.data.labels.length - 1);
        this.play(startProgress);
      }
    });

    // 重置按鈕事件（修正字符）
    this.resetButton.addEventListener("click", () => {
      this.reset();
    });

    // 保留零值項事件
    const checkbox = this.keepZeroLabel.querySelector("input");
    if (checkbox) {
      checkbox.addEventListener("change", () => {
        this.toggleKeepZeroItems();
      });
    }
  }

  getCurrentData() {
    if (!this.config.data || !this.config.data.datasets) {
      console.warn("No data available");
      return [];
    }

    // 獲取當前的數據
    const data = this.config.data.datasets.map(dataset => ({
      label: dataset.label,
      value: this.currentFrame < dataset.data.length ? dataset.data[this.currentFrame] : 0,
      color: dataset.backgroundColor
    }));

    // 根據設置過濾數據
    let filteredData;
    if (this.settings.keepZeroItems) {
      // 如果啟用了保留零值選項，保留所有曾經出現過的品牌
      filteredData = data.filter(d => {
        const shouldKeep = d.value > 0 || this.appearedBrands.has(d.label);
        return shouldKeep;
      });

      // 確保所有曾經出現過的品牌都包含在內
      const includedLabels = new Set(filteredData.map(d => d.label));
      this.appearedBrands.forEach(label => {
        if (!includedLabels.has(label)) {
          // 找到對應的數據集
          const dataset = this.config.data.datasets.find(ds => ds.label === label);
          if (dataset) {
            filteredData.push({
              label: label,
              value: 0,
              color: dataset.backgroundColor
            });
          }
        }
      });
    } else {
      // 如果沒有啟用保留零值選項，只保留當前值大於 0 的品牌
      filteredData = data.filter(d => d.value > 0);
    }

    // 只排序，不限制數量
    return filteredData.sort((a, b) => b.value - a.value);
  }

  updateChart(data, animate = true) {
    const duration = this.isDragging ? 50 : 150;
    const positionDuration = 500;

    // 更新 x 軸比例尺
    const maxValue = d3.max(data, d => d.value || 0);
    const domainMax = Math.max(1, maxValue * 1.1);
    
    this.x.domain([0, domainMax]);
    this.y.domain(data.map(d => d.label));

    // 使用統一的 x 軸更新方法
    this.updateXAxis(animate);

    // 計算實際的 bar 高度
    this.barHeight = this.y.bandwidth();

    // 更新 bars
    const bars = this.svg.selectAll("rect.bar")
      .data(data, d => d.label);

    // 處理新增的 bars
    const barsEnter = bars.enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("y", d => this.y(d.label))
      .attr("height", this.barHeight)  // 使用計算後的高度
      .attr("width", 0)
      .attr("fill", d => d.color || "#1f77b4");

    // 更新所有 bars
    const allBars = bars.merge(barsEnter);
    
    if (animate) {
      allBars
        .transition()
        .duration(duration)
        .ease(d3.easeLinear)
        .attr("y", d => this.y(d.label))
        .attr("height", this.barHeight)  // 確保高度也更新
        .attr("width", d => Math.max(0, this.x(d.value)));
    } else {
      allBars
        .attr("y", d => this.y(d.label))
        .attr("height", this.barHeight)
        .attr("width", d => Math.max(0, this.x(d.value)));
    }

    // 更新標籤位置，使用 bar 的中心點
    const getBarCenterY = d => this.y(d.label) + (this.barHeight / 2);

    // 計算最長標籤的寬度
    const tempText = this.svg.append("text")
      .style("font-size", `${this.fontSizes.labels}px`)
      .style("visibility", "hidden");

    const maxLabelWidth = d3.max(data, d => {
      tempText.text(d.label);
      return tempText.node().getComputedTextLength();
    });

    tempText.remove();

    // 設置標籤的 x 位置（確保靠右對齊）
    const labelXOffset = -5;  // 距離圖表左邊的固定間距

    // 更新標籤
    const labels = this.svg.selectAll(".bar-label")
      .data(data, d => d.label);

    const labelsEnter = labels.enter()
      .append("g")
      .attr("class", "bar-label");

    // 添加左側標籤，使用靠右對齊
    labelsEnter.append("text")
      .attr("class", "item-name")
      .attr("x", labelXOffset)
      .attr("y", getBarCenterY)
      .attr("dy", ".35em")
      .attr("text-anchor", "end")  // 改為靠右對齊
      .text(d => d.label);

    // 添加數值標籤
    labelsEnter.append("text")
      .attr("class", "value-label")
      .attr("x", d => this.x(d.value) + 10)
      .attr("y", d => this.y(d.label) + (this.barHeight / 2))
      .attr("dy", ".35em")
      .text(d => d3.format(",")(Math.round(d.value)));

    // 合併現有和新增的標籤
    const allLabels = labels.merge(labelsEnter);

    // 更新現有標籤
    if (animate) {
      allLabels.select(".item-name")
        .transition()
        .duration(positionDuration)
        .ease(d3.easeLinear)
        .attr("x", labelXOffset)
        .attr("y", getBarCenterY)
        .attr("text-anchor", "end");  // 確保靠右對齊

      // 更新數值標籤，添加數字變化動畫
      allLabels.select(".value-label")
        .transition()
        .duration(positionDuration)
        .ease(d3.easeLinear)
        .attr("x", d => this.x(d.value) + 10)
        .attr("y", getBarCenterY)
        .tween("text", function(d) {
          const node = this;
          const startValue = parseFloat(node.textContent.replace(/,/g, "")) || 0;
          const i = d3.interpolateNumber(startValue, d.value);
          return function(t) {
            node.textContent = d3.format(",")(Math.round(i(t)));
          };
        });
    } else {
      allLabels.select(".item-name")
        .attr("x", labelXOffset)
        .attr("y", getBarCenterY)
        .attr("text-anchor", "end");  // 確保靠右對齊

      allLabels.select(".value-label")
        .attr("x", d => this.x(d.value) + 10)
        .attr("y", d => this.y(d.label) + (this.barHeight / 2))
        .text(d => d3.format(",")(Math.round(d.value)));
    }

    // 移除不需要的元素
    bars.exit().remove();
    labels.exit().remove();
  }

  play(startProgress = null) {
    if (this.isDragging) return;

    // 如果經播放到最後，才重新開始
    if (this.currentFrame >= this.config.data.labels.length - 1) {
      this.currentFrame = 0;
      this.timelineSlider.value = 0;
      startProgress = 0;
    }

    this.isPlaying = true;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-pause\"></i>";

    // 從指定位置或當前位置開始播放
    if (startProgress === null) {
      startProgress = this.currentFrame / (this.config.data.labels.length - 1);
    }
    
    // 確保停止任何現有的動畫
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    this.animateFromProgress(startProgress);
  }

  animateFromProgress(startProgress) {
    const duration = 40000;  // 總動畫時間
    let startTime = performance.now() - (duration * startProgress);
    let lastFrameTime = performance.now();

    const animateFrame = (currentTime) => {
      if (!this.isPlaying) return;

      const elapsed = currentTime - startTime;
      const frameTime = currentTime - lastFrameTime;
      const progress = Math.min(1, elapsed / duration);
      
      if (frameTime >= 100) {
        lastFrameTime = currentTime;
        
        const totalFrames = this.config.data.labels.length - 1;
        const currentFrame = Math.floor(progress * totalFrames);
        const frameProgress = (progress * totalFrames) % 1;

        const interpolatedData = this.interpolateFrameData(
          currentFrame,
          Math.min(currentFrame + 1, totalFrames),
          frameProgress
        );

        this.timelineSlider.value = currentFrame;
        this.currentFrame = currentFrame;
        this.updateChart(interpolatedData, true, 100);
        
        if (this.dateLabel) {
          this.dateLabel.textContent = this.config.data.labels[currentFrame];
        }
      }
      
      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animateFrame);
      } else {
        this.isPlaying = false;
        this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
        this.animationFrame = null;
      }
    };

    this.animationFrame = requestAnimationFrame(animateFrame);
  }

  pause() {
    this.isPlaying = false;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
    
    // 取消動畫幀
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // 立即停止所有進行中的過渡動畫
    this.svg.selectAll("*").interrupt();

    // 使用當前幀的實際數據立即更新圖表
    const currentData = this.getCurrentData();
    this.updateChart(currentData, false);  // 不使用動畫
  }

  reset() {
    this.pause();  // 先暫停當前動畫
    this.currentFrame = 0;
    this.timelineSlider.value = 0;
    this.updateChart(this.getCurrentData(), true);
  
    // 短暫延遲後開始播放
    setTimeout(() => {
      this.play();
    }, 100);
  }

  animate() {
    if (!this.isPlaying || this.isDragging) return;

    const duration = 40000;  // 增加到 40 秒
    let startTime = performance.now();
    let lastFrameTime = startTime;

    // 獲取完整的幀數據（包括所有可能出現的標籤）
    const getFrameData = (frame) => {
      return this.config.data.datasets.map(dataset => ({
        label: dataset.label,
        value: dataset.data[frame] || 0,
        color: dataset.backgroundColor
      }))
        .sort((a, b) => b.value - a.value)
        .slice(0, this.maxBars);
    };

    // 計算插值數據，確保所有元素同步
    const interpolateFrameData = (startFrame, endFrame, progress) => {
      const startData = getFrameData(startFrame);
      const endData = getFrameData(endFrame);

      // 合併所有可能出現的標籤
      const allLabels = new Set([
        ...startData.map(d => d.label),
        ...endData.map(d => d.label)
      ]);

      // 為每個標籤計算插值
      const interpolatedData = Array.from(allLabels)
        .map(label => {
          const startItem = startData.find(d => d.label === label) || 
                           { label, value: 0, color: "#1f77b4" };
          const endItem = endData.find(d => d.label === label) || 
                         { label, value: 0, color: startItem.color };

          return {
            label,
            value: d3.interpolateNumber(startItem.value, endItem.value)(progress),
            color: startItem.color
          };
        });

      // 排序並限制數量
      return interpolatedData
        .sort((a, b) => b.value - a.value)
        .slice(0, this.maxBars);
    };

    const animateFrame = (currentTime) => {
      if (!this.isPlaying) return;

      const elapsed = currentTime - startTime;
      const frameTime = currentTime - lastFrameTime;
      const progress = Math.min(1, elapsed / duration);
      
      if (frameTime >= 100) {  // 降低到約 10fps
        lastFrameTime = currentTime;
        
        // 計算當前幀號和幀內進度
        const totalFrames = this.config.data.labels.length - 1;
        const currentFrame = Math.floor(progress * totalFrames);
        const frameProgress = (progress * totalFrames) % 1;

        // 計算插值數據
        const interpolatedData = interpolateFrameData(
          currentFrame,
          Math.min(currentFrame + 1, totalFrames),
          frameProgress
        );

        // 更新時間軸位置
        this.timelineSlider.value = currentFrame;
        this.currentFrame = currentFrame;

        // 使用插值數據同步更新所有元素
        this.updateChart(interpolatedData, true, 100);  // 增加每一偵的動畫時間
        
        // 更新日期標籤
        if (this.dateLabel) {
          this.dateLabel.textContent = this.config.data.labels[currentFrame];
        }
      }
      
      if (progress < 1) {
        requestAnimationFrame(animateFrame);
      } else {
        this.isPlaying = false;
        this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
      }
    };

    requestAnimationFrame(animateFrame);
  }

  renderFrame(data) {
    // 更新比例尺
    const maxValue = d3.max(data, d => d.value || 0);
    const domainMax = Math.max(1, maxValue * 1.1);
    
    this.x.domain([0, domainMax]);
    this.y.domain(data.map(d => d.label));

    // 更新 x 軸
    this.xAxis.call(
      d3.axisTop(this.x)
        .ticks(5)
        .tickSize(-this.actualHeight)
        .tickFormat(d3.format(","))
    );

    // 更新 bars
    const bars = this.svg.selectAll("rect.bar")
      .data(data, d => d.label);

    // 處理新增的 bars
    const barsEnter = bars.enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("y", d => this.y(d.label))
      .attr("height", this.barHeight)
      .attr("width", 0)
      .attr("fill", d => d.color || "#1f77b4");

    // 更新所有 bars
    bars.merge(barsEnter)
      .attr("y", d => this.y(d.label))
      .attr("width", d => Math.max(0, this.x(d.value)));

    // 移除不需要的 bars
    bars.exit().remove();

    // 更新標籤
    const labels = this.svg.selectAll(".bar-label")
      .data(data, d => d.label);

    // 處理新增標籤
    const labelsEnter = labels.enter()
      .append("g")
      .attr("class", "bar-label");

    labelsEnter.append("text")
      .attr("class", "item-name")
      .attr("x", -10)
      .attr("y", d => this.y(d.label) + (this.barHeight / 2))
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .text(d => d.label);

    labelsEnter.append("text")
      .attr("class", "value-label")
      .attr("x", d => this.x(d.value) + 10)
      .attr("y", d => this.y(d.label) + (this.barHeight / 2))
      .attr("dy", ".35em")
      .text(d => d3.format(",")(Math.round(d.value)));

    // 更新所有標籤
    const allLabels = labels.merge(labelsEnter);

    allLabels.select(".item-name")
      .attr("y", d => this.y(d.label) + (this.barHeight / 2));

    allLabels.select(".value-label")
      .attr("x", d => this.x(d.value) + 10)
      .attr("y", d => this.y(d.label) + (this.barHeight / 2))
      .text(d => d3.format(",")(Math.round(d.value)));

    // 移除不需要的標籤
    labels.exit().remove();
  }

  handleSliderChange(event) {
    const value = parseInt(event.target.value);
    if (value !== this.currentFrame) {
      this.currentFrame = value;
      
      // 更新日期標籤
      if (this.config.data.labels && this.config.data.labels.length > 0) {
        this.dateLabel.textContent = this.config.data.labels[this.currentFrame];
      }

      // 更新圖表
      this.renderFrame(this.getCurrentData());
    }
  }

  // 下一幀的數據
  getNextFrameData() {
    const nextFrame = Math.min(this.currentFrame + 1, this.config.data.labels.length - 1);
    const data = this.config.data.datasets.map(dataset => ({
      label: dataset.label,
      value: dataset.data[nextFrame] || 0,
      color: dataset.backgroundColor
    }))
      .sort((a, b) => b.value - a.value);

    return data;
  }

  stopAnimation() {
    if (this.animationTimer) {
      this.animationTimer.stop();
      this.animationTimer = null;
    }
  
    this.svg.selectAll("*").interrupt();
    this.pause();

    // 確保時間軸顯示正確位置
    if (this.currentFrame >= this.config.data.labels.length) {
      this.currentFrame = this.config.data.labels.length - 1;
      this.timelineSlider.value = this.timelineSlider.max;
    }
  }

  // 計算合適間隔
  calculateNiceNumber(range) {
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
  
    let niceFraction;
    if (fraction <= 1.0) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  
    return niceFraction * Math.pow(10, exponent);
  }

  // 添加輔助方法來計算 y 位置
  getYPosition(d) {
    if (!d || !d.label || !this.y) {
      console.warn("Invalid data or y scale not initialized");
      return 0;
    }

    const y = this.y(d.label);
    if (typeof y !== "number" || isNaN(y)) {
      console.warn(`Invalid y position for label: ${d.label}`);
      return 0;
    }

    return y + (this.y.bandwidth() / 2); // 使用 bandwidth() 來計算中心位置
  }

  // 在類的其他地方添加清理法
  cleanup() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  // 更新保留零值設置處理方法
  toggleKeepZeroItems() {
    // 切換設置
    this.settings.keepZeroItems = !this.settings.keepZeroItems;
    
    // 更新 checkbox 狀態
    const checkbox = this.keepZeroLabel.querySelector("input");
    if (checkbox) {
      checkbox.checked = this.settings.keepZeroItems;
    }

    // 不需要重新掃描品牌，因為我們已經在初始化時掃描了所有數據
    console.log("Current appeared brands:", Array.from(this.appearedBrands));  // 調試用

    // 立即更新圖表
    const currentData = this.getCurrentData();
    console.log("Current data after toggle:", currentData);  // 調試用
    this.updateChart(currentData, true);
  }

  updateDateLabel() {
    if (this.config.data && this.config.data.labels) {
      this.dateLabel.textContent = this.config.data.labels[this.currentFrame];
    }
  }

  handleTimelineInput(event) {
    if (!this.timelineSlider) return;  // 修正變量引用
  
    const value = parseInt(event.target.value);
    this.currentFrame = value;
  
    // 更新時間標籤
    if (this.config.data && this.config.data.labels) {
      this.dateLabel.textContent = this.config.data.labels[this.currentFrame];
    }
  
    // 更新圖表
    this.updateChart(this.getCurrentData(), false);
  }

  // 添加時間軸拖動事件處理
  setupTimelineEvents() {
    this.timelineSlider.addEventListener("input", (e) => {
      this.isDragging = true;
      this.handleTimelineInput(e);
    });

    this.timelineSlider.addEventListener("change", () => {
      this.isDragging = false;
    });
  }

  // 添加時間軸樣式
  addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      input[type="range"] {
        -webkit-appearance: none;
        width: 100%;
        height: 5px;
        border-radius: 5px;
        background: #ddd;
        outline: none;
        transition: background 0.2s;
      }

      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: #4CAF50;
        cursor: pointer;
        transition: background .3s;
      }

      input[type="range"]::-moz-range-thumb {
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: #4CAF50;
        cursor: pointer;
        transition: background .3s;
      }

      input[type="range"]::-webkit-slider-thumb:hover {
        background: #45a049;
      }

      input[type="range"]::-moz-range-thumb:hover {
        background: #45a049;
      }
    `;
    document.head.appendChild(style);
  }

  // 在類中添加 interpolateFrameData 方法
  interpolateFrameData(startFrame, endFrame, progress) {
    // 獲取指定幀的原始數據
    const getFrameData = (frame) => {
      return this.config.data.datasets.map(dataset => ({
        label: dataset.label,
        value: dataset.data[frame] || 0,  // 確保零值
        color: dataset.backgroundColor
      }));
    };

    const startData = getFrameData(startFrame);
    const endData = getFrameData(endFrame);

    // 合併所有可能出現的標籤
    const allLabels = new Set([
      ...startData.map(d => d.label),
      ...endData.map(d => d.label)
    ]);

    // 為每個標籤計算插值
    const interpolatedData = Array.from(allLabels)
      .map(label => {
        const startItem = startData.find(d => d.label === label) || 
                         { label, value: 0, color: "#1f77b4" };
        const endItem = endData.find(d => d.label === label) || 
                       { label, value: 0, color: startItem.color };

        // 如果開始和結束都是零值，確保插值也是零
        const value = startItem.value === 0 && endItem.value === 0 ? 
          0 : 
          d3.interpolateNumber(startItem.value, endItem.value)(progress);

        return {
          label,
          value: value,
          color: startItem.color
        };
      });

    // 過濾數據
    const filteredData = interpolatedData.filter(d => {
      // 如果值大於 0，保留
      if (d.value > 0) return true;
      // 如果啟用保留零值，保留曾經出現過的品牌
      if (this.settings.keepZeroItems && this.appearedBrands.has(d.label)) {
        return true;
      }
      return false;
    });

    // 排序並限制數量
    return filteredData
      .sort((a, b) => b.value - a.value)
      .slice(0, this.maxBars);
  }

  // 新增方法：完全停止動畫
  stopAnimation() {
    this.isPlaying = false;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    // 清除所有過渡效果
    this.svg.selectAll("*").interrupt();
  }

  // 新增方法：從指定幀開始新的動畫
  startNewAnimation(startFrame) {
    const duration = 60000;  // 總動畫時間
    const totalFrames = this.config.data.labels.length - 1;
    
    // 確保起始幀在有效範圍內
    startFrame = Math.max(0, Math.min(startFrame, totalFrames));
    
    // 重置所有狀態
    this.isPlaying = true;
    this.playPauseButton.innerHTML = "<i class=\"fas fa-pause\"></i>";
    
    let startTime = performance.now();
    let lastFrameTime = startTime;
    let hasReachedEnd = false;

    const animateFrame = (currentTime) => {
      if (!this.isPlaying) return;

      const elapsed = currentTime - startTime;
      const frameTime = currentTime - lastFrameTime;
      
      // 計算實際進度
      const totalDuration = duration * ((totalFrames - startFrame) / totalFrames);
      const progress = Math.min(1, elapsed / totalDuration);
      
      // 計算當前幀
      const currentFrame = Math.min(
        totalFrames,
        startFrame + Math.floor((totalFrames - startFrame) * progress)
      );
      
      if (frameTime >= 150) {
        lastFrameTime = currentTime;

        // 處理最後一幀
        if (progress >= 0.999 || currentFrame >= totalFrames) {
          // 確保更新到最後一幀
          this.timelineSlider.value = String(totalFrames);
          this.currentFrame = totalFrames;
          const finalData = this.getCurrentData();
          this.updateChart(finalData, true);
          
          if (this.dateLabel) {
            this.dateLabel.textContent = this.config.data.labels[totalFrames];
          }

          // 結束動畫
          hasReachedEnd = true;
          this.isPlaying = false;
          this.playPauseButton.innerHTML = "<i class=\"fas fa-play\"></i>";
          this.animationFrame = null;
          return;
        }

        // 正常幀的處理
        const frameProgress = progress % (1 / (totalFrames - startFrame));
        const nextFrame = Math.min(currentFrame + 1, totalFrames);
        
        const interpolatedData = this.interpolateFrameData(
          currentFrame,
          nextFrame,
          frameProgress * (totalFrames - startFrame)
        );

        // 更新時間軸和圖表
        this.timelineSlider.value = String(currentFrame);
        this.currentFrame = currentFrame;
        this.updateChart(interpolatedData, true);
        
        if (this.dateLabel) {
          this.dateLabel.textContent = this.config.data.labels[currentFrame];
        }
      }
      
      // 繼續動畫直到確實結束
      if (!hasReachedEnd) {
        this.animationFrame = requestAnimationFrame(animateFrame);
      }
    };

    this.animationFrame = requestAnimationFrame(animateFrame);
  }

  // 新增方法：獲取指定幀的數據
  getCurrentFrameData(frame) {
    return this.config.data.datasets.map(dataset => ({
      label: dataset.label,
      value: dataset.data[frame] || 0,  // 使用 frame 參數
      color: dataset.backgroundColor
    }))
      .sort((a, b) => b.value - a.value);
  }

  // 新增方法：設置 x 軸的基本樣式
  setupXAxisStyle() {
    // 清除所有現有內容
    this.xAxis.selectAll("*").remove();

    // 創建新的軸
    this.xAxis.call(
      d3.axisTop(this.x)
        .ticks(5)
        .tickSize(-this.actualHeight)
        .tickFormat(d3.format(","))
    );

    // 移除所有不需要的元素
    this.xAxis.selectAll(".domain").remove();
    this.xAxis.selectAll("path").remove();

    // 設置網格線樣式
    this.xAxis.selectAll(".tick line")
      .attr("stroke", "#ddd")
      .attr("stroke-dasharray", "2,2")
      .attr("stroke-width", 1);
  }

  // 修改 updateXAxis 方法
  updateXAxis(animate = true) {
    const duration = animate ? (this.isDragging ? 50 : 150) : 0;

    // 先更新比例尺
    const transition = this.xAxis
      .transition()
      .duration(duration)
      .ease(d3.easeLinear);

    // 更新軸
    transition.call(
      d3.axisTop(this.x)
        .ticks(5)
        .tickSize(-this.actualHeight)
        .tickFormat(d3.format(","))
    );

    // 立即移除不需要的元素
    this.xAxis.selectAll(".domain").remove();
    this.xAxis.selectAll("path").remove();

    // 更新網格線樣式
    this.xAxis.selectAll(".tick line")
      .attr("stroke", "#ddd")
      .attr("stroke-dasharray", "2,2")
      .attr("stroke-width", 1);
  }

  // 新增方法：掃描所有品牌
  scanAllBrands() {
    // 清空現有集合
    this.appearedBrands.clear();
    
    // 掃描所有時間點的所有數據
    this.config.data.datasets.forEach(dataset => {
      dataset.data.forEach((value, frame) => {
        if (value > 0) {
          this.appearedBrands.add(dataset.label);
        }
      });
    });
    
    console.log("Scanned brands:", Array.from(this.appearedBrands));  // 調試用
  }
}

// 確保在瀏覽器環境中
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