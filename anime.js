import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const settings = { round: 15, clay: false, ink: true, habitat: true };
const artworkPose = !new URLSearchParams(location.search).has('neutral');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe6ce');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);
const camera = new THREE.OrthographicCamera(-2.75, 2.75, 2.75, -2.75, 0.1, 150);
camera.position.set(6.2, 4.1, 12);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.73, 0);
controls.enableDamping = true;
controls.minZoom = 0.65;
controls.maxZoom = 2;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();
const duck = new THREE.Group();
duck.name = 'Psyduck sculpt';
scene.add(duck);

const clay = new THREE.MeshStandardMaterial({ color: '#c8b8a0', roughness: 0.88 });
const paperCanvas = document.createElement('canvas');
paperCanvas.width = paperCanvas.height = 512;
const paperContext = paperCanvas.getContext('2d');
const paperImage = paperContext.createImageData(512, 512);
let seed = 54;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
for (let i = 0; i < paperImage.data.length; i += 4) {
  paperImage.data[i] = paperImage.data[i + 1] = paperImage.data[i + 2] = 225 + random() * 30;
  paperImage.data[i + 3] = 255;
}
paperContext.putImageData(paperImage, 0, 0);
const paper = new THREE.CanvasTexture(paperCanvas);
paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
function illustrated(shadow, base, light, textureStrength = 0.04) {
  const material = new THREE.ShaderMaterial({
    lights: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
      shadeColor: { value: new THREE.Color(shadow) }, baseColor: { value: new THREE.Color(base) },
      lightColor: { value: new THREE.Color(light) }, grainMap: { value: paper }, grainStrength: { value: textureStrength },
      softShading: { value: 0 },
      sunDirection: { value: new THREE.Vector3(-3, 7, 5).normalize() },
    }]),
    vertexShader: `
      #include <common>
      #include <shadowmap_pars_vertex>
      varying vec3 worldN;
      varying vec3 worldP;
      void main() {
        vec3 transformed = position;
        vec3 transformedNormal = normalMatrix * normal;
        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        worldP = worldPosition.xyz;
        worldN = inverseTransformDirection(normalize(transformedNormal), viewMatrix);
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <shadowmap_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      varying vec3 worldN;
      varying vec3 worldP;
      uniform vec3 shadeColor;
      uniform vec3 baseColor;
      uniform vec3 lightColor;
      uniform vec3 sunDirection;
      uniform sampler2D grainMap;
      uniform float grainStrength;
      uniform float softShading;
      void main() {
        vec3 n = normalize(worldN);
        float ndl = dot(n, sunDirection);
        vec3 color = mix(shadeColor, baseColor, smoothstep(mix(0.04, -0.25, softShading), mix(0.23, 0.60, softShading), ndl));
        color = mix(color, lightColor, smoothstep(0.32, 1.0, ndl) * 0.78);
        // Cast shadows tint the designed bands instead of creating new jagged bands.
        color *= mix(vec3(0.94, 0.90, 0.83), vec3(1.0), getShadowMask());
        vec3 viewDirection = normalize(cameraPosition - worldP);
        float rim = pow(1.0 - max(0.0, dot(n, viewDirection)), 4.0) * smoothstep(-0.2, 0.7, dot(n, vec3(-0.7, 0.5, -0.4)));
        color = mix(color, lightColor, rim * 0.25);
        float grain = texture2D(grainMap, worldP.xy * 0.6 + worldP.z * 0.1).r;
        color *= 1.0 - grainStrength * (1.0 - grain);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  material.userData.exportColor = base;
  return material;
}
const skinMaterial = illustrated('#c4a067', '#e8c574', '#f8e6b4', 0.08);
skinMaterial.uniforms.softShading.value = 0.25;
const billMaterial = illustrated('#c7b699', '#efe4c3', '#fff7df', 0.03);
billMaterial.uniforms.softShading.value = 0.75;
const footMaterial = illustrated('#b8ad99', '#ded7c4', '#f5eed8', 0.025);
const eyeMaterial = illustrated('#e2d9ba', '#fffbea', '#fffef4', 0.01);
const inkMaterial = new THREE.MeshBasicMaterial({ color: '#3b302b' });
const creaseMaterial = new THREE.MeshBasicMaterial({ color: '#977345' });
const hairMaterial = illustrated('#292a32', '#43424a', '#66606a', 0.015);
const outlineMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { thickness: { value: 0.0105 }, color: { value: new THREE.Color('#584337') } },
  vertexShader: `
    uniform float thickness;
    void main() {
      vec3 n = normalize(normal);
      float weight = 0.62 + 0.68 * smoothstep(-0.35, 0.65, -n.y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position + n * thickness * weight, 1.0);
    }`,
  fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); #include <colorspace_fragment> }`.replace('#include', '\n#include').replace('> }', '>\n}'),
});

