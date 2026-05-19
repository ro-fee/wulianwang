// 按实际序号映射（0-17对应1-18号传感器）
const region_coords = [
  [24, 175, 85, 282], [28, 53, 67, 167], [113, 635, 168, 770], [113, 528, 168, 624],
  [93, 408, 150, 515], [52, 295, 135, 395], [93, 170, 137, 282],
  [74, 35, 104, 162], [187, 637, 242, 761], [187, 530, 244, 620],
  [152, 408, 194, 515], [148, 293, 192, 395], [148, 173, 194, 277],
  [115, 37, 146, 160], [205, 410, 244, 513], [203, 297, 253, 393],
  [205, 175, 253, 277], [155, 59, 222, 162]
];

// 重新定义各区域索引（按照新的跑姿定义）
const foreIndices = [12, 16, 13, 17, 7, 1]; // 对应13,17,14,18,8,2号传感器 (索引-1)
const heelIndices = [2, 8, 9, 3]; // 对应3,9,10,4号传感器 (索引-1)
const sideIndices = [4, 5, 14, 15]; // 对应5,6,15,16号传感器 (索引-1)

const HISTORY_SECONDS = 6, FPS = 25, HISTORY_LEN = HISTORY_SECONDS * FPS;
let heatHistory = [];
let currentMode = 'static';
let targetGait = 'none'; // 目标跑姿
let lastLeftHeat = Array(18).fill(0);
let lastRightHeat = Array(18).fill(0);
let lastSpokenText = '';
let lastProSummaryHtml = '';
let lastAnalysisHtml = '';
let lastAnalysisPanelUpdateMs = 0;
const ANALYSIS_PANEL_UPDATE_INTERVAL_MS = 600;
let lastStepTimestamps = [];
let lastFootOnTime = null, currentStepRate = 0;

// 获取Canvas和Context
const leftCanvas = document.getElementById('leftCanvas');
const leftCtx = leftCanvas.getContext('2d');
const rightCanvas = document.getElementById('rightCanvas');
const rightCtx = rightCanvas.getContext('2d');

const leftLegend = document.getElementById('leftLegend');
const rightLegend = document.getElementById('rightLegend');
const analysis = document.getElementById('analysis');
const speakBox = document.getElementById('speakBox');
const trendCanvas = document.getElementById('trendCanvas');
const trendCtx = trendCanvas.getContext('2d');
const trendLegend = document.getElementById('trendLegend');
const stepRateBox = document.getElementById('stepRateBox');
const proSummary = document.getElementById('proSummary');
const targetStatus = document.getElementById('targetStatus');
const leftStatus = document.getElementById('leftStatus');
const rightStatus = document.getElementById('rightStatus');

// 恢复原始脚形图片
const footImg = new Image(); footImg.src = "img/foot_shape.png";
const maskImg = new Image(); maskImg.src = "img/mask.png";
let imgW = 300, imgH = 400, imagesLoaded = 0;

footImg.onload = maskImg.onload = () => {
  imagesLoaded++;
  if (imagesLoaded >= 2 && footImg.width && footImg.height) {
    imgW = footImg.width;
    imgH = footImg.height;
    leftCanvas.width = imgW;
    leftCanvas.height = imgH;
    rightCanvas.width = imgW;
    rightCanvas.height = imgH;
    drawHeat(lastLeftHeat, 'left');
    drawHeat(lastRightHeat, 'right');
  }
};

function switchMode() {
  currentMode = document.getElementById('modeSelect').value;
  updateTargetStatus();
  lastProSummaryHtml = '';
  lastAnalysisHtml = '';
  lastAnalysisPanelUpdateMs = 0;

  // 更新UI提示
  if (currentMode === 'motion') {
    speakBox.textContent = "已切换到运动模式，开始分析跑姿数据...";
    updateAnalysisPanels("<b>运动分析：</b>等待完整步态数据...", "", Date.now(), true);
  } else {
    speakBox.textContent = "已切换到静止模式，分析站立姿势...";
    updateAnalysisPanels("", "", Date.now(), true);
  }
}

