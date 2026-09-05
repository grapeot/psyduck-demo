// Functions are self-contained so Playwright can serialize them into the
// production page; samples are chosen by actual weights, never fake meshes.
export function sampleFlipperVertices(root = window.psyduck.rig) {
  return ['left', 'right'].map(side => {
    let sample, farthest = -Infinity;
    root.traverse(mesh => {
      if (!mesh.isSkinnedMesh || mesh.userData.outline) return;
      const arm = mesh.skeleton.bones.findIndex(b => b.name === `${side}Arm`), elbow = mesh.skeleton.bones.findIndex(b => b.name === `${side}Elbow`);
      if (arm < 0 || elbow < 0) return;
      const origin = mesh.skeleton.boneInverses[arm].clone().invert().elements;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        let w = 0;
        for (let slot = 0; slot < 4; slot++) if (skinIndex.array[i * 4 + slot] === elbow) w += skinWeight.array[i * 4 + slot];
        if (w < 0.9) continue;
        const distance = (position.getX(i) - origin[12]) ** 2 + (position.getY(i) - origin[13]) ** 2 + (position.getZ(i) - origin[14]) ** 2;
        if (distance > farthest) { farthest = distance; sample = { mesh, i }; }
      }
    });
    if (!sample) throw new Error(`Missing actual distal skin for ${side}`);
    const { mesh, i } = sample, vertex = mesh.position.clone().fromBufferAttribute(mesh.geometry.attributes.position, i);
    mesh.applyBoneTransform(i, vertex); return vertex.toArray();
  });
}