function addMesh(name, geometry, material, parent = duck) {
  const mesh = new THREE.Mesh(geometry, settings.clay && material !== inkMaterial ? clay : material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  if (settings.ink && parent === duck && !name.includes('eye') && material !== inkMaterial && material !== creaseMaterial) {
    const outline = new THREE.Mesh(geometry, outlineMaterial);
    outline.name = 'Outline';
    outline.userData.excludeExport = true;
    mesh.add(outline);
  }
  return mesh;
}

function ellipsoidDistance(x, y, z, cx, cy, cz, rx, ry, rz) {
  x = (x - cx) / rx; y = (y - cy) / ry; z = (z - cz) / rz;
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / rx, y / ry, z / rz);
  return k0 < 0.00001 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}

function union(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function sculpt(name, field, resolution = 100, center = [0, 2, 0], extent = 2.6) {
  const mc = new MarchingCubes(resolution, skinMaterial, false, false, 180000);
  mc.isolation = 0;
  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        mc.field[x + y * resolution + z * resolution * resolution] = -field((x / resolution * 2 - 1) * extent + center[0], (y / resolution * 2 - 1) * extent + center[1], (z / resolution * 2 - 1) * extent + center[2]);
      }
    }
  }
  mc.update();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mc.geometry.attributes.position.array.slice(0, mc.count * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mc.geometry.attributes.normal.array.slice(0, mc.count * 3), 3));
  geometry.scale(extent, extent, extent);
  geometry.translate(...center);
  geometry.normalizeNormals();
  mc.geometry.dispose();
  return addMesh(name, geometry, skinMaterial);
}

function headRadius(y) {
  return 1.00 * (1 + 0.035 * Math.exp(-(((y - 2.36) / 0.35) ** 2)));
}
function faceZ(x, y) {
  return 0.05 + 0.79 * Math.sqrt(Math.max(0.005, 1 - (x / headRadius(y)) ** 2 - ((y - 2.58) / 0.81) ** 2));
}
sculpt('Pear body and tail', (x, y, z) => {
  const width = 1.12 * (1 - (y - 1.2) * 0.07);
  const body = ellipsoidDistance(x, y, z, 0, 1.25, -0.045, width, 1.17, 0.88);
  const cheek = 0.10 * Math.exp(-(((y - 2.13) / 0.30) ** 2));
  const head = ellipsoidDistance(x, y, z, 0, 2.58, 0.05 + cheek, headRadius(y), 0.81, 0.79);
  let tail = capsule(x * 0.60, y, z, [0, 0.60, -0.90], [0, 1.25, -1.52], 0.26, 0.020);
  if (artworkPose) {
    tail = union(capsule(x, y, z, [-0.45, 0.65, -0.62], [-1.08, 0.68, -0.12], 0.28, 0.22), capsule(x, y, z, [-1.08, 0.68, -0.12], [-1.66, 1.00, 0.30], 0.22, 0.012), 0.10);
  }
  return union(union(body, head, 0.20), tail, 0.16);
}, 116);

