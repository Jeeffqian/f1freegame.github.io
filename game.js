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

/*
  VERIFIED AGAINST THE UPLOADED GLB:

  Root-level F1 mesh nodes:
    Cube.176  -> mesh 175
    Cube.177  -> mesh 177
      └─ Cube.175 -> mesh 176
    Cube.178  -> mesh 178

  track is a separate root-level node.

  Therefore the car controller must contain:
    Cube.176
    Cube.177 (including its Cube.175 child)
    Cube.178

  No guessing by object name "car" or "f1".
*/
const CAR_ROOT_NAMES = ['Cube.176', 'Cube.177', 'Cube.178'];
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);

const loader = new GLTFLoader();

function findExactCarRoots(model) {
  const found = new Map();

  model.traverse(obj => {
    if (CAR_ROOT_NAMES.includes(obj.name)) {
      found.set(obj.name, obj);
    }
  });

  return CAR_ROOT_NAMES
    .map(name => found.get(name))
    .filter(Boolean);
}

function makeCarController(parts) {
  const box = new THREE.Box3();

  // All parts are currently root-level GLB objects, except Cube.175,
  // which remains a child of Cube.177. So moving Cube.177 also moves
  // Cube.175 automatically.
  for (const part of parts) {
    part.updateWorldMatrix(true, true);
    box.expandByObject(part);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);

  const controller = new THREE.Group();
  controller.name = 'F1_CAR_CONTROLLER';

  // Controller pivot = actual visual center of the whole car.
  // It starts at the car's existing world position.
  controller.position.copy(center);
  scene.add(controller);

  // Preserve the exact visual world transform while making the parts
  // children of the controller.
  for (const part of parts) {
    controller.attach(part);
  }

  return controller;
}

loader.load(
  './taas-circuit.glb',
  gltf => {
    const model = gltf.scene;
    scene.add(model);

    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const parts = findExactCarRoots(model);

    console.log('Verified GLB F1 roots:', parts.map(p => p.name));

    if (parts.length !== 3) {
      console.error(
        'Expected Cube.176, Cube.177 and Cube.178. Found:',
        parts.map(p => p.name)
      );
      loading.textContent = 'F1 car model structure was not found';
      return;
    }

    car = makeCarController(parts);

    console.log('F1 controller ready:', car.name);
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

const worldForward = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const targetCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

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

  // Speed is world-independent; only the car controller moves.
  if (throttle) speed += 35 * dt;
  else speed -= 12 * dt;

  if (brake) speed -= 55 * dt;

  speed = THREE.MathUtils.clamp(speed, 0, 90);

  /*
    Steering sensitivity:
      old value: 0.9
      new value: 0.20
    This is deliberately LOWER, not higher.
  */
  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  const speedFactor = THREE.MathUtils.clamp(speed / 35, 0, 1);
  const steerRate = 0.20 * speedFactor;

  if (steerInput !== 0 && speed > 0.1) {
    car.rotation.y -= steerInput * steerRate * dt;
  }

  const f = getForward();

  // THIS moves the car, not the camera.
  car.position.addScaledVector(f, speed * dt);

  speedLabel.textContent = Math.round(speed * 3.6);
}

function resetCamera() {
  if (!car) return;

  const f = getForward();

  // Explicit third-person chase position:
  // 12 units behind + 5 units above the car.
  targetCamera.copy(car.position).addScaledVector(f, -12);
  targetCamera.y += 5;

  camera.position.copy(targetCamera);

  lookTarget.copy(car.position).addScaledVector(f, 7);
  lookTarget.y += 1.1;

  camera.lookAt(lookTarget);
}

function updateCamera(dt) {
  if (!car) return;

  const f = getForward();

  // The camera target is calculated from the CAR CONTROLLER.
  // Therefore it cannot independently drift backwards.
  targetCamera.copy(car.position).addScaledVector(f, -12);
  targetCamera.y += 5;

  const follow = 1 - Math.exp(-8 * dt);
  camera.position.lerp(targetCamera, follow);

  lookTarget.copy(car.position).addScaledVector(f, 7);
  lookTarget.y += 1.1;

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