function setTargetGait() {
  targetGait = document.getElementById('targetGaitSelect').value;
  updateTargetStatus();

  // 更新UI提示
  if (targetGait !== 'none') {
    const gaitName = targetGait === 'forefoot' ? '前脚掌跑法' : '全脚掌跑法';
    speakBox.textContent = `目标跑姿已设置为: ${gaitName}`;
  } else {
    speakBox.textContent = "已取消目标跑姿设置";
  }
}

function updateTargetStatus() {
  if (targetGait === 'none') {
    targetStatus.innerHTML = "<i class='fas fa-info-circle'></i> 请选择目标跑姿进行对比分析";
    targetStatus.className = "";
  } else if (currentMode === 'static') {
    const gaitName = targetGait === 'forefoot' ? '前脚掌跑法' : '全脚掌跑法';
    targetStatus.innerHTML = `<i class='fas fa-clock'></i> 目标设定：${gaitName} (切换到运动模式开始分析)`;
    targetStatus.className = "";
  } else {
    const gaitName = targetGait === 'forefoot' ? '前脚掌跑法' : '全脚掌跑法';
    targetStatus.innerHTML = `<i class='fas fa-bullseye'></i> 目标：${gaitName} - 等待跑姿数据进行对比...`;
    targetStatus.className = "";
  }
}

function compareWithTarget(actualLanding) {
  if (targetGait === 'none') return null;

  const targetMap = {
    'forefoot': '前脚掌',
    'fullfoot': '全脚掌'
  };

  const targetLanding = targetMap[targetGait];
  const isMatch = actualLanding === targetLanding;

  return {
    target: targetLanding,
    actual: actualLanding,
    isMatch: isMatch,
    advice: getGaitAdvice(targetGait, actualLanding, isMatch)
  };
}

function getGaitAdvice(target, actual, isMatch) {
  if (isMatch) {
    return "当前跑姿正确，请继续保持！";
  }

  if (target === 'forefoot') {
    if (actual === '后脚跟') {
      return "当前是后脚根着地，建议：提高步频，缩短步幅，让前脚掌先着地。";
    } else if (actual === '全脚掌') {
      return "当前是全脚掌着地，建议：身体稍微前倾，提高步频，加强前脚掌着地力度。";
    } else if (actual === '侧脚') {
      return "当前是侧脚着地，建议：调整脚部角度，避免侧向着地，练习前脚掌着地。";
    }
  } else if (target === 'fullfoot') {
    if (actual === '前脚掌') {
      return "当前是前脚掌着地，建议：稍微降低步频，增加脚掌接触面积，让整个脚掌平稳着地。";
    } else if (actual === '后脚跟') {
      return "当前是后脚根着地，建议：缩短步幅，让脚掌更平整地着地，避免只有脚跟接触。";
    } else if (actual === '侧脚') {
      return "当前是侧脚着地，建议：调整脚部角度，让整个脚掌平稳着地。";
    }
  }

  return "请继续调整跑姿。";
}

// 改进的颜色过渡函数 - 使用HSL平滑过渡
function heatColor(v, vmin, vmax) {
  let f = (v - vmin) / (vmax - vmin + 1e-10);
  f = Math.max(0, Math.min(1, f));

  // 使用更平滑的HSL过渡
  let h = 120 - 120 * f;  // 120(绿) 到 0(红)
  let s = 100;
  let l = 30 + 40 * (1 - f);  // 低压力时亮度更高，高压力时亮度降低

  return `hsl(${h},${s}%,${l}%)`;
}