function capsule(x, y, z, a, b, r0, r1) {
  const ax = x - a[0], ay = y - a[1], az = z - a[2];
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const t = THREE.MathUtils.clamp((ax * bx + ay * by + az * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(ax - bx * t, ay - by * t, az - bz * t) - THREE.MathUtils.lerp(r0, r1, t);
}
for (const side of [-1, 1]) {
  const lift = side < 0 ? 0.09 : 0;
  const tipX = side < 0 ? 0.75 : 0.82;
  const path = new THREE.CatmullRomCurve3([[0.80, 1.93, 0.12], [1.07, 2.18, 0.28], [1.08, 2.45, 0.34], [0.97, 2.75, 0.33], [tipX, 3.00, 0.27]].map(p => new THREE.Vector3(p[0], p[1] + lift, 0.34 + (p[2] - 0.34) / 0.48)));
  const joints = path.getSpacedPoints(22).map(p => p.toArray());
  const radii = joints.map((_, i) => {
    const t = i / 22;
    return (0.26 + 0.06 * Math.sin(Math.PI * t) - 0.155 * t) * 0.88;
  });
  sculpt(`Tapered flipper forelimb ${side}`, (x, y, z) => {
    x *= side;
    z = 0.34 + (z - 0.34) / 0.48;
    let distance = 10;
    for (let j = 0; j < joints.length - 1; j++) distance = union(distance, capsule(x, y, z, joints[j], joints[j + 1], radii[j], radii[j + 1]), 0.035);
    distance = union(distance, ellipsoidDistance(x, y, z, 1.115, 2.16 + lift, 0.465, 0.23, 0.38, 0.375), 0.15);
    for (let f = 0; f < 3; f++) {
      const xTip = tipX - 0.078 + f * 0.078;
      distance = union(distance, capsule(x, y, z, [xTip, 3.015 + lift, 0.235], [xTip - (artworkPose ? 0.030 : 0.013), 3.135 + lift - Math.abs(f - 1) * 0.010, 0.22], 0.029, 0.006), 0.012);
    }
    return distance;
  }, 152, [side * 0.95, 2.2, 0.35], 1.3);
}

function surface(name, fn, rows, columns, material, parent = duck, reverse = false) {
  const positions = [], uv = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= columns; j++) {
      positions.push(...fn(i / rows, j / columns));
      uv.push(j / columns, i / rows);
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j, b = a + columns + 1;
        if (reverse) indices.push(a, a + 1, b, b, a + 1, b + 1);
        else indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return addMesh(name, geometry, material, parent);
}
const power = (value, exponent) => Math.sign(value) * Math.abs(value) ** exponent;
// Front silhouette traced by proportion from official Sugimori / Global Link art.
const billOutline = new THREE.Shape();
billOutline.moveTo(0, 0.53);
billOutline.bezierCurveTo(0.13, 0.51, 0.20, 0.43, 0.38, 0.42);
billOutline.bezierCurveTo(0.49, 0.41, 0.56, 0.42, 0.55, 0.33);
billOutline.bezierCurveTo(0.52, 0.24, 0.51, 0.20, 0.56, 0.10);
billOutline.bezierCurveTo(0.61, -0.01, 0.71, -0.09, 0.72, -0.26);
billOutline.bezierCurveTo(0.73, -0.48, 0.43, -0.60, 0, -0.60);
billOutline.bezierCurveTo(-0.43, -0.60, -0.73, -0.48, -0.72, -0.26);
billOutline.bezierCurveTo(-0.71, -0.09, -0.61, -0.01, -0.56, 0.10);
billOutline.bezierCurveTo(-0.51, 0.20, -0.52, 0.24, -0.55, 0.33);
billOutline.bezierCurveTo(-0.56, 0.42, -0.49, 0.41, -0.38, 0.42);
billOutline.bezierCurveTo(-0.20, 0.43, -0.13, 0.51, 0, 0.53);
const billPoints = billOutline.getSpacedPoints(160);
function billPoint(u, v) {
  const phi = u * Math.PI;
  const index = Math.min(159, Math.floor(v * 160));
  const edge = billPoints[index].clone().lerp(billPoints[index + 1], v * 160 - index);
  const x = edge.x * Math.sin(phi);
  const rear = Math.max(0, -Math.cos(phi));
  const y = 2.33 + edge.y * Math.sin(phi) * 0.94 + 0.10 * rear * rear;
  const depth = THREE.MathUtils.smoothstep(2.83 - y, 0, 0.89);
  const c = Math.cos(phi);
  const ridge = 0.055 * Math.exp(-(x * x / 0.028) - ((y - 2.63) / 0.22) ** 2) * (0.5 + 0.5 * c);
  const z = 0.845 + depth * 0.55 + 0.38 * c - 0.17 * c * c + ridge;
  return [x, y, z];
}
const billMesh = surface('Broad hanging paddle bill', billPoint, 64, 160, billMaterial, duck, true);
if (!artworkPose) {
  const hinge = new THREE.Vector3(0, 2.77, 0.845);
  billMesh.geometry.translate(-hinge.x, -hinge.y, -hinge.z);
  billMesh.geometry.rotateX(-0.28);
  billMesh.geometry.translate(hinge.x, hinge.y, hinge.z);
}
billMesh.updateMatrixWorld(true);

function stroke(name, points, radius, material = creaseMaterial, parent = duck) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return addMesh(name, new THREE.TubeGeometry(curve, Math.max(16, points.length * 5), radius, 8, false), material, parent);
}
function smallOval(name, center, scale, material, parent = duck) {
  const mesh = addMesh(name, new THREE.SphereGeometry(1, 48, 32), material, parent);
  mesh.position.set(...center);
  mesh.scale.set(...scale);
  return mesh;
}
const jaw = [];
for (let i = 0; i <= 48; i++) {
  const x = -0.93 + i / 48 * 1.86;
  const y = 2.12 + 0.10 * (x / 0.93) ** 2;
  const cheek = 0.10 * Math.exp(-(((y - 2.13) / 0.30) ** 2));
  const z = faceZ(x, y) + cheek + 0.005;
  jaw.push([x, y, z]);
}
stroke('Lower head contour', jaw, 0.0055, inkMaterial);
for (const side of [-1, 1]) {
  const cx = side * 0.40, cy = 2.94;
  surface(`Conforming eye ${side}`, (u, v) => {
    const radius = u, theta = v * Math.PI * 2;
    const x = cx + 0.285 * radius * Math.cos(theta);
    const y = cy + 0.200 * radius * Math.sin(theta);
    return [x, y, faceZ(x, y) + 0.017 + 0.018 * (1 - radius * radius)];
  }, 20, 80, eyeMaterial);
  smallOval('Pupil', [cx + side * 0.005, cy - 0.008, faceZ(cx, cy) + 0.054], [0.017, 0.019, 0.012], inkMaterial);
  const upperLid = [];
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI * 2 * i / 18;
    const x = cx + Math.cos(a) * 0.287, y = cy + Math.sin(a) * 0.202;
    upperLid.push([x, y, faceZ(x, y) + 0.018]);
  }
  stroke('Eye contour', upperLid, 0.0055, inkMaterial);
  const nostrilPoints = [];
  const slit = side < 0 ? [[-0.125, 2.72], [-0.127, 2.69], [-0.129, 2.66]] : [[0.12, 2.71], [0.15, 2.685], [0.175, 2.66]];
  for (const [x, y] of slit) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(billMesh, false)[0];
    if (!hit) throw new Error('Nostril does not intersect bill');
    nostrilPoints.push([x, y, hit.point.z + 0.002]);
  }
  stroke('Nostril slit', nostrilPoints, 0.006, creaseMaterial);
}

