// ═══════════════════════════════════════════════════════════
// HumanPose — 人体姿态语义层
//
// 所有关节角度使用标准化人体运动学术语:
//   flexion   - 屈/伸 (矢状面, 正=向前)
//   abduction - 外展/内收 (冠状面, 正=远离中线)
//   yaw       - 内旋/外旋 (绕骨轴)
//
// 这是系统中唯一的姿态数据载体.
// 传感器、走路模拟、手动控制都产生 HumanPose 实例.
// 骨骼驱动、分析、图表都消费 HumanPose 实例.
// ═══════════════════════════════════════════════════════════

import { JOINT_KEYS } from '../constants.js';

/** 单个关节的语义角度 */
function createJoint() {
  return { flexion: 0, abduction: 0, yaw: 0 };
}

export class HumanPose {
  constructor() {
    for (const key of JOINT_KEYS) {
      this[key] = createJoint();
    }
  }

  /** 深拷贝 */
  clone() {
    const p = new HumanPose();
    for (const key of JOINT_KEYS) {
      p[key].flexion   = this[key].flexion;
      p[key].abduction = this[key].abduction;
      p[key].yaw       = this[key].yaw;
    }
    return p;
  }

  /** 将所有角度归零 */
  zero() {
    for (const key of JOINT_KEYS) {
      this[key].flexion   = 0;
      this[key].abduction = 0;
      this[key].yaw       = 0;
    }
  }

  /** 从另一个 pose 复制 */
  copyFrom(other) {
    for (const key of JOINT_KEYS) {
      this[key].flexion   = other[key].flexion;
      this[key].abduction = other[key].abduction;
      this[key].yaw       = other[key].yaw;
    }
  }

  /**
   * 逐关节插值
   * @param {HumanPose} a
   * @param {HumanPose} b
   * @param {number} t - 插值因子 [0, 1]
   * @returns {HumanPose}
   */
  static lerp(a, b, t) {
    const r = new HumanPose();
    for (const key of JOINT_KEYS) {
      r[key].flexion   = a[key].flexion   + (b[key].flexion   - a[key].flexion)   * t;
      r[key].abduction = a[key].abduction + (b[key].abduction - a[key].abduction) * t;
      r[key].yaw       = a[key].yaw       + (b[key].yaw       - a[key].yaw)       * t;
    }
    return r;
  }

  // ── 便捷访问器 ──
  get leftShoulderFlexion()   { return this.left_upper.flexion; }
  get rightShoulderFlexion()  { return this.right_upper.flexion; }
  get leftShoulderAbduction() { return this.left_upper.abduction; }
  get rightShoulderAbduction(){ return this.right_upper.abduction; }
  get leftElbowFlexion()      { return this.left_lower.flexion; }
  get rightElbowFlexion()     { return this.right_lower.flexion; }
  get leftHipFlexion()        { return this.left_upperLeg.flexion; }
  get rightHipFlexion()       { return this.right_upperLeg.flexion; }
  get leftKneeFlexion()       { return this.left_lowerLeg.flexion; }
  get rightKneeFlexion()      { return this.right_lowerLeg.flexion; }
}