export function inspectConnectedSkin(root = window.psyduck.rig) {
  const mesh = root.getObjectByName('PsyduckSurface');
  if (!mesh?.isSkinnedMesh || !mesh.geometry.index) throw new Error('Body and both flippers must share an indexed SkinnedMesh');
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes, index = mesh.geometry.index.array;
  const parent = Array.from({ length: position.count }, (_, i) => i), used = new Set(), edges = new Map();
  const find = a => { while (a !== parent[a]) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < index.length; i += 3) {
    const triangle = [index[i], index[i + 1], index[i + 2]];
    if (new Set(triangle).size !== 3) throw new Error('Degenerate welded triangle');
    for (let j = 0; j < 3; j++) {
      const a = triangle[j], b = triangle[(j + 1) % 3]; used.add(a); parent[find(a)] = find(b);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`; edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  const components = new Set([...used].map(find)).size;
  const boundaryEdges = [...edges.values()].filter(n => n === 1).length, nonmanifoldEdges = [...edges.values()].filter(n => n > 2).length;
  const joints = mesh.skeleton.bones.map(b => b.name), mixed = { left: 0, right: 0 }, headArmMixed = { left: 0, right: 0 };
  const sidePresent = { left: false, right: false };
  for (let i = 0; i < position.count; i++) {
    const w = {};
    for (let j = 0; j < 4; j++) { const name = joints[skinIndex.array[i * 4 + j]]; w[name] = (w[name] || 0) + skinWeight.array[i * 4 + j]; }
    for (const side of ['left', 'right']) {
      if (w[`${side}Elbow`] > 0.9) sidePresent[side] = true;
      if (w.torso > 0.05 && w[`${side}Arm`] > 0.05) mixed[side]++;
      if (w.head > 0.01 && w[`${side}Arm`] > 0.01) headArmMixed[side]++;
    }
  }
  if (components !== 1 || boundaryEdges || nonmanifoldEdges || used.size !== position.count) throw new Error(`Not one closed welded shell: ${JSON.stringify({ components, boundaryEdges, nonmanifoldEdges, unused: position.count - used.size })}`);
  if (!sidePresent.left || !sidePresent.right || mixed.left < 50 || mixed.right < 50 || !headArmMixed.left || !headArmMixed.right) throw new Error('Missing broad torso/head/arm skin transition');
  const separate = [];
  root.traverse(o => { if (o.isSkinnedMesh && !o.userData.outline && /Flipper/.test(o.name)) separate.push(o.name); });
  if (separate.length) throw new Error('Separate flipper surfaces retained');
  return { components, boundaryEdges, nonmanifoldEdges, vertices: position.count, triangles: index.length / 3, edges: edges.size, eulerCharacteristic: used.size - edges.size + index.length / 3, mixed, headArmMixed };
}

export function inspectShoulderSections(root = window.psyduck.rig) {
  const mesh = root.getObjectByName('PsyduckSurface'), g = mesh.geometry;
  root.updateMatrixWorld(true); mesh.skeleton.update();
  const p = g.attributes.position, index = g.index.array, joints = mesh.skeleton.bones.map(b => b.name);
  const deformed = [], vertex = mesh.position.clone();
  for (let i = 0; i < p.count; i++) { vertex.fromBufferAttribute(p, i); mesh.applyBoneTransform(i, vertex); deformed.push(vertex.toArray()); }
  const report = {};
  for (const side of ['left', 'right']) {
    const weight = Array.from({ length: p.count }, (_, i) => {
      let w = 0;
      for (let j = 0; j < 4; j++) if ([`${side}Arm`, `${side}Elbow`].includes(joints[g.attributes.skinIndex.array[i * 4 + j]])) w += g.attributes.skinWeight.array[i * 4 + j];
      return w;
    });
    const nodes = new Map(), links = new Map(), areaVector = [0, 0, 0]; let maxEdge = 0, maxStretch = 0;
    for (let i = 0; i < index.length; i += 3) {
      let enter, exit;
      for (let j = 0; j < 3; j++) {
        const a = index[i + j], b = index[i + (j + 1) % 3];
        if ((weight[a] > 0.05 && weight[a] < 0.95) || (weight[b] > 0.05 && weight[b] < 0.95)) {
          const length = Math.hypot(...deformed[a].map((v, k) => v - deformed[b][k]));
          const rest = Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b));
          maxEdge = Math.max(maxEdge, length); if (rest > 1e-5) maxStretch = Math.max(maxStretch, length / rest);
        }
        if ((weight[a] > 0.5) === (weight[b] > 0.5)) continue;
        const t = (0.5 - weight[a]) / (weight[b] - weight[a]);
        const point = deformed[a].map((v, k) => v + (deformed[b][k] - v) * t), key = a < b ? `${a}:${b}` : `${b}:${a}`;
        nodes.set(key, point);
        if (weight[a] > 0.5) exit = key; else enter = key;
      }
      if (enter && exit) {
        const a = nodes.get(exit), b = nodes.get(enter);
        areaVector[0] += a[1] * b[2] - a[2] * b[1]; areaVector[1] += a[2] * b[0] - a[0] * b[2]; areaVector[2] += a[0] * b[1] - a[1] * b[0];
        for (const [a, b] of [[enter, exit], [exit, enter]]) { if (!links.has(a)) links.set(a, []); links.get(a).push(b); }
      }
    }
    let loops = 0; const seen = new Set();
    for (const key of nodes.keys()) if (!seen.has(key)) {
      loops++; const stack = [key];
      while (stack.length) { const current = stack.pop(); if (seen.has(current)) continue; seen.add(current); stack.push(...(links.get(current) || [])); }
    }
    const points = [...nodes.values()], center = [0, 1, 2].map(k => points.reduce((s, p) => s + p[k], 0) / points.length);
    const minRadius = Math.min(...points.map(p => Math.hypot(...p.map((v, k) => v - center[k]))));
    const area = Math.hypot(...areaVector) / 2;
    const closed = [...links.values()].every(a => a.length === 2);
    report[side] = { loops, closed, crossingEdges: nodes.size, area, minRadius, maxEdge, maxStretch };
    if (!Number.isFinite(area) || !closed || loops !== 1) throw new Error(`Invalid shoulder section ${side}: ${JSON.stringify(report[side])}`);
  }
  return report;
}