const footOutline = new THREE.Shape();
footOutline.moveTo(-0.16, -0.28);
footOutline.bezierCurveTo(-0.24, -0.12, -0.34, 0.28, -0.44, 0.56);
footOutline.quadraticCurveTo(-0.46, 0.63, -0.39, 0.59);
footOutline.lineTo(-0.16, 0.50);
footOutline.lineTo(-0.015, 0.73);
footOutline.quadraticCurveTo(0.015, 0.78, 0.047, 0.72);
footOutline.lineTo(0.19, 0.50);
footOutline.lineTo(0.40, 0.62);
footOutline.quadraticCurveTo(0.46, 0.66, 0.43, 0.57);
footOutline.bezierCurveTo(0.35, 0.25, 0.22, -0.20, 0.14, -0.29);
footOutline.quadraticCurveTo(0, -0.36, -0.16, -0.28);
const footPoints = footOutline.getSpacedPoints(100);
for (const side of [-1, 1]) {
  const foot = surface(`Domed webbed foot ${side}`, (u, v) => {
    const phi = u * Math.PI;
    const index = Math.min(99, Math.floor(v * 100));
    const t = v * 100 - index;
    const edge = footPoints[index].clone().lerp(footPoints[index + 1], t);
    const x = edge.x * Math.sin(phi), z = 0.08 + (edge.y - 0.08) * Math.sin(phi);
    return [x, Math.max(0.072, 0.118 + 0.087 * Math.cos(phi)), z];
  }, 32, 100, footMaterial);
  foot.position.set(side * 0.47, 0, 0.16);
  foot.rotation.y = side * 0.18;
  if (artworkPose && side > 0) {
    foot.position.set(1.03, 0.47, 0.46);
    foot.rotation.set(-1.20, 0.30, -0.40);
    stroke('Raised ankle', [[0.77, 0.50, 0.10], [0.94, 0.38, 0.19], [1.00, 0.30, 0.24]], 0.105, skinMaterial);
  }
  const foldMaterial = new THREE.MeshBasicMaterial({ color: '#b8a178', transparent: true, opacity: 0.5 });
  for (const direction of [-1, 1]) {
    const fold = stroke('Web fold', [[direction * 0.04, 0.202, 0.04], [direction * 0.085, 0.182, 0.27], [direction * 0.16, 0.15, 0.49]], 0.0035, foldMaterial);
    fold.position.copy(foot.position);
    fold.rotation.copy(foot.rotation);
    // Fine crease strokes do not need an inverted-hull outline.
    for (const child of [...fold.children]) child.removeFromParent();
  }
}

