// ═══════════════════════════════════════════════════════════
// BoneCache — 模型加载时一次性缓存所有动画骨骼引用
//
// 替代每帧 model.traverse() 遍历数百节点找 8 个骨骼
// 查找 O(1) vs O(n)
// ═══════════════════════════════════════════════════════════

/**
 * 从 Three.js 模型中提取并缓存动画骨骼
 * @param {THREE.Object3D} model - 加载的 FBX 模型
 * @param {string[]} boneNames - 要缓存的骨骼名称列表
 * @returns {Map<string, THREE.Bone>}
 */
export function buildBoneCache(model, boneNames) {
  const cache = new Map();
  model.traverse(child => {
    if (child.isBone && boneNames.includes(child.name)) {
      // 只保存第一个匹配项 (避免 FBX 重复节点覆盖)
      if (!cache.has(child.name)) {
        cache.set(child.name, child);
      }
    }
  });
  return cache;
}

/**
 * 从缓存获取骨骼, 不存在返回 null
 * @param {Map<string, THREE.Bone>} cache
 * @param {string} name
 * @returns {THREE.Bone|null}
 */
export function getBone(cache, name) {
  return cache.get(name) || null;
}
