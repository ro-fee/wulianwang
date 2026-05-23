// ═══════════════════════════════════════════════════════════
// SkeletonDriver — 将 HumanPose 应用到 Three.js 骨骼
//
// 使用 Quaternion 合成: bone.quat = restQuat * deltaQuat
// 避免 Euler 直接覆盖导致的万向节锁和 rest pose 丢失
// ═══════════════════════════════════════════════════════════

import { getBone } from './bone-cache.js';
import { getRestQuat } from './rest-pose-store.js';

/**
 * 为单个轴构建旋转四元数
 * @param {string} axis - 'x'|'y'|'z'
 * @param {number} angle - 弧度
 * @returns {THREE.Quaternion}
 */
function quatForAxis(axis, angle, THREE) {
  const q = new THREE.Quaternion();
  const half = angle / 2;
  const s = Math.sin(half);
  const c = Math.cos(half);
  switch (axis) {
    case 'x': return q.set(s, 0, 0, c);
    case 'y': return q.set(0, s, 0, c);
    case 'z': return q.set(0, 0, s, c);
    default:  return q.set(0, 0, 0, 1);
  }
}

/**
 * 从语义角度 + Rig 映射构建骨骼变更四元数 (不包含 rest pose)
 * @param {Object} semanticAngles - {flexion, abduction, yaw} 弧度
 * @param {import('../rig/rig-adapter.js').BoneEntry} entry
 * @param {THREE} THREE
 * @returns {THREE.Quaternion}
 */
function buildDeltaQuat(semanticAngles, entry, THREE) {
  const delta = new THREE.Quaternion();
  for (const ax of entry.axes) {
    const angle = semanticAngles[ax.semantic] || 0;
    if (Math.abs(angle) < 1e-6) continue;
    const q = quatForAxis(ax.axis, angle * ax.sign, THREE);
    delta.multiply(q);  // 按 axes 声明顺序依次旋转
  }
  return delta;
}

/**
 * 从 rig 条目的 restOffset 构建静息偏移四元数
 */
function buildRestOffsetQuat(entry, THREE) {
  const euler = new THREE.Euler(
    entry.restOffset.x,
    entry.restOffset.y,
    entry.restOffset.z,
    'XYZ'
  );
  return new THREE.Quaternion().setFromEuler(euler);
}

/**
 * 应用 HumanPose 到所有动画骨骼
 * @param {Object} pose - HumanPose 实例 (关节键 → {flexion, abduction, yaw})
 * @param {import('../rig/rig-adapter.js').RigAdapter} rig
 * @param {Map<string, THREE.Bone>} boneCache
 * @param {Map<string, THREE.Quaternion>} restStore
 * @param {THREE} THREE
 * @returns {{ joint: string, euler: THREE.Euler }[]} 各骨骼的最终 Euler 角 (用于分析)
 */
export function applyPoseToSkeleton(pose, rig, boneCache, restStore, THREE) {
  const results = [];

  for (const entry of rig.boneMap) {
    const bone = getBone(boneCache, entry.boneName);
    if (!bone) continue;

    const semanticAngles = pose[entry.jointKey];
    if (!semanticAngles) continue;

    // 构建增量四元数 (传感器角度)
    const deltaQuat = buildDeltaQuat(semanticAngles, entry, THREE);

    // 构建静息偏移 (A-pose / leg rest)
    const restOffsetQuat = buildRestOffsetQuat(entry, THREE);

    // 应用: 先静息偏移, 再传感器增量
    bone.quaternion.copy(restOffsetQuat).multiply(deltaQuat);

    // 记录最终 Euler 角供分析用
    const finalEuler = new THREE.Euler().setFromQuaternion(bone.quaternion, rig.rotationOrder);
    results.push({ joint: entry.jointKey, euler: finalEuler });
  }

  return results;
}
