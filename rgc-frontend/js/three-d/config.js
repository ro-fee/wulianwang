// ═══════════════════════════════════════════════════════════
// 人体动作分析系统 — 全局配置
// 所有阈值、角度、偏移、范围等可调参数集中管理
// ═══════════════════════════════════════════════════════════

export const CONFIG = {
  // ── 场景 ──
  scene: {
    scaleFactor: 0.6,
    cameraFov: 65,
    cameraNear: 0.1,
    cameraFar: 1000,
    cameraPos: [0, 0.3, 3.3],
    cameraLookAt: [0, 0, 0],
    groundSize: 20,
    groundY: -1,
  },

  // ── 模型 ──
  model: {
    fbxPath: 'img/manModule.fbx',
    scale: 0.01,
    position: [0, -1, 0],
  },

  // ── 骨骼动画 ──
  skeleton: {
    lerpFactor: 0.15,
    armDownApose: 80,     // A-pose 手臂下垂角度 (度)
    armDownTpose: 0,      // T-pose 手臂水平角度 (度)
    legRestZ: 180,        // 腿部 rest pose Z 旋转 (度)
    rotationOrder: 'XYZ',
    axisArrowLength: 15,
  },

  // ── 走路模拟 ──
  walk: {
    frequency: 1.0,       // Hz
    armAmplitude: 35,     // 上臂摆动幅度 (度)
    legAmplitude: 30,     // 大腿迈步幅度 (度)
    kneeAmplitude: 45,    // 膝屈伸幅度 (度)
    elbowAmplitude: 10,   // 肘屈伸幅度 (度)
  },

  // ── WebSocket ──
  websocket: {
    port: 8765,
    maxReconnect: 20,
    reconnectDelayMs: 2000,
  },

  // ── 图表 ──
  charts: {
    maxPoints: 200,
    yAxisMin: -180,
    yAxisMax: 180,
    yAxisStep: 45,
  },

  // ── 摆臂分析 ──
  armSwing: {
    // 对称性分级阈值 (度)
    symmetryExcellent: 10,
    symmetryGood: 20,
    symmetryFair: 30,
    // 最大摆角记录触发条件
    recordingTriggerFB: 20,   // 一侧后退 >20° 且另一侧前进 >20° 时开始记录
    recordingTriggerLR: 20,   // 一侧 >20° 且另一侧 <15° 时开始记录
    recordingTriggerLR2: 15,
    // 推荐范围
    frontBackIdealMin: -45,
    frontBackIdealMax: 80,
    leftRightIdealMin: 7,
    leftRightIdealMax: 20,
    leftRightWarn: 30,
    elbowIdealMin: 70,
    elbowIdealMax: 100,
    // 显示偏移
    leftRightDisplayOffset: 90,  // -upperAngles.x + 90
  },

  // ── 步态状态机 ──
  gait: {
    pressureThreshold: 100,
    queueMaxLength: 10,
    consecutiveLimit: 200,   // 连续 C/D 帧超过此数判定为差
  },

  // ── 滑块范围 ──
  sliderRanges: {
    upperArmPitch:     [-90, 90],
    upperArmRoll:      [-40, 40],
    upperArmYaw:       [-30, 30],
    lowerArmPitch:     [-80, 0],
    upperLegPitch:     [-90, 90],
    upperLegRoll:      [-30, 30],
    upperLegYaw:       [-20, 20],
    lowerLegPitch:     [0, 90],
  },

  // ── 预设 ──
  presets: {
    rightLegUp:  60,
    leftLegUp:   60,
    rightArmUp:  90,
    leftArmUp:   90,
  },

  // ── UI ──
  ui: {
    hoverThresholdPx: 60,
    dotSize: 0.008,
    popupAutoHideMs: 2000,
  },
};

// 弧度转换快捷函数
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export function degToRad(d) { return d * DEG; }
export function radToDeg(r) { return r * RAD; }
