const fs = require("fs");
const path = require("path");

// 生成 HTML 文件
function generateHTML(data) {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>手機品牌銷量排行</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://cdn.jsdelivr.net/gh/leofok/bar-chart-race@main/lib/barChartRace.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        .chart-container {
            width: 1200px;
            height: 500px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <div id="chart" class="chart-container"></div>
    <script>
        // 確保腳本已加載
        function checkDependencies() {
            if (typeof BarChartRace === 'undefined' || typeof d3 === 'undefined') {
                setTimeout(checkDependencies, 100);
                return;
            }

            const data = ${JSON.stringify(data, null, 2)};
            
            const chart = new BarChartRace("chart", {
                data: data,
                options: {
                    plugins: {
                        title: {
                            text: "手機品牌銷量排行"
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                text: data.xAxisLabel
                            }
                        },
                        y: {
                            title: {
                                text: data.yAxisLabel
                            }
                        }
                    },
                    animation: {
                        duration: 500,
                        interpolateFrames: 10,
                        exitDuration: 0.5
                    }
                }
            });

            chart.play();
        }

        window.addEventListener("DOMContentLoaded", checkDependencies);
    </script>
</body>
</html>`;

  const outputDir = path.join(__dirname, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outputDir, "chart.html"), html);
  console.log("已生成 chart.html");
}

// 讀取並處理 CSV 數據
function processCSV() {
  const csvData = fs.readFileSync("data/data.csv", "utf-8");
  const lines = csvData.split("\n");
  const headers = lines[0].split(",");

  const data = {
    xAxisLabel: headers[0],  // 時間軸標籤
    yAxisLabel: headers[2],  // 值的標籤
    labels: [],              // 時間點
    datasets: []             // 品牌數據
  };

  // 獲取所有唯一的品牌
  const brands = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length >= 3) {
      brands.add(cols[1]);
    }
  }

  // 為每個品牌建數據集
  brands.forEach(brand => {
    data.datasets.push({
      label: brand,
      data: [],
      backgroundColor: getColorForBrand(brand)
    });
  });

  // 填充數據
  let currentDate = null;
  let dateData = {};
    
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length >= 3) {
      const date = cols[0];
      const brand = cols[1];
      const value = parseFloat(cols[2]);

      if (date !== currentDate) {
        if (currentDate !== null) {
          data.labels.push(currentDate);
          data.datasets.forEach(dataset => {
            dataset.data.push(dateData[dataset.label] || 0);
          });
        }
        currentDate = date;
        dateData = {};
      }
      dateData[brand] = value;
    }
  }

  return data;
}

// 為品牌獲取顏色
function getColorForBrand(brand) {
  const colors = {
    "Samsung": "#1428A0",
    "iPhone": "#555555",
    "Huawei": "#C7000B",
    "Xiaomi": "#FF6900",
    "Nokia": "#183693",
    "Motorola": "#5C2D91",
    "BlackBerry": "#000000",
    "LG": "#A50034",
    "HTC": "#84BD00",
    "ZTE": "#0038A8"
  };
  return colors[brand] || "#" + Math.floor(Math.random()*16777215).toString(16);
}

// 主程序
function main() {
  const data = processCSV();
  generateHTML(data);
}

main(); 