function average(arr) {
  if(!arr||arr.length<1) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function maxIdx(arr) {
  let idx = 0, max = arr[0]||-99999;
  for(let i=1;i<arr.length;i++) if(arr[i]>max){max=arr[i];idx=i;}
  return idx;
}

function updateAnalysisPanels(proHtml, analysisHtml, now, force = false) {
  if (!force && now - lastAnalysisPanelUpdateMs < ANALYSIS_PANEL_UPDATE_INTERVAL_MS) return;

  if (proHtml !== lastProSummaryHtml) {
    proSummary.innerHTML = proHtml;
    lastProSummaryHtml = proHtml;
  }

  if (analysisHtml !== lastAnalysisHtml) {
    analysis.innerHTML = analysisHtml;
    lastAnalysisHtml = analysisHtml;
  }

  lastAnalysisPanelUpdateMs = now;
}

function speakText(text) {
  if (!text || text === lastSpokenText) return;
  lastSpokenText = text;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
  speakBox.innerText = text;
}

function detectStepEvents(now, historyArr) {
  const lastN = 16;
  if (!historyArr || historyArr.length < lastN) return null;
  let totalArr = historyArr.map(e=>e.heat.reduce((a,b)=>a+b));
  let threshold = average(totalArr) * 0.45 + 180;
  let steps = [];
  let inContact = false, contactStart=-1;
  for(let i=0;i<totalArr.length;i++){
    if (!inContact && totalArr[i]>threshold){
      inContact=true;contactStart=i;
    }
    if (inContact && totalArr[i]<threshold){
      if(contactStart>=0 && (i-contactStart)>=2){
        let slice = totalArr.slice(contactStart,i);
        let peakIdx = contactStart + maxIdx(slice);
        steps.push({
          start:contactStart,
          end:i,
          peakIdx:peakIdx,
          peak:totalArr[peakIdx],
          peakVal:totalArr[peakIdx],
        });
      }
      inContact=false;contactStart=-1;
    }
  }
  for(const s of steps){
    s.durationMs = (historyArr[s.end].time - historyArr[s.start].time)||1;
    s.contactStartTs = historyArr[s.start].time;
  }
  return steps;
}
let heelDetectionCount = 0;
const REQUIRED_CONSECUTIVE_FRAMES = 2;
function getLandingType(historyArr, step) {
  let firstFrames=[];
  for(let f=step.start; f<=step.start+2&&f<=step.peakIdx; ++f){
    firstFrames.push(historyArr[f].heat);
  }

  let regionStatus = {fore: 0, heel: 0, side: 0};
  for(const h of firstFrames) {
    let fore = average(foreIndices.map(i=>h[i]));
    let heel = average(heelIndices.map(i=>h[i]));
    let side = average(sideIndices.map(i=>h[i]));
    regionStatus.fore += fore;
    regionStatus.heel += heel;
    regionStatus.side += side;
  }

  // 取平均值
  regionStatus.fore /= firstFrames.length;
  regionStatus.heel /= firstFrames.length;
  regionStatus.side /= firstFrames.length;

  // 根据新的定义判断跑姿
  const threshold = 80;

// 修改后脚跟判定逻辑
if (regionStatus.heel > threshold &&
    regionStatus.heel > regionStatus.fore * 1.6 &&
    regionStatus.heel > regionStatus.side * 1.6) {
  heelDetectionCount++;
  if (heelDetectionCount >= REQUIRED_CONSECUTIVE_FRAMES) {
    heelDetectionCount = 0; // 重置计数器
    return "后脚跟";
  }
} else {
  heelDetectionCount = 0; // 不满足条件时重置
}

  // 前脚掌跑法：前脚掌区域最大
  if (regionStatus.fore > threshold && regionStatus.fore > regionStatus.heel * 1.2 && regionStatus.fore > regionStatus.side * 1.2) {
    return "前脚掌";
  }

  // 侧脚跑法：侧脚区域最大
  if (regionStatus.side > threshold && regionStatus.side > regionStatus.fore * 1.2 && regionStatus.side > regionStatus.heel * 1.2) {
    return "侧脚";
  }

  // 全脚掌跑法：前后脚掌都很大，不分高下
  if (regionStatus.fore > threshold && regionStatus.heel > threshold && Math.abs(regionStatus.fore - regionStatus.heel) < Math.max(regionStatus.fore, regionStatus.heel) * 0.3) {
    return "全脚掌";
  }

  // 默认判断
  let maxRegion = Math.max(regionStatus.fore, regionStatus.heel, regionStatus.side);
  if (maxRegion === regionStatus.fore) return "前脚掌";
  if (maxRegion === regionStatus.heel) return "后脚跟";
  if (maxRegion === regionStatus.side) return "侧脚";
  return "全脚掌";
}

function detectStepRate(now, heatData) {
  const total = heatData.reduce((a,b)=>a+b, 0);
  const totalAvg = average(lastLeftHeat);
  const touchdownThresh = totalAvg*1.25 + 120;
  if (!lastFootOnTime || (total > touchdownThresh && lastLeftHeat.reduce((a,b)=>a+b,0) <= touchdownThresh)) {
    if (!lastFootOnTime || (now - lastFootOnTime) > 250) {
      lastFootOnTime = now;
      lastStepTimestamps.push(now);
      if (lastStepTimestamps.length > 10) lastStepTimestamps.shift();
      if (lastStepTimestamps.length >= 2) {
        let dt = lastStepTimestamps[lastStepTimestamps.length-1] - lastStepTimestamps[0];
        if (dt > 0) currentStepRate = Math.round(60000 * (lastStepTimestamps.length-1) / dt);
      }
    }
  }
}

function analyzeGaitTimeSeries(historyArr,steps) {
  if (!historyArr || historyArr.length<5||!steps||steps.length<1) return null;
  let s = steps[steps.length-1];
  let landing = getLandingType(historyArr, s);
  let foreAvgArr = [], heelAvgArr = [];
  for(let f=s.start;f<=s.end;++f){
    let h = historyArr[f].heat;
    foreAvgArr.push(average(foreIndices.map(i=>h[i])));
    heelAvgArr.push(average(heelIndices.map(i=>h[i])));
  }
  let trend = (heelAvgArr[0] < foreAvgArr[0] && heelAvgArr.at(-1)>foreAvgArr.at(-1))?"前→后":
              (heelAvgArr[0] > foreAvgArr[0] && heelAvgArr.at(-1)<foreAvgArr.at(-1))?"后→前":"均衡";
  let peakVal = s.peakVal, peakTick = s.peakIdx - s.start;
  let stepWindow = historyArr.slice(s.start, s.end+1).map(e=>e.heat.reduce((a,b)=>a+b));
  let preVal = stepWindow[0], postVal = stepWindow.at(-1);
  let isExplosive = (peakVal - preVal) > 600 && peakTick <= 2;
  let durationMs = s.durationMs;
  return {
    landing,
    trend,
    peakVal,
    peakTick,
    durationMs,
    isExplosive,
    stepStart:s.start,
    stepEnd:s.end
  };
}

function analyzeGaitStaticOrDynamic(data, historyArr, now) {
  const total = data.reduce((a,b)=>a+b, 0);
  if (total < 1) {
    updateAnalysisPanels("", "等待有效数据...", now, true);
    return;
  }
  let proMessage = '', landing='', trend='', peakVal=0, durationMs=0, expl='', tick=0, cgMsg='', gaitsName='';
  let steps = detectStepEvents(now, historyArr);

  if (currentMode === 'motion' && (!steps || !steps.length)) {
    if (!lastProSummaryHtml) {
      updateAnalysisPanels("<b>运动分析：</b>等待完整步态数据...", "", now, true);
    }
    return;
  }

  if(currentMode==='motion'){
    let gaitDetail = analyzeGaitTimeSeries(historyArr,steps);
    if(gaitDetail){
      landing = gaitDetail.landing;
      trend = gaitDetail.trend;
      peakVal = gaitDetail.peakVal;
      tick = gaitDetail.peakTick;
      durationMs = gaitDetail.durationMs;
      expl = gaitDetail.isExplosive?'爆发式撞击':'无爆发式撞击';
    }
    let period=0, ground=0, flight=0, rate=0, ratio=0;
    if(steps.length>=2){
      let lastTwo = steps.slice(-2);
      period = (historyArr[lastTwo[1].start].time-historyArr[lastTwo[0].start].time)||1;
      ground = lastTwo[1].durationMs;
      flight = period - ground;
      rate = period>0?Math.round(60000.0/period):0;
      ratio = ground/period;
      cgMsg = `步态周期:${period}ms, 接地:${ground}ms, 腾空:${flight}ms, 步频:<b>${rate}</b>，接地/周期比:<b>${(ratio*100).toFixed(1)}%</b>。<br>高步频短接地:` + ((rate>=170&&ratio<0.46)?"<span style='color:#4df'>是</span>":"否");
    }
    gaitsName = landing+"跑法";

    // 目标跑姿对比分析
    const comparison = compareWithTarget(landing);
    let targetAnalysis = '';
    let speechText = '';

    if (comparison) {
      const statusClass = comparison.isMatch ? '' : 'mismatch';
      const statusIcon = comparison.isMatch ? '✓' : '✗';
      const statusText = comparison.isMatch ? '达标' : '偏差';

      targetStatus.innerHTML = `${statusIcon} 目标：${comparison.target} | 实际：${comparison.actual} | ${statusText}`;
      targetStatus.className = statusClass;

      // 修改播报内容：专注于当前跑姿和目标差异
      if (comparison.isMatch) {
        speechText = "当前跑姿正确，请继续保持！";
      } else {
        speechText = comparison.advice;
      }

      targetAnalysis = `<br><strong>目标分析：</strong>${comparison.advice}`;
    } else {
      speechText = `当前${gaitsName}。压力传导${trend}。${expl}。${rate?'步频'+rate+' ':''}`;
    }

    proMessage = `
    <strong>【专业分析】</strong>&nbsp;&nbsp;
    <span>着地：</span><b style="color:#48e2c3">${landing}</b>
    <span> &nbsp;压力传导：</span><b style="color:#52e4fe">${trend||'无'}</b>
    <br><span>压力峰值：</span><b style="color:#fd8">${peakVal}</b>
    <span>，持续：</span><b style="color:#fd8">${durationMs}ms</b>
    <span>，${expl}</span>
    <br>${cgMsg}
    <br>判定：<span style="background:#ffe163;color:#222;padding:2px 9px 2px 9px;border-radius:5px;">${gaitsName}</span>
    `;
    const analysisMessage = '如需纠正，请结合建议练习改善：步频、冲击、落地方式等。' + targetAnalysis;
    updateAnalysisPanels(proMessage, analysisMessage, now);

    speakText(speechText);
  } else {
    let fore = average(foreIndices.map(i=>data[i]));
    let heel = average(heelIndices.map(i=>data[i]));
    let side = average(sideIndices.map(i=>data[i]));
    let result = "", advice = "";
    if (fore > heel && fore > side) result = "前脚掌站立";
    else if (heel > fore && heel > side) result = "后脚跟站立";
    else if (side > fore && side > heel) result = "侧脚站立";
    else result = "全脚掌站立";
    advice = "静止模式，无需调整。";
    proMessage = `<b>站立分析：</b>${result}<br>姿势：${advice}`;
    updateAnalysisPanels(proMessage, "", now, true);
    updateTargetStatus();
  }
}

function drawHeat(data, foot) {
  const ctx = foot === 'left' ? leftCtx : rightCtx;
  const legend = foot === 'left' ? leftLegend : rightLegend;

  ctx.clearRect(0, 0, imgW, imgH);
  ctx.globalAlpha = 0.4;
  ctx.drawImage(footImg, 0, 0, imgW, imgH);
  let vmin = Math.min(...data), vmax=Math.max(...data, 1);

  // 如果是左脚，需要镜像处理坐标
  for (let i = 0; i < region_coords.length; i++) {
    let [x1, y1, x2, y2] = region_coords[i];
    let v = data[i] || 0;

    // 左脚镜像处理
    if (foot === 'left') {
      let tempX1 = imgW - x2;
      let tempX2 = imgW - x1;
      x1 = tempX1;
      x2 = tempX2;
    }

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = heatColor(v,0,6000);
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.globalAlpha = 0.91;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.fillText(Math.round(v), (x1 + x2) / 2, (y1 + y2) / 2);
  }

  // 关键修改：设置完全不透明的遮罩
  ctx.globalAlpha = 1.0; // 将透明度改为完全不透明

  // 左脚图片也需要镜像
  if (foot === 'left') {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(maskImg, -imgW, 0, imgW, imgH);
    ctx.restore();
  } else {
    ctx.drawImage(maskImg, 0, 0, imgW, imgH);
  }

  legend.innerHTML = `${foot === 'left' ? '左脚' : '右脚'} 最小:<b style="color:#fe4">${Math.round(vmin)}</b> 最大:<b style="color:#f44">${Math.round(vmax)}</b>`;
}

function drawTrend(historyArr) {
  trendCtx.clearRect(0,0,trendCanvas.width,trendCanvas.height);
  if (!historyArr || historyArr.length<2) {
    trendLegend.innerHTML="趋势区：等待有效数据";
    return;
  }
  const arr = historyArr.slice(-HISTORY_LEN);
  const n = arr.length;
  let foreArr = arr.map(e=>average(foreIndices.map(i=>e.heat[i])));
  let heelArr = arr.map(e=>average(heelIndices.map(i=>e.heat[i])));
  let totalArr= arr.map(e=>e.heat.reduce((a,b)=>a+b));
  const padY = 6, H = trendCanvas.height, W = trendCanvas.width, padL=37, padR=8;
  const scaleX = (W-padL-padR)/(n-1), allY=[...foreArr,...heelArr,...totalArr];
  let minV = Math.min(...allY), maxV = Math.max(...allY);
  let scaleY = (H-2*padY)/(maxV-minV+1e-6);
  trendCtx.save();
  trendCtx.strokeStyle="#335"; trendCtx.globalAlpha=0.13;
  for (let i=0;i<5;++i){
    let y = Math.round(H - padY - i*((H-2*padY)/4));
    trendCtx.beginPath();
    trendCtx.moveTo(padL,y);trendCtx.lineTo(W-padR,y);
    trendCtx.stroke();
  }
  trendCtx.globalAlpha=1.0;
  function drawLine(arr,color){
    trendCtx.beginPath();
    for (let i=0;i<n;++i) {
      let y = H - padY - (arr[i]-minV)*scaleY;
      let x = padL+i*scaleX;
      if(i===0) trendCtx.moveTo(x,y); else trendCtx.lineTo(x,y);
    }
    trendCtx.strokeStyle = color; trendCtx.lineWidth=2.2;
    trendCtx.stroke();
  }
  drawLine(totalArr, "#fff");
  drawLine(foreArr, "#ffa652");
  drawLine(heelArr, "#62baff");
  trendCtx.font="11px monospace";trendCtx.fillStyle="#888";
  trendCtx.textAlign="right";
  trendCtx.fillText("压力/趋势",padL-2,padY+8);
  trendCtx.textAlign="left";
  trendCtx.fillText(Math.round(maxV),padL+2,padY+8);
  trendCtx.fillText(Math.round(minV),padL+2,H-padY);
  trendCtx.restore();
  trendLegend.innerHTML = '压力趋势：<span style="color:#ffa652">前掌</span> / <span style="color:#62baff">后跟</span> / <span style="color:#fff">总压力</span>';
}

// 本地BLE桥接WebSocket连接
const BRIDGE_WS_URL = `ws://${window.location.hostname || '127.0.0.1'}:8765`;
const BRIDGE_MAX_RECONNECT = 20;
let bridgeSocket = null;
let bridgeReconnectCount = 0;
let bridgeReconnectTimer = null;

// 缓存左右脚的数据
let leftDataCache = null;
let rightDataCache = null;

// 工具函数：获取设备名称
function getDeviceName(deviceKey) {
  return deviceKey === 'left' ? '左设备' : deviceKey === 'right' ? '右设备' : '未知设备';
}

// 更新连接状态显示
function updateConnectionStatus(deviceKey, status, message) {
  const statusElement = deviceKey === 'left' ? leftStatus : rightStatus;
  statusElement.textContent = message;
  statusElement.className = 'status-indicator ' + status;
}

function updateLegend(deviceKey, text) {
  const legend = deviceKey === 'left' ? leftLegend : rightLegend;
  const deviceName = getDeviceName(deviceKey);
  legend.innerText = `${deviceName}(桥接): ${text}`;
  console.log(`${deviceName}: ${text}`);
}

function updateBothBridgeStatuses(status, message) {
  updateConnectionStatus('left', status, message);
  updateConnectionStatus('right', status, message);
  updateLegend('left', message);
  updateLegend('right', message);
}

function connectBridgeWebSocket() {
  clearTimeout(bridgeReconnectTimer);
  if (bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN) return;

  updateBothBridgeStatuses('connecting', '连接桥接服务中...');
  bridgeSocket = new WebSocket(BRIDGE_WS_URL);

  bridgeSocket.onopen = () => {
    bridgeReconnectCount = 0;
    updateBothBridgeStatuses('connected', '桥接服务已连接，等待BLE数据...');
  };

  bridgeSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('收到桥接数据:', msg);
      handleMessage(msg);
      if (msg.source === 'LEFT') {
        updateConnectionStatus('left', 'connected', '已收到数据');
        updateLegend('left', '已收到BLE数据');
      } else if (msg.source === 'RIGHT') {
        updateConnectionStatus('right', 'connected', '已收到数据');
        updateLegend('right', '已收到BLE数据');
      }
    } catch (error) {
      updateBothBridgeStatuses('disconnected', `数据解析失败: ${error.message}`);
      console.log(`桥接数据解析失败: ${error.message}`);
    }
  };

  bridgeSocket.onerror = () => {
    updateBothBridgeStatuses('disconnected', '桥接服务连接错误');
  };

  bridgeSocket.onclose = () => {
    if (bridgeReconnectCount >= BRIDGE_MAX_RECONNECT) {
      updateBothBridgeStatuses('disconnected', '桥接服务连接失败');
      return;
    }
    bridgeReconnectCount++;
    updateBothBridgeStatuses('connecting', `桥接重连中 (${bridgeReconnectCount}/${BRIDGE_MAX_RECONNECT})`);
    bridgeReconnectTimer = setTimeout(connectBridgeWebSocket, 2000);
  };
}

