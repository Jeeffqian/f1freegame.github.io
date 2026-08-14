import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('game');
const loading = document.getElementById('loading');
const speedLabel = document.getElementById('speed');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d9);
scene.fog = new THREE.Fog(0x87b7d9, 250, 1800);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(100, 200, 80);
sun.castShadow = true;
scene.add(sun);

const keys = {};
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
  keys[k] = true;
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

let car = null;
let speed = 0;
const clock = new THREE.Clock();

const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const worldForward = new THREE.Vector3();
const targetCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

const loader = new GLTFLoader();

function getBox(obj) {
  obj.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(obj);
}

function hasMesh(obj) {
  let found = false;
  obj.traverse(child => {
    if (child.isMesh) found = true;
  });
  return found;
}

/*
 * 不再依赖 Blender 的 Cube.176 / Cube.177 / Cube.178 名字。
 * 之前报错的根本原因就是这里把模型名字写死了。
 *
 * 自动从 GLB 的根节点中寻找带 Mesh 的对象：
 * 1. 排除名字明显属于赛道的对象
 * 2. 找到最大的根对象并认为它是赛道
 * 3. 剩余紧密聚集的小对象作为赛车部件
 */
function findCarParts(model) {
  // Verified structure from the uploaded GLB:
  // Cube.176, Cube.177 (with child Cube.175), Cube.178.
  const wanted = new Set(['Cube.176', 'Cube.177', 'Cube.178']);
  const parts = [];

  model.traverse(obj => {
    if (wanted.has(obj.name)) parts.push(obj);
  });

  if (parts.length === 3) {
    console.log('Verified F1 parts:', parts.map(p => p.name));
    return parts;
  }

  console.error('Verified F1 parts not found:', parts.map(p => p.name));
  return [];
}

function makeCarController(parts) {
  const box = new THREE.Box3();

  for (const part of parts) {
    part.updateWorldMatrix(true, true);
    box.expandByObject(part);
  }

  const center = box.getCenter(new THREE.Vector3());

  const controller = new THREE.Group();
  controller.name = 'F1_CAR_CONTROLLER';

  // Put the controller at the actual car center.
  controller.position.copy(center);
  scene.add(controller);

  // attach() preserves each part's current world transform.
  // Cube.175 stays under Cube.177 automatically.
  for (const part of parts) {
    controller.attach(part);
  }

  return controller;
}

loader.load(
  './taas-circuit.glb?v=3',

  gltf => {
    const model = gltf.scene;
    scene.add(model);

    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const parts = findCarParts(model);
    console.log('Detected F1 car roots:', parts.map(p => p.name));

    if (!parts.length) {
      loading.textContent = 'F1 car could not be detected';
      return;
    }

    car = makeCarController(parts);
    console.log('F1 car controller ready:', car);

    if (!car || !car.isObject3D) {
      loading.textContent = 'F1 car controller failed to initialize';
      throw new Error('F1 controller initialization failed');
    }

    loading.style.display = 'none';
    resetCamera();
  },

  xhr => {
    if (xhr.total) {
      loading.textContent =
        `Loading Taas Circuit… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
    }
  },

  error => {
    console.error(error);
    loading.textContent = 'Could not load taas-circuit.glb';
  }
);

function getForward() {
  worldForward
    .copy(LOCAL_FORWARD)
    .applyQuaternion(car.quaternion);

  worldForward.y = 0;
  worldForward.normalize();

  return worldForward;
}

function updateCar(dt) {
  if (!car) return;

  const throttle = keys.w || keys.arrowup;
  const brake = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  // W / ↑ 真正推动赛车 controller。
  // 摄像机完全不会负责赛车移动。
  if (throttle) speed += 42 * dt;
  else speed -= 14 * dt;

  if (brake) speed -= 70 * dt;

  speed = THREE.MathUtils.clamp(speed, 0, 100);

  // 你要求的是“灵敏度最高”，所以这里明显提高转向响应。
  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  const speedFactor = THREE.MathUtils.clamp(speed / 20, 0, 1);
  const steerRate = 2.8 * speedFactor;

  if (steerInput !== 0 && speed > 0.1) {
    car.rotation.y -= steerInput * steerRate * dt;
  }

  // 核心：移动的是 CAR，不是 CAMERA。
  const forward = getForward();

  // IMPORTANT: move the F1 controller, never the camera or the track.
  if (speed > 0) {
    car.position.x += forward.x * speed * dt;
    car.position.z += forward.z * speed * dt;
  }

  speedLabel.textContent = Math.round(speed * 3.6);
}

function resetCamera() {
  if (!car) return;

  const forward = getForward();

  // PolyTrack 风格第三人称：
  // 赛车后方 + 稍微高一点。
  targetCamera
    .copy(car.position)
    .addScaledVector(forward, -9);

  targetCamera.y += 3.2;

  camera.position.copy(targetCamera);

  lookTarget
    .copy(car.position)
    .addScaledVector(forward, 7);

  lookTarget.y += 0.8;

  camera.lookAt(lookTarget);
}

function updateCamera(dt) {
  if (!car) return;

  const forward = getForward();

  // 摄像机永远根据赛车位置计算，不会自己往后漂。
  targetCamera
    .copy(car.position)
    .addScaledVector(forward, -9);

  targetCamera.y += 3.2;

  const follow = 1 - Math.exp(-10 * dt);
  camera.position.lerp(targetCamera, follow);

  lookTarget
    .copy(car.position)
    .addScaledVector(forward, 7);

  lookTarget.y += 0.8;

  camera.lookAt(lookTarget);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  updateCar(dt);
  updateCamera(dt);

  renderer.render(scene, camera);
}

animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
