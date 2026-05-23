// ═══════════════════════════════════════════════════════════
// PoseBuilder — 传感器数据 → HumanPose
//
// 传感器发送 {x: Roll_rad, y: Pitch_rad, z: Yaw_rad}
// 映射为人体语义: Roll→abduction, Pitch→flexion, Yaw→yaw
//
// 左右侧使用相同的语义映射 (符号处理交给 Rig 层)
// ═══════════════════════════════════════════════════════════

import { HumanPose } from './human-pose.js';
import { degToRad } from '../config.js';

/**
 * 将传感器 RPY 角度 (度) 转换为单侧关节的语义角度 (弧度)
 * @param {number[]} armAngles - [upperR, upperP, upperY, lowerR, lowerP, lowerY] 度
 * @param {number[]} legAngles - [upperR, upperP, upperY, lowerR, lowerP, lowerY] 度
 * @param {string} side - 'left' | 'right'
 * @returns {Object} 关节键 → {flexion, abduction, yaw} 弧度
 */
function buildSidePose(armAngles, legAngles, side) {
  const prefix = side;
  return {
    [`${prefix}_upper`]: {
      abduction: degToRad(armAngles[0]),   // Roll → abduction
      flexion:   degToRad(armAngles[1]),   // Pitch → flexion
      yaw:       degToRad(armAngles[2]),   // Yaw → yaw
    },
    [`${prefix}_lower`]: {
      abduction: degToRad(armAngles[3]),
      flexion:   degToRad(armAngles[4]),
      yaw:       degToRad(armAngles[5]),
    },
    [`${prefix}_upperLeg`]: {
      abduction: degToRad(legAngles[0]),
      flexion:   degToRad(legAngles[1]),
      yaw:       degToRad(legAngles[2]),
    },
    [`${prefix}_lowerLeg`]: {
      abduction: degToRad(legAngles[3]),
      flexion:   degToRad(legAngles[4]),
      yaw:       degToRad(legAngles[5]),
    },
  };
}

/**
 * 从 WebSocket 消息构建全姿态
 * @param {Object} msg - { source: 'LEFT'|'RIGHT', data: number[] }
 * @returns {{ side: string, joints: Object }}
 */
export function buildPoseFromMessage(msg) {
  const side = msg.source === 'RIGHT' ? 'right' : 'left';
  const armData = msg.data.slice(0, 6);
  const legData = msg.data.length >= 12 ? msg.data.slice(6, 12) : [0,0,0,0,0,0];
  return { side, joints: buildSidePose(armData, legData, side) };
}

/**
 * 将手动语义值 (度) 应用到 HumanPose 的指定关节
 * @param {HumanPose} pose
 * @param {string} jointKey
 * @param {string} axis - 'flexion'|'abduction'|'yaw'
 * @param {number} degrees
 */
export function applyManualAngle(pose, jointKey, axis, degrees) {
  if (pose[jointKey]) {
    pose[jointKey][axis] = degToRad(degrees);
  }
}

/**
 * 从语义角度构建 HumanPose (用于走路模拟等直接构造场景)
 * @param {Object} angles - { jointKey: {flexion, abduction, yaw} } 值均为度
 * @returns {HumanPose}
 */
export function buildPoseFromAngles(angles) {
  const pose = new HumanPose();
  for (const [key, vals] of Object.entries(angles)) {
    if (pose[key]) {
      pose[key].flexion   = degToRad(vals.flexion   || 0);
      pose[key].abduction = degToRad(vals.abduction || 0);
      pose[key].yaw       = degToRad(vals.yaw       || 0);
    }
  }
  return pose;
}
