import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#52615c');
scene.fog = new THREE.Fog('#52615c', 10, 24);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
scene.environmentIntensity = 0.48;
room.dispose();
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 60);
camera.position.set(4.0, 3.8, 10.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.02, 0);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

let seed = 54;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

function texturedMaterial(base, roughness, bumpScale) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const color = new THREE.Color(base);
  // Paint in sRGB; lighting remains in Three.js's linear working space.
  color.convertLinearToSRGB();
  const image = ctx.createImageData(512, 512);
  const relief = document.createElement('canvas');
  relief.width = relief.height = 512;
  const reliefCtx = relief.getContext('2d');
  const bumpImage = reliefCtx.createImageData(512, 512);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = random();
    const x = (i / 4) % 512;
    const y = Math.floor(i / 2048);
    const mottling = Math.sin(x * 0.061 + Math.sin(y * 0.037) * 2) * Math.sin(y * 0.049);
    const variation = 0.92 + grain * 0.10 + mottling * 0.045;
    image.data[i] = color.r * 255 * variation;
    image.data[i + 1] = color.g * 255 * variation;
    image.data[i + 2] = color.b * 255 * variation;
    image.data[i + 3] = 255;
    bumpImage.data[i] = bumpImage.data[i + 1] = bumpImage.data[i + 2] = grain * 255;
    bumpImage.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  reliefCtx.putImageData(bumpImage, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(relief);
  for (const texture of [map, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  return new THREE.MeshPhysicalMaterial({ map, bumpMap, bumpScale, roughness });
}

const yellow = texturedMaterial('#e4a325', 0.88, 0.023);
yellow.sheen = 1;
yellow.sheenColor.set('#ffdf82');
yellow.sheenRoughness = 0.75;
const bill = texturedMaterial('#c7a56b', 0.43, 0.009);
bill.clearcoat = 0.12;
bill.clearcoatRoughness = 0.5;
const black = new THREE.MeshStandardMaterial({ color: '#24242b', roughness: 0.5 });
const white = new THREE.MeshPhysicalMaterial({ color: '#f0ecd9', roughness: 0.19, clearcoat: 1, clearcoatRoughness: 0.09 });
const pupil = new THREE.MeshPhysicalMaterial({ color: '#100e0c', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
const crease = new THREE.MeshStandardMaterial({ color: '#947040', roughness: 0.85 });
const duck = new THREE.Group();
duck.name = 'Psyduck';
scene.add(duck);

function ellipsoid(name, position, scale, material, parent = duck) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function tube(name, points, radius, material, taper = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 48, radius, 12, false);
  if (taper) {
    const positions = geo.attributes.position;
    for (let i = 0; i <= 48; i++) {
      const center = curve.getPointAt(i / 48);
      const factor = 1 - 0.92 * (i / 48) ** 1.5;
      for (let j = 0; j <= 12; j++) {
        const k = i * 13 + j;
        positions.setXYZ(k,
          center.x + (positions.getX(k) - center.x) * factor,
          center.y + (positions.getY(k) - center.y) * factor,
          center.z + (positions.getZ(k) - center.z) * factor);
      }
    }
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  duck.add(mesh);
  return mesh;
}

const body = ellipsoid('Pear-shaped body', [0, 1.36, 0], [1.01, 1.12, 0.79], yellow);
const bodyPos = body.geometry.attributes.position;
for (let i = 0; i < bodyPos.count; i++) {
  const widen = 1 - bodyPos.getY(i) * 0.17;
  bodyPos.setX(i, bodyPos.getX(i) * widen);
  bodyPos.setZ(i, bodyPos.getZ(i) * widen);
}
body.geometry.computeVertexNormals();
ellipsoid('Head', [0, 2.87, 0.06], [1.07, 0.92, 0.86], yellow);
const tail = ellipsoid('Tail', [0, 0.99, -0.87], [0.36, 0.33, 0.69], yellow);
tail.rotation.x = -0.45;

for (const side of [-1, 1]) {
  const socket = ellipsoid('Soft eye socket', [side * 0.46, 3.02, 0.765], [0.351, 0.377, 0.13], yellow);
  socket.rotation.y = side * 0.25;
  const eye = ellipsoid('Eye white', [side * 0.46, 3.02, 0.79], [0.313, 0.338, 0.12], white);
  eye.rotation.y = side * 0.25;
  ellipsoid('Tiny pupil', [side * 0.44, 3.005, 0.912], [0.061, 0.078, 0.026], pupil);
  tube('Bent arm', [[side * 0.58, 1.60, 0.01], [side * 1.14, 1.98, 0.03], [side * 1.18, 2.40, 0.08], [side * 1.00, 2.88, 0.17]], 0.25, yellow);
  const palm = ellipsoid('Hand against temple', [side * 1.00, 2.86, 0.22], [0.25, 0.34, 0.22], yellow);
  palm.rotation.z = side * -0.22;
  for (let finger = 0; finger < 3; finger++) {
    const x = side * (0.87 + finger * 0.115);
    const tip = ellipsoid('Rounded finger', [x, 3.06 - finger * 0.042, 0.30], [0.082, 0.20, 0.095], yellow);
    tip.rotation.z = side * -0.20;
  }

  const footShape = new THREE.Shape();
  footShape.moveTo(-0.20, -0.28);
  footShape.bezierCurveTo(-0.34, -0.12, -0.45, 0.25, -0.48, 0.58);
  footShape.quadraticCurveTo(-0.48, 0.71, -0.34, 0.67);
  footShape.lineTo(-0.17, 0.59);
  footShape.quadraticCurveTo(0, 0.85, 0.13, 0.64);
  footShape.lineTo(0.29, 0.69);
  footShape.quadraticCurveTo(0.46, 0.73, 0.41, 0.55);
  footShape.bezierCurveTo(0.35, 0.21, 0.31, -0.1, 0.18, -0.28);
  footShape.quadraticCurveTo(0, -0.39, -0.20, -0.28);
  const foot = new THREE.Mesh(new THREE.ExtrudeGeometry(footShape, { depth: 0.045, bevelEnabled: true, bevelSegments: 8, steps: 1, bevelSize: 0.065, bevelThickness: 0.075, curveSegments: 32 }), bill);
  foot.name = 'Webbed foot';
  foot.rotation.x = Math.PI / 2;
  foot.rotation.z = side * -0.19;
  foot.position.set(side * 0.52, 0.28, 0.23);
  foot.castShadow = foot.receiveShadow = true;
  duck.add(foot);
}

ellipsoid('Lower bill', [0, 2.425, 1.045], [0.73, 0.18, 0.58], bill);
ellipsoid('Upper bill', [0, 2.56, 1.04], [0.78, 0.255, 0.65], bill);
tube('Bill seam', [[-0.64, 2.42, 1.30], [-0.48, 2.405, 1.48], [0, 2.397, 1.61], [0.48, 2.405, 1.48], [0.64, 2.42, 1.30]], 0.009, crease);
for (const side of [-1, 1]) {
  const nostril = ellipsoid('Nostril', [side * 0.23, 2.775, 1.30], [0.045, 0.014, 0.03], crease);
  nostril.rotation.x = 0.4;
}
tube('Hair left', [[-0.11, 3.69, 0.02], [-0.22, 3.99, 0.0], [-0.40, 4.15, 0.05]], 0.075, black, true);
tube('Hair middle', [[0, 3.71, 0.0], [0.00, 4.07, -0.02], [-0.035, 4.30, 0.0]], 0.079, black, true);
tube('Hair right', [[0.11, 3.69, 0.01], [0.23, 4.00, 0.02], [0.35, 4.15, 0.11]], 0.074, black, true);

// Actual tapered fibers, sampled on the sculpted surfaces rather than painted on.
duck.updateMatrixWorld(true);
const fiberPositions = [];
const fiberNormals = [];
const fiberColors = [];
const p = new THREE.Vector3();
const n = new THREE.Vector3();
const tangent = new THREE.Vector3();
const bitangent = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const vertex = new THREE.Vector3();
const tint = new THREE.Color();
const counts = { 'Head': 65000, 'Pear-shaped body': 45000, 'Bent arm': 9000, 'Hand against temple': 3500, 'Rounded finger': 500, 'Tail': 4000, 'Soft eye socket': 1800 };
for (const surface of [...duck.children]) {
  const count = counts[surface.name];
  if (!count) continue;
  const sampler = new MeshSurfaceSampler(surface).setRandomGenerator(random).build();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(surface.matrixWorld);
  for (let i = 0; i < count; i++) {
    sampler.sample(p, n);
    p.applyMatrix4(surface.matrixWorld);
    n.applyMatrix3(normalMatrix).normalize();
    tangent.crossVectors(Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, n).normalize();
    bitangent.crossVectors(n, tangent);
    const angle = random() * Math.PI * 2;
    tangent.multiplyScalar(Math.cos(angle)).addScaledVector(bitangent, Math.sin(angle));
    // Keep the face clear of fibers where eyeballs intersect the head surface.
    if (p.z > 0.66 && [-1, 1].some(side => ((p.x - side * 0.46) / 0.35) ** 2 + ((p.y - 3.02) / 0.38) ** 2 < 1)) continue;
    const length = 0.012 + random() * 0.024;
    const width = 0.0013 + random() * 0.001;
    tint.set('#e4a52d').multiplyScalar(0.92 + random() * 0.16);
    for (let corner = 0; corner < 3; corner++) {
      vertex.copy(p).addScaledVector(n, -0.002);
      if (corner === 2) vertex.addScaledVector(n, length).addScaledVector(tangent, length * 0.45);
      else vertex.addScaledVector(tangent, corner === 0 ? -width : width);
      fiberPositions.push(vertex.x, vertex.y, vertex.z);
      fiberNormals.push(n.x, n.y, n.z);
      fiberColors.push(tint.r, tint.g, tint.b);
    }
  }
}
const fibersGeometry = new THREE.BufferGeometry();
fibersGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fiberPositions, 3));
fibersGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(fiberNormals, 3));
fibersGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fiberColors, 3));
const fiberMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, sheen: 0.3, sheenColor: '#f5c76b', sheenRoughness: 1 });
// These ribbons approximate cylindrical down, so both faces use the coat normal.
fiberMaterial.onBeforeCompile = shader => {
  shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
};
const fibers = new THREE.Mesh(fibersGeometry, fiberMaterial);
fibers.name = 'Fine golden down';
fibers.receiveShadow = true;
duck.add(fibers);

