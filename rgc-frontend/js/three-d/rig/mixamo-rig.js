// ═══════════════════════════════════════════════════════════
// MixamoRig — Mixamo 骨骼映射配置
//
// 这是所有"魔法取反"的唯一权威来源。
// 传感器数据 → HumanPose (flexion/abduction/yaw)
// HumanPose → 此表 → FBX 骨骼 Euler 角
// ═══════════════════════════════════════════════════════════

import { RigAdapter } from './rig-adapter.js';
import { CONFIG, degToRad } from '../config.js';

const ARM_DOWN = degToRad(CONFIG.skeleton.armDownApose);   // 80° → rad
const LEG_REST = degToRad(CONFIG.skeleton.legRestZ);        // 180° → rad

/**
 * 完整的 Mixamo 骨骼映射表
 *
 * 每条目语义:
 *   jointKey  - 关节标识符 (与 targetRotations / HumanPose 对应)
 *   boneName  - FBX 骨骼树中的节点名
 *   side      - 解剖学侧别
 *   restOffset - 初始姿态固定偏移 {x, y, z} (弧度)
 *   axes[]    - 每个语义字段映射到骨骼的哪个轴, 用什么符号
 *
 * 人体语义:
 *   flexion   - 屈/伸 (矢状面前后摆动, 正=向前)
 *   abduction - 外展/内收 (冠状面左右摆动, 正=远离身体中线)
 *   yaw       - 内旋/外旋 (绕骨纵轴扭转)
 *
 * Euler 顺序: XYZ (FBX 默认)
 *   X 旋转 = 绕骨骼局部 X 轴 (不同骨骼指向不同方向)
 *   Y 旋转 = 绕骨骼局部 Y 轴 (沿骨骼方向)
 *   Z 旋转 = 绕骨骼局部 Z 轴
 *
 * ⚠️ 修改此表即修改骨骼动作方向，不要动 updateJoints() 中的逻辑
 */
const BONE_MAP = [
  // ═══ 左上臂 ═══
  {
    jointKey: 'left_upper',
    boneName: 'mixamorigLeftArm',
    side: 'LEFT',
    restOffset: { x: ARM_DOWN, y: 0, z: 0 },
    axes: [
      { semantic: 'flexion',   axis: 'z', sign: +1 },  // 前后摆 → Z
      { semantic: 'abduction', axis: 'x', sign: -1 },  // 左右摆 → X (负=外展)
      { semantic: 'yaw',       axis: 'y', sign: -1 },  // 扭转 → Y (左手反号)
    ],
  },
  // ═══ 右上臂 ═══
  {
    jointKey: 'right_upper',
    boneName: 'mixamorigRightArm',
    side: 'RIGHT',
    restOffset: { x: ARM_DOWN, y: 0, z: 0 },
    axes: [
      { semantic: 'flexion',   axis: 'z', sign: -1 },  // 右手 flexion 符号翻转
      { semantic: 'abduction', axis: 'x', sign: -1 },
      { semantic: 'yaw',       axis: 'y', sign: +1 },  // 右手 yaw 符号翻转
    ],
  },
  // ═══ 左小臂 ═══
  {
    jointKey: 'left_lower',
    boneName: 'mixamorigLeftForeArm',
    side: 'LEFT',
    restOffset: { x: 0, y: 0, z: 0 },
    axes: [
      { semantic: 'flexion',   axis: 'z', sign: -1 },  // 肘屈伸 → Z
      { semantic: 'abduction', axis: 'x', sign: +1 },
      { semantic: 'yaw',       axis: 'y', sign: -1 },
    ],
  },
  // ═══ 右小臂 ═══
  {
    jointKey: 'right_lower',
    boneName: 'mixamorigRightForeArm',
    side: 'RIGHT',
    restOffset: { x: 0, y: 0, z: 0 },
    axes: [
      { semantic: 'flexion',   axis: 'z', sign: +1 },  // 右手肘屈 符号翻转
      { semantic: 'abduction', axis: 'x', sign: +1 },
      { semantic: 'yaw',       axis: 'y', sign: +1 },
    ],
  },
  // ═══ 左大腿 ═══
  {
    jointKey: 'left_upperLeg',
    boneName: 'mixamorigLeftUpLeg',
    side: 'LEFT',
    restOffset: { x: 0, y: 0, z: LEG_REST },
    axes: [
      { semantic: 'flexion',   axis: 'x', sign: -1 },  // 前后迈 → X
      { semantic: 'abduction', axis: 'z', sign: +1 },  // 外展 → Z (正=沿红箭)
      { semantic: 'yaw',       axis: 'y', sign: -1 },  // 内外旋 → Y
    ],
  },
  // ═══ 右大腿 ═══
  {
    jointKey: 'right_upperLeg',
    boneName: 'mixamorigRightUpLeg',
    side: 'RIGHT',
    restOffset: { x: 0, y: 0, z: LEG_REST },
    axes: [
      { semantic: 'flexion',   axis: 'x', sign: -1 },  // 腿 flexion 双侧同号
      { semantic: 'abduction', axis: 'z', sign: -1 },  // 外展 → Z (正=沿红箭)
      { semantic: 'yaw',       axis: 'y', sign: +1 },  // 内外旋 右反号
    ],
  },
  // ═══ 左小腿 ═══
  {
    jointKey: 'left_lowerLeg',
    boneName: 'mixamorigLeftLeg',
    side: 'LEFT',
    restOffset: { x: 0, y: 0, z: 0 },
    axes: [
      { semantic: 'flexion',   axis: 'x', sign: -1 },  // 膝屈伸 → X
      { semantic: 'abduction', axis: 'z', sign: -1 },
      { semantic: 'yaw',       axis: 'y', sign: -1 },
    ],
  },
  // ═══ 右小腿 ═══
  {
    jointKey: 'right_lowerLeg',
    boneName: 'mixamorigRightLeg',
    side: 'RIGHT',
    restOffset: { x: 0, y: 0, z: 0 },
    axes: [
      { semantic: 'flexion',   axis: 'x', sign: -1 },
      { semantic: 'abduction', axis: 'z', sign: +1 },
      { semantic: 'yaw',       axis: 'y', sign: +1 },
    ],
  },
];

export class MixamoRig extends RigAdapter {
  get name() { return 'Mixamo'; }
  get rotationOrder() { return 'XYZ'; }
  get boneMap() { return BONE_MAP; }
}

/** 单例 */
export const mixamoRig = new MixamoRig();
