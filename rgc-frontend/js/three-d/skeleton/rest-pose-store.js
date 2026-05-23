// ═══════════════════════════════════════════════════════════
// RestPoseStore — 保存 FBX 模型的原始静息姿态四元数
//
// 关键: 只保存每个骨骼名的第一个四元数 (排除 FBX 重复节点)
// ═══════════════════════════════════════════════════════════

/**
 * 从已加载的模型中保存静息姿态四元数
 * @param {THREE.Object3D} model
 * @param {string[]} boneNames
 * @returns {Map<string, THREE.Quaternion>}
 */
export function captureRestPose(model, boneNames) {
  const store = new Map();
  model.updateMatrixWorld();
  model.traverse(child => {
    if (child.isBone && boneNames.includes(child.name) && !store.has(child.name)) {
      store.set(child.name, child.quaternion.clone());
    }
  });
  return store;
}

/**
 * 获取静息四元数
 * @param {Map<string, THREE.Quaternion>} store
 * @param {string} boneName
 * @returns {THREE.Quaternion|null}
 */
export function getRestQuat(store, boneName) {
  return store.get(boneName) || null;
}
