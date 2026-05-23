// ═══════════════════════════════════════════════════════════
// 人体动作分析系统 — 常量定义
// 骨骼名、关节键、轴定义等不可变常量
// ═══════════════════════════════════════════════════════════

// ── FBX Mixamo 动画骨骼名称 ──
export const ANIM_BONES = [
  'mixamorigLeftArm',
  'mixamorigLeftForeArm',
  'mixamorigRightArm',
  'mixamorigRightForeArm',
  'mixamorigLeftUpLeg',
  'mixamorigLeftLeg',
  'mixamorigRightUpLeg',
  'mixamorigRightLeg',
];

// ── 关节弹出菜单的骨骼名称 ──
export const BONE_NAMES = [
  'mixamorigLeftArm', 'mixamorigLeftForeArm',
  'mixamorigRightArm', 'mixamorigRightForeArm',
  'mixamorigLeftUpLeg', 'mixamorigLeftLeg',
  'mixamorigRightUpLeg', 'mixamorigRightLeg',
];

// ── 关节信息映射 (骨骼名 → 显示信息) ──
export const BONE_INFO = {
  mixamorigLeftArm:       { key: 'left_upper',      label: '左大臂' },
  mixamorigLeftForeArm:   { key: 'left_lower',      label: '左小臂' },
  mixamorigRightArm:      { key: 'right_upper',     label: '右大臂' },
  mixamorigRightForeArm:  { key: 'right_lower',     label: '右小臂' },
  mixamorigLeftUpLeg:     { key: 'left_upperLeg',   label: '左大腿' },
  mixamorigLeftLeg:       { key: 'left_lowerLeg',   label: '左小腿' },
  mixamorigRightUpLeg:    { key: 'right_upperLeg',  label: '右大腿' },
  mixamorigRightLeg:      { key: 'right_lowerLeg',  label: '右小腿' },
};

// ── 图表关节配置 (波形图显示哪些关节) ──
export const CHART_JOINTS = [
  { key: 'left_upper',  label: '左大臂' },
  { key: 'left_lower',  label: '左小臂' },
  { key: 'right_upper', label: '右大臂' },
  { key: 'right_lower', label: '右小臂' },
];

// ── 轴标签 ──
export const AXIS_NAMES = ['X', 'Y', 'Z'];

// ── 人体语义轴定义 ──
// Flexion/Extension   = 前后 (矢状面)
// Abduction/Adduction = 左右 (冠状面)
// Yaw                 = 扭转 (绕骨轴)
export const SEMANTIC_AXES = ['flexion', 'abduction', 'yaw'];

// ── 左右侧类型 ──
export const Side = Object.freeze({ LEFT: 'LEFT', RIGHT: 'RIGHT' });

// ── 关节键列表 ──
export const JOINT_KEYS = [
  'left_upper', 'left_lower', 'right_upper', 'right_lower',
  'left_upperLeg', 'left_lowerLeg', 'right_upperLeg', 'right_lowerLeg',
];

// ── 关节键 → 中文标签 ──
export const JOINT_LABELS = {
  left_upper:      '左大臂',
  left_lower:      '左小臂',
  right_upper:     '右大臂',
  right_lower:     '右小臂',
  left_upperLeg:   '左大腿',
  left_lowerLeg:   '左小腿',
  right_upperLeg:  '右大腿',
  right_lowerLeg:  '右小腿',
};

// ── 关节键 → 所属侧 ──
export function jointSide(jointKey) {
  return jointKey.startsWith('left') ? Side.LEFT : Side.RIGHT;
}

// ── 关节键 → 所属部位 ──
export function jointPart(jointKey) {
  if (jointKey.includes('lowerLeg')) return 'knee';
  if (jointKey.includes('upperLeg')) return 'hip';
  if (jointKey.includes('lower')) return 'elbow';
  return 'shoulder';
}

// ── 步态状态枚举 ──
export const GaitState = Object.freeze({
  A: 'A',  // 仅左脚压力
  B: 'B',  // 仅右脚压力
  C: 'C',  // 双脚压力
  D: 'D',  // 无压力
});

// ── 控制源优先级 ──
export const ControlPriority = Object.freeze({
  SENSOR: 3,
  WALK:   2,
  MANUAL: 1,
  IDLE:   0,
});
