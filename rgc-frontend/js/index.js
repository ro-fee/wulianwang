// 手臂关节数据图表
const MAX_POINTS = 60;
let globalIndex = 0;
const charts = {};

// 初始化手臂关节图表
function initArmCharts() {
    // 左臂图表
    const leftCanvas = document.getElementById('left_arm_chart');
    const rightCanvas = document.getElementById('right_arm_chart');
    if (!leftCanvas || !rightCanvas) {
        addToConsole('未找到主页手臂图表容器，跳过图表初始化，仅保留BLE连接日志。', 'warning');
        return;
    }
    const leftCtx = leftCanvas.getContext('2d');
    charts.left = new Chart(leftCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                // 左大臂 X轴
                {
                    label: '左大臂-X',
                    data: [],
                    borderColor: 'rgba(255, 99, 132, 0.8)',
                    borderWidth: 2,
                    borderDash: [],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 左大臂 Y轴
                {
                    label: '左大臂-Y',
                    data: [],
                    borderColor: 'rgba(75, 192, 192, 0.8)',
                    borderWidth: 2,
                    borderDash: [],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 左大臂 Z轴
                {
                    label: '左大臂-Z',
                    data: [],
                    borderColor: 'rgba(54, 162, 235, 0.8)',
                    borderWidth: 2,
                    borderDash: [],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 左小臂 X轴
                {
                    label: '左小臂-X',
                    data: [],
                    borderColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 左小臂 Y轴
                {
                    label: '左小臂-Y',
                    data: [],
                    borderColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 左小臂 Z轴
                {
                    label: '左小臂-Z',
                    data: [],
                    borderColor: 'rgba(54, 162, 235, 0.5)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.1
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
                        color: '#666',
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#666',
                        maxTicksLimit: 10,
                        font: {
                            size: 9
                        }
                    }
                },
                y: {
                    min: -180,
                    max: 180,
                    title: {
                        display: true,
                        text: "欧拉角 (°)",
                        color: '#666',
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#666',
                        stepSize: 60,
                        font: {
                            size: 9
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(8,12,20,0.92)',
                    titleColor: '#00e5ff',
                    bodyColor: '#e8ecf2',
                    borderColor: 'rgba(0,229,255,0.3)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 6,
                    titleFont: { family: 'Rajdhani,PingFang SC,sans-serif', size: 12, weight: '600' },
                    bodyFont: { family: 'JetBrains Mono,Consolas,monospace', size: 10 }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        drag: {
                            enabled: true,
                            backgroundColor: 'rgba(0,229,255,0.08)',
                            borderColor: 'rgba(0,229,255,0.3)',
                        },
                        mode: 'x',
                    },
                    limits: { x: { minRange: 10 } },
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
    // 右臂图表
    const rightCtx = rightCanvas.getContext('2d');
    charts.right = new Chart(rightCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                // 右大臂 X轴
                {
                    label: '右大臂-X',
                    data: [],
                    borderColor: 'rgba(255, 99, 132, 0.8)',
                    borderWidth: 2,
                    borderDash: [],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 右大臂 Y轴
                {
                    label: '右大臂-Y',
                    data: [],
                    borderColor: 'rgba(75, 192, 192, 0.8)',
                    borderWidth: 2,
                    borderDash: [],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 右大臂 Z轴
                {
                    label: '右大臂-Z',
                    data: [],
                    borderColor: 'rgba(54, 162, 235, 0.8)',
                    borderWidth: 2,
                    borderDash: [],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 右小臂 X轴
                {
                    label: '右小臂-X',
                    data: [],
                    borderColor: 'rgba(255, 99, 132, 0.5)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 右小臂 Y轴
                {
                    label: '右小臂-Y',
                    data: [],
                    borderColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.1
                },
                // 右小臂 Z轴
                {
                    label: '右小臂-Z',
                    data: [],
                    borderColor: 'rgba(54, 162, 235, 0.5)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.1
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
                        color: '#666',
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#666',
                        maxTicksLimit: 10,
                        font: {
                            size: 9
                        }
                    }
                },
                y: {
                    min: -180,
                    max: 180,
                    title: {
                        display: true,
                        text: "欧拉角 (°)",
                        color: '#666',
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#666',
                        stepSize: 60,
                        font: {
                            size: 9
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(8,12,20,0.92)',
                    titleColor: '#00e5ff',
                    bodyColor: '#e8ecf2',
                    borderColor: 'rgba(0,229,255,0.3)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 6,
                    titleFont: { family: 'Rajdhani,PingFang SC,sans-serif', size: 12, weight: '600' },
                    bodyFont: { family: 'JetBrains Mono,Consolas,monospace', size: 10 }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        drag: {
                            enabled: true,
                            backgroundColor: 'rgba(0,229,255,0.08)',
                            borderColor: 'rgba(0,229,255,0.3)',
                        },
                        mode: 'x',
                    },
                    limits: { x: { minRange: 10 } },
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// 添加数据到图表
function pushData(side, upperData, lowerData) {
    const chart = charts[side];
    if (!chart) return;
    // 更新大臂数据
    for (let i = 0; i < 3; i++) {
        chart.data.datasets[i].data.push(upperData[i]);
    }
    // 更新小臂数据
    for (let i = 0; i < 3; i++) {
        chart.data.datasets[i + 3].data.push(lowerData[i]);
    }
    // 更新标签
    chart.data.labels.push(globalIndex);
    // 保持数据长度
    if (chart.data.labels.length > MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(ds => ds.data.shift());
    }
    chart.update('none');
}

// 本地BLE桥接WebSocket连接
const BRIDGE_WS_URL = `ws://${window.location.hostname || '127.0.0.1'}:8765`;
const BRIDGE_MAX_RECONNECT = 20;
let bridgeSocket = null;
let bridgeReconnectCount = 0;
let bridgeReconnectTimer = null;
let lastBridgePacketLogAt = 0;

function handleBridgeMessage(msg) {
    if (msg.source && Array.isArray(msg.data)) {
        const now = Date.now();
        if (now - lastBridgePacketLogAt > 1000) {
            addToConsole(`收到${msg.source}桥接数据，长度: ${msg.data.length}`, 'success');
            lastBridgePacketLogAt = now;
        }
    }

    if (msg.source && Array.isArray(msg.data) && msg.data.length >= 6) {
        const side = msg.source === 'LEFT' ? 'left' : msg.source === 'RIGHT' ? 'right' : null;
        if (!side) return;
        globalIndex++;
        pushData(side, msg.data.slice(0, 3), msg.data.slice(3, 6));
        return;
    }

    if (msg.euler_angles) {
        globalIndex++;
        if (msg.euler_angles.left_upper && msg.euler_angles.left_lower) {
            pushData('left', msg.euler_angles.left_upper, msg.euler_angles.left_lower);
        }
        if (msg.euler_angles.right_upper && msg.euler_angles.right_lower) {
            pushData('right', msg.euler_angles.right_upper, msg.euler_angles.right_lower);
        }
    }
}

function connectBridgeWebSocket() {
    clearTimeout(bridgeReconnectTimer);
    if (bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN) return;

    addToConsole(`正在连接本地BLE桥接服务: ${BRIDGE_WS_URL}`, 'info');
    bridgeSocket = new WebSocket(BRIDGE_WS_URL);

    bridgeSocket.onopen = () => {
        bridgeReconnectCount = 0;
        addToConsole('已连接本地BLE桥接服务，等待单片机数据...', 'success');
    };

    bridgeSocket.onmessage = (event) => {
        try {
            handleBridgeMessage(JSON.parse(event.data));
        } catch (error) {
            addToConsole(`桥接数据解析错误: ${error.message}`, 'error');
        }
    };

    bridgeSocket.onerror = () => {
        addToConsole('本地BLE桥接服务连接错误，请确认启动器正在运行', 'error');
    };

    bridgeSocket.onclose = () => {
        if (bridgeReconnectCount >= BRIDGE_MAX_RECONNECT) {
            addToConsole(`本地BLE桥接服务重连${BRIDGE_MAX_RECONNECT}次失败`, 'error');
            return;
        }
        bridgeReconnectCount++;
        addToConsole(`本地BLE桥接服务断开，第${bridgeReconnectCount}次重连...`, 'warning');
        bridgeReconnectTimer = setTimeout(connectBridgeWebSocket, 2000);
    };
}

// 添加日志到控制台
function addToConsole(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const colorMap = { error: '#ff6b6b', success: '#00ff88', warning: '#ffb800', info: '#e8ecf2' };
    const color = colorMap[type] || '#e8ecf2';
    const line = document.createElement('p');
    line.className = 'terminal-line';
    line.style.color = color;
    line.innerHTML = `[${timestamp}] ${message}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// 控制台功能
const consoleOutput = document.getElementById('console-output');
const clearConsoleBtn = document.getElementById('clear-console');
const toggleConsoleBtn = document.getElementById('toggle-console');
// 清空控制台
clearConsoleBtn.addEventListener('click', function () {
    consoleOutput.innerHTML = '';
    addToConsole('控制台已清空', 'info');
});
// 切换控制台全屏
toggleConsoleBtn.addEventListener('click', function () {
    const consoleContainer = consoleOutput.parentElement;
    if (consoleContainer.classList.contains('h-64')) {
        consoleContainer.classList.remove('h-64');
        consoleContainer.classList.add('h-[calc(100vh-400px)]');
        toggleConsoleBtn.innerHTML = '<i class="fa fa-compress mr-1"></i> 退出全屏';
    } else {
        consoleContainer.classList.remove('h-[calc(100vh-400px)]');
        consoleContainer.classList.add('h-64');
        toggleConsoleBtn.innerHTML = '<i class="fa fa-expand mr-1"></i> 全屏';
    }
});

// 系统状态实时更新功能
function updateSystemStatus() {
    // 真实数据范围
    const cpuUsage = Math.floor(Math.random() * 21) + 30; // 30-50%
    const memoryUsage = Math.floor(Math.random() * 21) + 40; // 40-60%
    const dataRate = Math.floor(Math.random() * 21) + 50; // 50-70样本/秒
    const devices = 1; // 固定一台设备
    // 更新CPU使用率
    document.getElementById('cpu-usage-bar').style.width = `${cpuUsage}%`;
    document.getElementById('cpu-usage-text').textContent = `${cpuUsage}%`;
    // 更新内存使用率
    document.getElementById('memory-usage-bar').style.width = `${memoryUsage}%`;
    document.getElementById('memory-usage-text').textContent = `${memoryUsage}%`;
    // 更新数据处理速度
    document.getElementById('data-processing-rate').innerHTML = `${dataRate} <span class="text-sm font-normal text-info">样本/秒</span>`;
    // 更新连接设备数
    document.getElementById('connected-devices').innerHTML = `${devices} <span class="text-sm font-normal text-info">台设备</span>`;
    // 更新最后更新时间
    const now = new Date();
    document.getElementById('last-updated').textContent = `最后更新: ${now.toLocaleTimeString()}`;
    // 随机添加新活动（25%概率）
    if (Math.random() > 0.75) {
        addRandomActivity();
    }
}

// 活动事件类型
const activityEvents = [
    {
        type: 'info',
        icon: 'info',
        color: 'blue',
        messages: [
            '数据采集模块已启动',
            '分析报告生成完成',
            '系统更新已下载',
            '数据备份已完成'
        ]
    },
    {
        type: 'success',
        icon: 'check',
        color: 'green',
        messages: [
            '传感器校准成功',
            '实时数据流已稳定',
            '健康数据分析完成',
            '数据同步成功'
        ]
    },
    {
        type: 'warning',
        icon: 'exclamation',
        color: 'yellow',
        messages: [
            '左臂传感器信号微弱',
            '网络延迟增加',
            '存储空间剩余不足20%',
            '数据缓存接近上限'
        ]
    }
];

// 添加随机活动
function addRandomActivity() {
    const activityType = activityEvents[Math.floor(Math.random() * activityEvents.length)];
    const message = activityType.messages[Math.floor(Math.random() * activityType.messages.length)];
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const colorMap = { blue: '#00e5ff', green: '#00ff88', yellow: '#ffb800' };
    const dotColor = colorMap[activityType.color] || '#8b95a8';
    const activityElement = document.createElement('div');
    activityElement.className = 'flex items-start';
    activityElement.innerHTML = `
        <div class="flex-shrink-0 mt-0.5">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full" style="background:${dotColor}15;color:${dotColor}">
                <i class="fa fa-${activityType.icon} text-xs"></i>
            </span>
        </div>
        <div class="ml-3">
            <p class="text-sm text-info">${message}</p>
            <p class="text-xs text-muted">${timeString}</p>
        </div>
    `;
    const container = document.getElementById('recent-activities');
    container.insertBefore(activityElement, container.firstChild);
    // 保持最多3条活动
    if (container.children.length > 3) {
        container.removeChild(container.lastChild);
    }
}

// 页面加载完成后的动画效果
// 在 DOMContentLoaded 事件处理函数中添加用户信息更新
document.addEventListener('DOMContentLoaded', function() {
    // 平滑滚动效果
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if(targetId === '#') return;
            document.querySelector(targetId).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // 更新用户名
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
        try {
            const user = JSON.parse(userInfo);
            document.getElementById('userNameDisplay').textContent = user.nickname;
        } catch (e) {
            console.error('解析用户信息失败', e);
        }
    }

    // 更新用户头像
    const userAvatar = localStorage.getItem('userAvatar');
    if (userAvatar) {
        document.getElementById('userAvatar').src = userAvatar;
    }

    // 初始化图表
    initArmCharts();
    // 连接本地BLE桥接服务
    connectBridgeWebSocket();
    // 初始化系统状态更新
    setInterval(updateSystemStatus, 5000); // 每5秒更新一次
    updateSystemStatus(); // 初始更新
    // 添加初始活动（最多3条）
    const container = document.getElementById('recent-activities');
    container.innerHTML = ''; // 清空容器
    for (let i = 0; i < 3; i++) {
        addRandomActivity();
    }
});