const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.03, 0.20, 128), texturedMaterial('#414b43', 0.88, 0.005));
plinth.position.y = -0.02;
plinth.receiveShadow = plinth.castShadow = true;
scene.add(plinth);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#66716a', roughness: 0.92 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.13;
floor.receiveShadow = true;
scene.add(floor);
scene.add(new THREE.HemisphereLight('#e2e9ed', '#514634', 0.45));
function light(color, intensity, position, shadow = false) {
  const lamp = new THREE.DirectionalLight(color, intensity);
  lamp.position.set(...position);
  lamp.castShadow = shadow;
  if (shadow) {
    lamp.shadow.mapSize.set(2048, 2048);
    Object.assign(lamp.shadow.camera, { left: -5, right: 5, top: 6, bottom: -4, near: 0.1, far: 25 });
    lamp.shadow.normalBias = 0.025;
    lamp.shadow.bias = -0.00015;
    lamp.shadow.radius = 32;
    lamp.shadow.blurSamples = 24;
  }
  scene.add(lamp);
}
light('#fff0d7', 2.5, [-3, 7, 5], true);
light('#d9eeff', 0.55, [5, 4, 1]);
light('#fff3d9', 2.8, [1, 6, -4]);

const renderTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(new RenderPass(scene, camera));
const ao = new SSAOPass(scene, camera, innerWidth, innerHeight, 16);
ao.kernelRadius = 8;
ao.minDistance = 0.004;
ao.maxDistance = 0.04;
ao.enabled = false;
composer.addPass(ao);
composer.addPass(new OutputPass());

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(4, 3.8, 10.8).multiplyScalar(camera.aspect < 0.8 ? 1.25 : 1);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  controls.update();
}
addEventListener('resize', resize);
resize();
let renderDirty = true;
controls.addEventListener('change', () => { renderDirty = true; });
addEventListener('resize', () => { renderDirty = true; });
renderer.setAnimationLoop(() => {
  controls.update();
  if (!renderDirty) return;
  composer.render();
  renderDirty = false;
  window.renderReady = true;
});
window.exportModel = async () => {
  const buffer = await new GLTFExporter().parseAsync(duck, { binary: true });
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'psyduck_realistic.glb';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
window.sceneStats = () => ({ objects: duck.children.length, downFibers: fiberPositions.length / 9, textures: renderer.info.memory.textures });
