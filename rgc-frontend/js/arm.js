// 定义关节名称与标签
const JOINTS = [
    { key: 'right_upper', label: '右大臂' },
    { key: 'right_lower', label: '右小臂' },
    { key: 'left_upper',  label: '左大臂' },
    { key: 'left_lower',  label: '左小臂' }
];
// 单个关节欧拉角轴的标签
const AXIS = ['X', 'Y', 'Z'];
// 存储每个关节-轴的曲线对象
const chartObjs = {};
// 采样窗口长度（只显示最新N帧）
const MAX_POINTS = 200;
// 全局帧号
let globalIndex = 0;
// 数据速率计算
let lastTimestamp = 0;
let frameCount = 0;
let dataRate = 0;

// 初始化统计信息
document.getElementById('frame-count').textContent = globalIndex;
document.getElementById('joint-count').textContent = JOINTS.length;
document.getElementById('channel-count').textContent = JOINTS.length * AXIS.length;
document.getElementById('data-rate').textContent = dataRate.toFixed(1);

// 创建图表
JOINTS.forEach(joint => {
    const ctx = document.getElementById(`chart_${joint.key}`).getContext('2d');
    // 创建渐变
    const gradientX = ctx.createLinearGradient(0, 0, 0, 300);
    gradientX.addColorStop(0, 'rgba(255, 99, 132, 0.8)');
    gradientX.addColorStop(1, 'rgba(255, 99, 132, 0.1)');
    const gradientY = ctx.createLinearGradient(0, 0, 0, 300);
    gradientY.addColorStop(0, 'rgba(75, 192, 192, 0.8)');
    gradientY.addColorStop(1, 'rgba(75, 192, 192, 0.1)');
    const gradientZ = ctx.createLinearGradient(0, 0, 0, 300);
    gradientZ.addColorStop(0, 'rgba(153, 102, 255, 0.8)');
    gradientZ.addColorStop(1, 'rgba(153, 102, 255, 0.1)');
    chartObjs[joint.key] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: '滚转',
                    data: [],
                    borderColor: '#FF6384',
                    backgroundColor: gradientX,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: true
                },
                {
                    label: '俯仰',
                    data: [],
                    borderColor: '#36A2EB',
                    backgroundColor: gradientY,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: true
                },
                {
                    label: '偏航',
                    data: [],
                    borderColor: '#9966FF',
                    backgroundColor: gradientZ,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: true
                }
            ]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "帧数",
                        color: '#A0AEC0'
                    },
                    grid: {
                        color: 'rgba(74, 85, 104, 0.2)'
                    },
                    ticks: {
                        color: '#718096'
                    }
                },
                y: {
                    min: -180,
                    max: 180,
                    title: {
                        display: true,
                        text: "度数 (°)",
                        color: '#A0AEC0'
                    },
                    grid: {
                        color: 'rgba(74, 85, 104, 0.2)'
                    },
                    ticks: {
                        stepSize: 45,
                        color: '#718096'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#E2E8F0',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20
                    },
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(26, 32, 44, 0.9)',
                    titleColor: '#CBD5E0',
                    bodyColor: '#E2E8F0',
                    borderColor: 'rgba(74, 85, 104, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    usePointStyle: true
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
    // 添加重置按钮事件
    document.getElementById(`reset-${joint.key.replace('_', '-')}`).addEventListener('click', () => {
        const chart = chartObjs[joint.key];
        chart.options.scales.y.min = -180;
        chart.options.scales.y.max = 180;
        chart.update();
    });
});


// 本地BLE桥接WebSocket连接
const BRIDGE_WS_URL = `ws://${window.location.hostname || '127.0.0.1'}:8765`;
const BRIDGE_MAX_RECONNECT = 20;
let bridgeSocket = null;
let bridgeReconnectCount = 0;
let bridgeReconnectTimer = null;

function updateBridgeStatus(message, isConnected = false) {
  const statusText = document.getElementById('status-text');
  const statusDot = document.getElementById('status-dot');
  if (statusText) statusText.textContent = message;
  if (statusDot) statusDot.style.backgroundColor = isConnected ? '#00ff88' : '#ff4d4f';
}

