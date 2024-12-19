# Bar Chart Race

A JavaScript library for creating animated bar chart races using D3.js.

## Installation

You can include the library directly from jsDelivr: 

html
<script src="https://cdn.jsdelivr.net/gh/leofok/bar-chart-race@1.0.0/lib/barChartRace.js"></script>

## Usage

javascript:bar-chart-race/README.md
const chart = new BarChartRace("chart", {
data: data,
options: {
width: 1000, // 圖表寬度
height: 400, // 圖表高度
plugins: {
title: {
text: "Chart Title" // 圖表標題
}
},
animation: {
duration: 2000 // 動畫時間（毫秒）
}
}
});
chart.play();

## Configuration Options

### Basic Options
- `width`: 圖表寬度（像素）
- `height`: 圖表高度（像素）

### Animation Options
- `animation.duration`: 每幀動畫時間（毫秒），默認 2000
- `animation.easing`: 動畫緩動函數，默認 "linear"

### Layout Options
- `layout.padding.top`: 頂部邊距，默認 30px
- `layout.padding.right`: 右側邊距，默認 250px
- `layout.padding.bottom`: 底部邊距，默認 30px
- `layout.padding.left`: 左側邊距，默認 30px

### Container Options
- `container.showFrame`: 是否顯示外框，默認 true
- `container.padding`: 容器內邊距，默認 20px
- `container.background`: 背景顏色，默認 "white"
- `container.borderRadius`: 邊框圓角，默認 8px
- `container.shadow`: 陰影效果，默認 "0 2px 4px rgba(0,0,0,0.1)"

### Data Format

javascript
const data = {
labels: ["2020-01", "2020-02", ...], // 時間軸標籤
datasets: [
{
label: "Brand A", // 品牌名稱
data: [100, 200, ...], // 對應的數值
backgroundColor: "#1428A0" // 顏色（可選）
},
// ... 更多數據集
]
};

### Methods
- `play()`: 開始播放動畫
- `pause()`: 暫停動畫
- `reset()`: 重置到初始狀態
- `stopAnimation()`: 停止所有動畫

### Settings
- `keepZeroItems`: 是否保留數值為零的項目（可通過 UI 切換）

## License

MIT