for (let h = -1; h <= 1; h++) {
  const tips = [[-0.18, 3.76, -0.15], [0.09, 3.88, -0.05], [0.43, 3.63, 0.10]];
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(h * 0.035, 3.34, -0.01),
    new THREE.Vector3(...tips[h + 1]).lerp(new THREE.Vector3(0, 3.34, -0.01), 0.45),
    new THREE.Vector3(...tips[h + 1]),
  ]);
  const frames = curve.computeFrenetFrames(36, false);
  surface(`Tapered hair ${h}`, (u, v) => {
    const p = curve.getPointAt(u), i = Math.min(36, Math.round(u * 36));
    const radius = (0.055 + 0.016 * Math.sin(Math.PI * u)) * (u > 0.90 ? Math.sqrt(Math.max(0, 1 - ((u - 0.90) / 0.10) ** 2)) : 1);
    p.addScaledVector(frames.normals[i], Math.cos(v * Math.PI * 2) * radius);
    p.addScaledVector(frames.binormals[i], Math.sin(v * Math.PI * 2) * radius * 0.72);
    return p.toArray();
  }, 36, 16, hairMaterial, duck, true);
}

// Compress the torso while translating (not squashing) the face above it.
for (const mesh of duck.children) {
  if (!mesh.isMesh) continue;
  mesh.updateMatrix();
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const n = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const t = THREE.MathUtils.clamp((y - 0.07) / 2.23, 0, 1);
    positions.setY(i, y - 0.12 * t * t * (3 - 2 * t));
    const derivative = 1 - 0.12 * 6 * t * (1 - t) / 2.23;
    n.fromBufferAttribute(normals, i);
    n.y /= derivative;
    n.normalize();
    normals.setXYZ(i, n.x, n.y, n.z);
  }
  geometry.computeBoundingSphere();
  mesh.geometry = geometry;
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  for (const child of mesh.children) if (child.name === 'Outline') child.geometry = geometry;
}
duck.scale.y = 0.90;
duck.position.y = 0.0072;
if (artworkPose) {
  duck.rotation.z = 0.055;
  duck.updateMatrixWorld(true);
  const support = duck.children.find(mesh => mesh.name === 'Domed webbed foot -1');
  duck.position.y += 0.072 - new THREE.Box3().setFromObject(support).min.y;
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.ShaderMaterial({
  uniforms: { foreground: { value: new THREE.Color('#91bdb4') }, background: { value: new THREE.Color('#dfe6ce') }, grainMap: { value: paper } },
  vertexShader: `varying vec3 p; void main() { p = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    varying vec3 p;
    uniform vec3 foreground;
    uniform vec3 background;
    uniform sampler2D grainMap;
    void main() {
      vec3 color = mix(foreground, background, smoothstep(-1.0, 12.0, -p.z));
      float lightWash = exp(-pow((p.x + 2.0) / 5.0, 2.0) - pow((p.z + 5.0) / 7.0, 2.0));
      color = mix(color, background, lightWash * 0.13);
      color *= 0.985 + texture2D(grainMap, p.xz * 0.2).r * 0.015;
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }`,
}));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.055;
scene.add(floor);
const waterShadow = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ color: '#467f77', opacity: 0.16 }));
waterShadow.rotation.x = -Math.PI / 2;
waterShadow.position.y = -0.052;
waterShadow.receiveShadow = true;
scene.add(waterShadow);