function connectBridgeWebSocket() {
  clearTimeout(bridgeReconnectTimer);
  if (bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN) return;

  console.log(`开始连接本地BLE桥接服务: ${BRIDGE_WS_URL}`);
  updateBridgeStatus('连接桥接服务中...', false);
  bridgeSocket = new WebSocket(BRIDGE_WS_URL);

  bridgeSocket.onopen = () => {
    bridgeReconnectCount = 0;
    console.log('本地BLE桥接服务连接成功');
    updateBridgeStatus('桥接服务已连接', true);
  };

  bridgeSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('收到桥接数据', msg);
      handleMessage(msg);
    } catch (error) {
      console.error('桥接数据解析失败', error, '原始数据：', event.data);
    }
  };

  bridgeSocket.onerror = () => {
    console.error('本地BLE桥接服务连接错误，请确认启动器正在运行');
    updateBridgeStatus('桥接服务连接错误', false);
  };

  bridgeSocket.onclose = () => {
    if (bridgeReconnectCount >= BRIDGE_MAX_RECONNECT) {
      console.error(`本地BLE桥接服务重连${BRIDGE_MAX_RECONNECT}次失败`);
      updateBridgeStatus('桥接服务连接失败', false);
      return;
    }
    bridgeReconnectCount++;
    console.warn(`本地BLE桥接服务断开，第${bridgeReconnectCount}次重连...`);
    updateBridgeStatus(`桥接服务重连中(${bridgeReconnectCount}/${BRIDGE_MAX_RECONNECT})`, false);
    bridgeReconnectTimer = setTimeout(connectBridgeWebSocket, 2000);
  };
}

// 数据缓冲逻辑（保留原有功能）
function pushData(joint_key, arr) {
  const chart = chartObjs[joint_key];
  if (!chart) return; // 图表未初始化则跳过

  chart.data.labels.push(globalIndex);
  // 只处理前三个数据
  for (let i = 0; i < 3; i++) {
    let dataToPush = arr[i];
    // 判断是否需要取反
    if (
      (joint_key === 'right_lower' && i === 1) || // 右小臂俯仰角
      (joint_key === 'right_upper' && i === 0) || // 右大臂滚转
      (joint_key === 'left_lower' && i === 0) ||  // 左小臂滚转
      (joint_key === 'left_upper' && i === 1)     // 左大臂俯仰
    ) {
      dataToPush = -dataToPush; // 取反操作
    }
    chart.data.datasets[i].data.push(dataToPush);
  }
  // 限制数据长度，超出则移除最旧数据
  if (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(ds => ds.data.shift());
  }
  chart.update('none'); // 静默更新图表
}


// 消息处理逻辑（保留原有功能）
function handleMessage(msg) {
  const isRightData = msg.source === 'RIGHT' && Array.isArray(msg.data);
  const isLeftData = msg.source === 'LEFT' && Array.isArray(msg.data);

  if (isRightData || isLeftData) {
    const armData = msg.data.slice(0, 6); // 只取前6个数据
    const armType = isRightData ? 'right' : 'left';

    // 处理大臂数据
    const upperArmData = armData.slice(0, 3);
    const upperArmKey = `${armType}_upper`;
    pushData(upperArmKey, upperArmData);

    // 处理小臂数据
    const lowerArmData = armData.slice(3, 6);
    const lowerArmKey = `${armType}_lower`;
    pushData(lowerArmKey, lowerArmData);

    // 更新帧计数和数据速率
    globalIndex++;
    document.getElementById('frame-count').textContent = globalIndex;
    updateDataRate();
  }
}

// 数据速率更新逻辑（保留原有功能）
function updateDataRate() {
  const now = Date.now();
  frameCount++;
  // 每秒更新一次数据速率
  if (now - lastTimestamp >= 1000) {
    dataRate = frameCount;
    document.getElementById('data-rate').textContent = dataRate.toFixed(1);
    frameCount = 0;
    lastTimestamp = now;
  }
}


// 初始化连接（连接本地BLE桥接服务）
function connectBridge() {
  connectBridgeWebSocket();
}


// 启动连接
connectBridge();