// 消息处理函数（采用第二份代码的完整数据分析逻辑）
function handleMessage(msg) {
  let heatData;
  let foot;

  // 验证数据格式并提取有效部分（后18位）
  if (msg.source === 'RIGHT' && Array.isArray(msg.data) && msg.data.length === 24) {
    heatData = msg.data.slice(-18);
    foot = 'right';
    rightDataCache = heatData; // 缓存右脚数据
    drawHeat(heatData, 'right'); // 立即绘制右脚
  } else if (msg.source === 'LEFT' && Array.isArray(msg.data) && msg.data.length === 24) {
    heatData = msg.data.slice(-18);
    foot = 'left';
    leftDataCache = heatData; // 缓存左脚数据
    drawHeat(heatData, 'left'); // 立即绘制左脚
  }

  // 有效数据处理
  if (heatData && heatData.length === 18) {
    const combinedMsg = { [foot + '_foot']: heatData };
    processCombinedMessage(combinedMsg, foot); // 调用组合消息处理
  }
}

// 组合消息处理（采用第二份代码的完整数据分析逻辑）
function processCombinedMessage(combinedMsg, foot) {
  let heatData;
  // 只处理当前选中脚的数据
  if (Array.isArray(combinedMsg[foot + '_foot'])) {
    heatData = combinedMsg[foot + '_foot'];
  }

  if (heatData && heatData.length === 18) {
    if (foot === 'left') {
      lastLeftHeat = heatData;
    } else {
      lastRightHeat = heatData;
    }

    const now = Date.now();

    // 步频检测
    detectStepRate(now, heatData);

    // 存储历史数据（保留时间窗口逻辑）
    heatHistory.push({
      time: now,
      heat: [...heatData],
      foot: foot
    });
    // 清理过期历史数据
    while (heatHistory.length && (now - heatHistory[0].time) > HISTORY_SECONDS * 1000 + 500) {
      heatHistory.shift();
    }

    // 绘图与分析（保留原展示逻辑调用）
    const footHistory = heatHistory.filter(e => e.foot === 'left'); // 默认使用左脚数据进行趋势分析
    drawTrend(footHistory); // 绘制趋势图
    analyzeGaitStaticOrDynamic(heatData, footHistory, now); // 步态分析
  }
}

// 初始化连接
function connectBridge() {
  connectBridgeWebSocket();
}

// 页面加载后连接本地BLE桥接服务
window.addEventListener('load', connectBridge);

// 添加页面加载动画
document.addEventListener('DOMContentLoaded', function() {
  document.body.classList.add('loaded');

  // 初始化UI状态
  updateTargetStatus();
  speakBox.textContent = "系统初始化完成，等待数据连接...";
});