if (settings.habitat) {
  const stoneMaterial = illustrated('#899e95', '#b7c6af', '#d5d9bb');
  surface('Low shore stone', (u, v) => {
    const phi = u * Math.PI, theta = v * Math.PI * 2;
    const radius = Math.sin(phi) * (1 + 0.035 * Math.sin(theta * 5) + 0.018 * Math.cos(theta * 9));
    return [1.37 * radius * Math.cos(theta), 0.012 + 0.055 * power(Math.cos(phi), 0.22), 1.04 * radius * Math.sin(theta)];
  }, 40, 120, stoneMaterial, scene, true);
  const green = illustrated('#467c67', '#77a37c', '#bfd1a0', 0.025);
  const darkGreen = illustrated('#427965', '#679980', '#a4c49c', 0.02);
  const veinMaterial = new THREE.MeshBasicMaterial({ color: '#67947a', transparent: true, opacity: 0.6 });
  const waterLine = new THREE.MeshBasicMaterial({ color: '#dce9d4', transparent: true, opacity: 0.60, depthWrite: false });
  const waterDarkLine = new THREE.MeshBasicMaterial({ color: '#71a89f', transparent: true, opacity: 0.35, depthWrite: false });
  function ripple(cx, cz, rx, rz, start, end, material = waterLine) {
    const points = [];
    for (let i = 0; i <= 64; i++) {
      const a = THREE.MathUtils.lerp(start, end, i / 64);
      points.push([cx + Math.cos(a) * rx, -0.045, cz + Math.sin(a) * rz]);
    }
    const mesh = stroke('Water arc', points, 0.007, material, scene);
    mesh.castShadow = mesh.receiveShadow = false;
  }
  ripple(0, 0, 1.58, 1.24, 0.12, 2.8);
  ripple(0, 0, 1.74, 1.38, 3.35, 5.9, waterDarkLine);
  ripple(0, 0, 1.94, 1.49, 0.25, 1.85);
  for (const [cx, cz, radius, angle] of [[-1.80, 1.02, 0.42, 0.35], [1.75, 0.8, 0.33, -0.7], [2.10, 1.70, 0.45, 0.1]]) {
    surface('Lily pad', (u, v) => {
      const a = 0.19 + v * (Math.PI * 2 - 0.38) + angle;
      return [cx + Math.cos(a) * radius * u, -0.024 + 0.018 * (1 - u * u), cz + Math.sin(a) * radius * 0.83 * u];
    }, 12, 72, green, scene, true);
    for (let j = 0; j < 5; j++) {
      const a = angle + 0.5 + j * 1.1;
      stroke('Lily vein', [[cx, -0.004, cz], [cx + Math.cos(a) * radius * 0.45, -0.007, cz + Math.sin(a) * radius * 0.37], [cx + Math.cos(a) * radius * 0.88, -0.017, cz + Math.sin(a) * radius * 0.73]], 0.003, veinMaterial, scene);
    }
    ripple(cx, cz, radius * 1.18, radius * 1.0, 0.5, 2.7);
  }
  function leaf(base, tip, width, material) {
    const direction = new THREE.Vector3(tip[0] - base[0], 0, tip[2] - base[2]).normalize();
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);
    const mesh = surface('Curved aquatic leaf', (u, v) => {
      const s = v * 2 - 1;
      const p = new THREE.Vector3(...base).lerp(new THREE.Vector3(...tip), u);
      p.addScaledVector(perpendicular, Math.sin(Math.PI * u) ** 0.85 * width * s);
      p.y += Math.sin(Math.PI * u) * (0.13 - s * s * 0.10);
      return p.toArray();
    }, 24, 10, material, scene, true);
    mesh.material.side = THREE.DoubleSide;
    mesh.castShadow = false;
    return mesh;
  }
  for (let j = 0; j < 9; j++) {
    const bx = -1.83 + random() * 0.36, bz = -0.55 + random() * 0.35;
    const tx = bx - 0.30 + random() * 0.90, tz = bz - 0.5 + random();
    leaf([bx, -0.03, bz], [tx, 0.65 + random() * 0.93, tz], 0.10 + random() * 0.07, j % 2 ? green : darkGreen);
  }
  for (let j = 0; j < 6; j++) {
    leaf([1.77 + random() * 0.3, -0.03, -0.65], [1.45 + random() * 0.9, 0.40 + random() * 0.7, -1 + random() * 0.8], 0.10 + random() * 0.07, green);
  }
  for (const [x, z, size] of [[-1.23, 0.50, 0.21], [1.19, -0.32, 0.18], [-1.40, -0.4, 0.16]]) {
    smallOval('Shore pebble', [x, -0.012, z], [size, size * 0.28, size * 0.65], stoneMaterial, scene);
  }
  const mossMaterial = illustrated('#759477', '#98b08a', '#b8cba1');
  for (let j = 0; j < 12; j++) {
    const a = 0.4 + j * 0.47;
    smallOval('Edge moss', [Math.cos(a) * 1.28, 0.037, Math.sin(a) * 0.98], [0.10 + random() * 0.08, 0.012, 0.07], mossMaterial, scene);
  }
  const reedMaterial = illustrated('#718c63', '#9ba977', '#c1c593');
  const cattailMaterial = illustrated('#8d7b58', '#b5a078', '#cfc197');
  for (const [x, z, height] of [[-1.86, -0.78, 1.6], [-1.64, -0.90, 1.42]]) {
    stroke('Reed stem', [[x, -0.03, z], [x - 0.10, height * 0.5, z], [x - 0.19, height, z + 0.05]], 0.012, reedMaterial, scene);
    const ear = smallOval('Cattail', [x - 0.19, height + 0.11, z + 0.05], [0.035, 0.145, 0.035], cattailMaterial, scene);
    ear.rotation.z = 0.10;
  }
}
scene.add(new THREE.HemisphereLight('#fff5df', '#8b8e93', 1.1));
const key = new THREE.DirectionalLight('#fff5df', 2.4);
key.position.set(-3, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -3, near: 0.1, far: 20 });
key.shadow.normalBias = 0.018;
key.shadow.bias = -0.0001;
scene.add(key);
const fill = new THREE.DirectionalLight('#e1edff', 0.6);
fill.position.set(4, 3, -2);
scene.add(fill);

