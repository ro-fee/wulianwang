// ═══════════════════════════════════════════════════════════
// RigAdapter — 抽象接口
// 定义人体骨骼 Rig 必须实现的方法
// ═══════════════════════════════════════════════════════════

/**
 * 骨骼映射条目
 * @typedef {Object} BoneEntry
 * @property {string}   jointKey   - 关节键 (如 'left_upper')
 * @property {string}   boneName   - FBX 骨骼名 (如 'mixamorigLeftArm')
 * @property {string}   side       - 'LEFT' | 'RIGHT'
 * @property {{x:number, y:number, z:number}} restOffset - 初始姿态偏移(弧度)
 * @property {AxisMapping[]} axes  - 语义→骨骼轴映射
 */

/**
 * 语义→骨骼轴映射
 * @typedef {Object} AxisMapping
 * @property {string} semantic - 'flexion' | 'abduction' | 'yaw'
 * @property {string} axis     - 'x' | 'y' | 'z'
 * @property {number} sign     - +1 或 -1
 */

export class RigAdapter {
  /** @returns {string} rig 名称 */
  get name() { throw new Error('Not implemented'); }

  /** @returns {string} Euler 旋转顺序 (如 'XYZ') */
  get rotationOrder() { throw new Error('Not implemented'); }

  /** @returns {BoneEntry[]} 所有动画骨骼的映射配置 */
  get boneMap() { throw new Error('Not implemented'); }

  /** @returns {string[]} 所有骨骼名称 */
  get boneNames() { return this.boneMap.map(e => e.boneName); }

  /** @returns {string[]} 所有关节键 */
  get jointKeys() { return this.boneMap.map(e => e.jointKey); }

  /**
   * 根据关节键查找映射条目
   * @param {string} jointKey
   * @returns {BoneEntry|undefined}
   */
  findJoint(jointKey) {
    return this.boneMap.find(e => e.jointKey === jointKey);
  }

  /**
   * 根据骨骼名查找映射条目
   * @param {string} boneName
   * @returns {BoneEntry|undefined}
   */
  findBone(boneName) {
    return this.boneMap.find(e => e.boneName === boneName);
  }

  /**
   * 将 HumanPose 的语义角度转换为骨骼 Euler 分量
   * @param {Object} semanticAngles - {flexion, abduction, yaw} (弧度)
   * @param {BoneEntry} entry
   * @returns {{x:number, y:number, z:number}} 骨骼 Euler 角 (弧度)
   */
  poseToBoneEuler(semanticAngles, entry) {
    const euler = { x: 0, y: 0, z: 0 };
    for (const ax of entry.axes) {
      const val = semanticAngles[ax.semantic] || 0;
      euler[ax.axis] += val * ax.sign;
    }
    // 加上初始姿态偏移
    euler.x += entry.restOffset.x;
    euler.y += entry.restOffset.y;
    euler.z += entry.restOffset.z;
    return euler;
  }
}
