import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('game');
const loading = document.getElementById('loading');
const speedLabel = document.getElementById('speed');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d9);
scene.fog = new THREE.Fog(0x87b7d9, 250, 1800);

const camera = new THREE.PerspectiveCamera(
  65,
  innerWidth / innerHeight,
  0.1,
  3000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.0));

const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(100, 200, 80);
sun.castShadow = true;
scene.add(sun);

// --------------------------------------------------
// Keyboard
// --------------------------------------------------
const keys = {};

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();

  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) {
    e.preventDefault();
  }

  keys[k] = true;
});

addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

// --------------------------------------------------
// Car
// --------------------------------------------------
let car = null;
let speed = 0;
const clock = new THREE.Clock();

// IMPORTANT:
// I inspected your actual GLB. The F1 car is NOT named "car" or "F1".
// Its visible parts are:
//   Cube.176
//   cockpit.001
//   cockpit
// with Cube.177 being a child of cockpit.001.
// The rest of the scene contains the circuit.
const CAR_PART_NAMES = new Set([
  'Cube.176',
  'cockpit.001',
  'cockpit'
]);

// In this GLB the car's long axis is Z.
// -Z is used as the car's forward direction.
const CAR_FORWARD_AXIS = -1;

function findActualCarParts(root) {
  const parts = [];

  root.traverse(object => {
    if (CAR_PART_NAMES.has(object.name)) {
      parts.push(object);
    }
  });

  return parts;
}

function createCarController(parts) {
  // Calculate the world-space center of the visible car parts.
  const box = new THREE.Box3();

  for (const part of parts) {
    part.updateWorldMatrix(true, true);
    box.expandByObject(part);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);

  const controller = new THREE.Group();
  controller.name = 'F1_Car_Controller';

  // Put the controller at the car's actual center.
  controller.position.copy(center);
  scene.add(controller);

  // Re-parent every top-level car part while preserving world transforms.
  // Cube.177 stays attached to cockpit.001 automatically.
  for (const part of parts) {
    controller.attach(part);
  }

  return controller;
}

// --------------------------------------------------
// Load GLB
// --------------------------------------------------
const loader = new GLTFLoader();

loader.load(
  './taas-circuit.glb',

  gltf => {
    const model = gltf.scene;
    scene.add(model);

    model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    const carParts = findActualCarParts(model);

    if (!carParts.length) {
      console.error('The known F1 parts were not found.');
      loading.textContent = 'F1 car parts not found';
      return;
    }

    console.log(
      'F1 car parts found:',
      carParts.map(p => p.name)
    );

    // Separate ONLY the F1 car from the circuit.
    // The circuit itself remains completely stationary.
    car = createCarController(carParts);

    setupCamera();

    loading.style.display = 'none';
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

// --------------------------------------------------
// Movement vectors
// --------------------------------------------------
const localForward = new THREE.Vector3();
const worldForward = new THREE.Vector3();

// --------------------------------------------------
// Car physics / controls
// --------------------------------------------------
function updateCar(dt) {
  if (!car) return;

  const throttle = keys.w || keys.arrowup;
  const brake = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  // W accelerates.
  if (throttle) {
    speed += 30 * dt;
  } else {
    speed -= 8 * dt;
  }

  // S brakes.
  if (brake) {
    speed -= 45 * dt;
  }

  speed = THREE.MathUtils.clamp(speed, 0, 85);

  // ------------------------------------------------
  // Steering
  // ------------------------------------------------
  // Deliberately MUCH lower than the previous 0.9.
  // Maximum steering rate is about 0.25 rad/sec.
  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);

  const speedFactor = THREE.MathUtils.clamp(
    speed / 45,
    0,
    1
  );

  const steerRate = 0.25 * speedFactor;

  if (steerInput !== 0 && speed > 0.5) {
    car.rotation.y -= steerInput * steerRate * dt;
  }

  // ------------------------------------------------
  // REAL CAR MOVEMENT
  // ------------------------------------------------
  localForward.set(0, 0, CAR_FORWARD_AXIS);

  worldForward
    .copy(localForward)
    .applyQuaternion(car.quaternion);

  worldForward.y = 0;
  worldForward.normalize();

  // Move the actual F1 controller.
  // The camera is NOT moved here.
  car.position.addScaledVector(
    worldForward,
    speed * dt
  );

  speedLabel.textContent =
    Math.round(speed * 3.6);
}

// --------------------------------------------------
// Third-person camera
// --------------------------------------------------
const cameraForward = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();

function getCarForward() {
  cameraForward
    .set(0, 0, CAR_FORWARD_AXIS)
    .applyQuaternion(car.quaternion);

  cameraForward.y = 0;
  cameraForward.normalize();

  return cameraForward;
}

function setupCamera() {
  if (!car) return;

  const forward = getCarForward();

  // BEHIND the car.
  targetCameraPosition
    .copy(car.position)
    .addScaledVector(forward, -14);

  // ABOVE the car.
  targetCameraPosition.y += 6;

  camera.position.copy(targetCameraPosition);

  // Look slightly ahead of the car.
  cameraLookTarget
    .copy(car.position)
    .addScaledVector(forward, 8);

  cameraLookTarget.y += 1.3;

  camera.lookAt(cameraLookTarget);
}

function updateCamera(dt) {
  if (!car) return;

  const forward = getCarForward();

  // Fixed chase-camera geometry:
  // 14 units behind + 6 units above.
  targetCameraPosition
    .copy(car.position)
    .addScaledVector(forward, -14);

  targetCameraPosition.y += 6;

  // Smooth follow.
  // When the car is stopped, targetCameraPosition is also stopped,
  // so the camera cannot slowly "pull itself backwards".
  const follow = 1 - Math.exp(-8 * dt);

  camera.position.lerp(
    targetCameraPosition,
    follow
  );

  cameraLookTarget
    .copy(car.position)
    .addScaledVector(forward, 8);

  cameraLookTarget.y += 1.3;

  camera.lookAt(cameraLookTarget);
}

// --------------------------------------------------
// Game loop
// --------------------------------------------------
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(
    clock.getDelta(),
    0.05
  );

  updateCar(dt);
  updateCamera(dt);

  renderer.render(scene, camera);
}

animate();

// --------------------------------------------------
// Resize
// --------------------------------------------------
addEventListener('resize', () => {
  camera.aspect =
    innerWidth / innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    innerWidth,
    innerHeight
  );
});
