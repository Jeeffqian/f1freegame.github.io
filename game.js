import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('game');
const loading = document.getElementById('loading');
const speedLabel = document.getElementById('speed');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d9);
scene.fog = new THREE.Fog(0x87b7d9, 250, 1800);

const camera = new THREE.PerspectiveCamera(
  72,
  innerWidth / innerHeight,
  0.1,
  3000
);

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
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) {
    e.preventDefault();
  }
  keys[k] = true;
});

addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

let car = null;
let rearWing = null;
let speed = 0;

const clock = new THREE.Clock();

const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
// IMPORTANT: in this GLB the car's front is +Z.
// Plane.067 is at the rear of the car, so -Z is behind the rear wing.

const worldForward = new THREE.Vector3();
const targetCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const wingWorld = new THREE.Vector3();

const loader = new GLTFLoader();

function findRearWing(model) {
  let found = null;

  model.traverse(obj => {
    const name = obj.name || '';
    if (
      name === 'Plane.067' ||
      name === 'Plane.67'
    ) {
      found = obj;
    }
  });

  return found;
}

function getWorldPosition(obj) {
  obj.updateWorldMatrix(true, false);
  return obj.getWorldPosition(new THREE.Vector3());
}

/*
 * Plane.067 is the known rear-wing object.
 *
 * The GLB stores the car as many separate root-level meshes.
 * They are all physically clustered around Plane.067.
 *
 * We therefore:
 * 1. Find Plane.067.
 * 2. Collect every mesh within 6 Blender units of it.
 * 3. Put those meshes into one F1_CAR_CONTROLLER.
 *
 * This is much safer than looking for "F1", "Car", or only
 * Cube.176/Cube.177/Cube.178.
 */
function findCarParts(model, wing) {
  const wingPos = getWorldPosition(wing);
  const parts = [];

  model.traverse(obj => {
    if (!obj.isMesh) return;

    const p = getWorldPosition(obj);
    const distance = p.distanceTo(wingPos);

    if (distance <= 6.0) {
      parts.push(obj);
    }
  });

  return parts;
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
  controller.position.copy(center);

  scene.add(controller);

  // Keep every car part at its original world position.
  for (const part of parts) {
    controller.attach(part);
  }

  return controller;
}

function getForward() {
  worldForward
    .copy(LOCAL_FORWARD)
    .applyQuaternion(car.quaternion);

  worldForward.y = 0;

  if (worldForward.lengthSq() < 0.000001) {
    worldForward.set(0, 0, 1);
  } else {
    worldForward.normalize();
  }

  return worldForward;
}

function updateWingWorldPosition() {
  if (!rearWing) return;
  rearWing.getWorldPosition(wingWorld);
}

loader.load(
  './taas-circuit.glb?v=plane67',

  gltf => {
    const model = gltf.scene;
    scene.add(model);

    model.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // FIRST: find the exact rear wing requested by the user.
    rearWing = findRearWing(model);

    if (!rearWing) {
      console.error('Plane.067 / Plane.67 was not found in the GLB.');
      loading.textContent = '找不到尾翼 Plane.067';
      return;
    }

    console.log('Rear wing found:', rearWing.name);

    // SECOND: build the whole car around that wing.
    const parts = findCarParts(model, rearWing);

    console.log(
      'Detected car parts:',
      parts.length,
      parts.map(p => p.name)
    );

    if (parts.length < 20) {
      console.error('Too few car parts were detected:', parts.length);
      loading.textContent = '赛车部件检测失败';
      return;
    }

    car = makeCarController(parts);

    // Find Plane.067 again after attach(); it is now inside the controller.
    rearWing = car.getObjectByName('Plane.067') ||
               car.getObjectByName('Plane.67');

    if (!rearWing) {
      loading.textContent = '尾翼 Plane.067 初始化失败';
      return;
    }

    loading.style.display = 'none';

    resetCamera();

    console.log('F1 car ready. Camera anchor:', rearWing.name);
  },

  xhr => {
    if (xhr.total) {
      loading.textContent =
        `Loading Taas Circuit… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
    }
  },

  error => {
    console.error(error);
    loading.textContent = '无法加载 taas-circuit.glb';
  }
);

function updateCar(dt) {
  if (!car) return;

  const throttle = keys.w || keys.arrowup;
  const brake = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  // W = real car acceleration.
  if (throttle) {
    speed += 42 * dt;
  } else {
    speed -= 14 * dt;
  }

  if (brake) {
    speed -= 70 * dt;
  }

  speed = THREE.MathUtils.clamp(speed, 0, 100);

  // Maximum/high steering response requested by the user.
  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  const speedFactor = THREE.MathUtils.clamp(speed / 15, 0, 1);
  const steerRate = 3.8;

  if (steerInput !== 0 && speed > 0.1) {
    car.rotation.y -= steerInput * steerRate * speedFactor * dt;
  }

  /*
   * Move the CAR controller.
   * The camera never moves the car.
   */
  const forward = getForward();
  car.position.addScaledVector(forward, speed * dt);

  speedLabel.textContent = Math.round(speed * 3.6);
}

function resetCamera() {
  if (!car || !rearWing) return;

  updateWingWorldPosition();

  const forward = getForward();

  // PolyTrack / Trackmania-style chase camera:
  // behind the WHOLE CAR, slightly above it, looking ahead.
  targetCamera
    .copy(car.position)
    .addScaledVector(forward, -10.5);

  targetCamera.y += 4.2;

  camera.position.copy(targetCamera);

  lookTarget
    .copy(car.position)
    .addScaledVector(forward, 8.0);

  lookTarget.y += 0.7;

  camera.lookAt(lookTarget);
}

function updateCamera(dt) {
  if (!car || !rearWing) return;

  updateWingWorldPosition();

  const forward = getForward();

  /*
   * Arcade chase camera:
   *
   *                 CAMERA
   *                    📷
   *                   /
   *                  /
   *             ┌─────────┐
   *             │   🏎️    │  ---> forward
   *             └─────────┘
   *
   * Plane.067 identifies the rear wing/car rear,
   * but the camera is positioned behind the whole car.
   */

  targetCamera
    .copy(car.position)
    .addScaledVector(forward, -10.5);

  targetCamera.y += 4.2;

  // Smooth follow like an arcade racing game.
  const follow = 1 - Math.exp(-10 * dt);
  camera.position.lerp(targetCamera, follow);

  // Look ahead of the car, not directly at the rear wing.
  lookTarget
    .copy(car.position)
    .addScaledVector(forward, 8.0);

  lookTarget.y += 0.7;

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