let dirty = true;
function resize() {
  const aspect = innerWidth / innerHeight;
  const height = aspect < 0.8 ? 5.1 / aspect * 0.72 : 5.1;
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  dirty = true;
}
controls.addEventListener('change', () => { dirty = true; });
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  if (!dirty) return;
  renderer.render(scene, camera);
  dirty = false;
  window.renderReady = true;
});
window.setView = name => {
  const positions = { front: [0, 3.6, 12], side: [12, 3.6, 0], back: [-4, 3.6, -12], hero: [6.2, 4.1, 12], reference: [6.2, 4.1, 12], ortho_front: [0, 4.94, 12], ortho_side: [-12, 2.35, 0], ortho_back: [0, 2.35, -12] };
  camera.position.set(...positions[name]);
  controls.update();
  dirty = true;
};
window.setInspection = enabled => {
  for (const object of scene.children) {
    if (object !== duck && !object.isLight) object.visible = !enabled;
  }
  scene.background.set(enabled ? '#ffffff' : '#dfe6ce');
  dirty = true;
};
window.exportModel = async () => {
  const exportDuck = duck.clone(true);
  exportDuck.updateMatrixWorld(true);
  const excluded = [];
  exportDuck.traverse(mesh => {
    if (mesh.userData.excludeExport) excluded.push(mesh);
    if (mesh.material?.userData.exportColor) {
      mesh.material = new THREE.MeshStandardMaterial({ color: mesh.material.userData.exportColor, map: paper, roughness: 0.9 });
      mesh.geometry = mesh.geometry.clone();
      const positions = mesh.geometry.attributes.position;
      const uv = new Float32Array(positions.count * 2);
      const p = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        uv[i * 2] = p.x * 0.6 + p.z * 0.1;
        uv[i * 2 + 1] = p.y * 0.6 + p.z * 0.1;
      }
      mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
  });
  excluded.forEach(mesh => mesh.removeFromParent());
  const buffer = await new GLTFExporter().parseAsync(exportDuck, { binary: true });
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'psyduck_anime.glb';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
window.sceneStats = () => ({ round: settings.round, meshes: renderer.info.render.calls, triangles: renderer.info.render.triangles, camera: camera.position.toArray(), zoom: camera.zoom });
window.validateExport = async (path = '/psyduck_anime.glb') => {
  const asset = await new GLTFLoader().loadAsync(path);
  let meshes = 0, texturedMeshes = 0;
  asset.scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    if (object.material.map) texturedMeshes++;
    const values = object.geometry.attributes.position.array;
    if (!values.every(Number.isFinite)) throw new Error('Non-finite exported geometry');
  });
  const size = new THREE.Box3().setFromObject(asset.scene).getSize(new THREE.Vector3()).toArray();
  return { meshes, texturedMeshes, size };
};
