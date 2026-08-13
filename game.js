import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('game');
const loading = document.getElementById('loading');
const speedLabel = document.getElementById('speed');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d9);
scene.fog = new THREE.Fog(0x87b7d9, 250, 1800);

const camera = new THREE.PerspectiveCamera(
  60,
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

// =========================
// KEYBOARD
// =========================
const keys = {};

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();

  if (
    ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ']
      .includes(k)
  ) {
    e.preventDefault();
  }

  keys[k] = true;
});

addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

// =========================
// CAR
// =========================
let car = null;
let speed = 0;
const clock = new THREE.Clock();

// IMPORTANT:
// Your GLB contains the track AND the F1 car.
// We find the actual car object rather than moving the whole track.
function topLevelAncestor(obj, root) {
  let x = obj;

  while (x.parent && x.parent !== root) {
    x = x.parent;
  }

  return x;
}

function findCarRoot(root) {
  const candidates = [];

  root.traverse(o => {
    const name = (o.name || '').toLowerCase();

    if (
      name.includes('car rig') ||
      name.includes('f1') ||
      name.includes('car')
    ) {
      candidates.push(o);
    }
  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const score = name => {
      name = (name || '').toLowerCase();

      if (name.includes('car rig')) return 3;
      if (name.includes('f1')) return 2;
      return 1;
    };

    return score(b.name) - score(a.name);
  });

  return topLevelAncestor(candidates[0], root);
}

// =========================
// LOAD GLB
// =========================
const loader = new GLTFLoader();

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

    car = findCarRoot(model);

    if (!car) {
      console.error(
        'F1 car was not found in the GLB. Check the car object name.'
      );

      loading.textContent = 'Could not find the F1 car in the GLB';
      return;
    }

    // Make sure the selected car root has a usable world transform.
    car.updateMatrixWorld(true);

    // Initial third-person camera position.
    setupCamera();

    loading.style.display = 'none';
  },

  xhr => {
    if (xhr.total) {
      loading.textContent =
        `Loading Taas Circuit… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
    }
  },

  err => {
    console.error(err);
    loading.textContent = 'Could not load taas-circuit.glb';
  }
);

// =========================
// CAR MOVEMENT
// =========================
function updateCar(dt) {
  if (!car) return;

  const throttle = keys.w || keys.arrowup;
  const brake = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  // Smooth acceleration / deceleration.
  if (throttle) {
    speed += 32 * dt;
  } else {
    speed -= 9 * dt;
  }

  if (brake) {
    speed -= 50 * dt;
  }

  // Maximum forward speed.
  speed = THREE.MathUtils.clamp(speed, -10, 85);

  // =========================
  // STEERING
  // =========================

  const steerInput =
    (right ? 1 : 0) - (left ? 1 : 0);

  // Much lower steering sensitivity than before.
  // Steering increases gradually with speed.
  const speedFactor = THREE.MathUtils.clamp(
    Math.abs(speed) / 45,
    0,
    1
  );

  const steerStrength = 0.48 * speedFactor;

  car.rotation.y -=
    steerInput *
    steerStrength *
    dt *
    Math.sign(speed || 1);

  // =========================
  // ACTUALLY MOVE THE CAR
  // =========================

  // The GLB car uses -Z as its local forward direction.
  const forward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(car.quaternion);

  forward.y = 0;
  forward.normalize();

  car.position.addScaledVector(
    forward,
    speed * dt
  );

  speedLabel.textContent =
    Math.round(Math.max(0, speed) * 3.6);
}

// =========================
// THIRD-PERSON CAMERA
// =========================
const cameraForward = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();

function setupCamera() {
  if (!car) return;

  cameraForward.set(0, 0, -1)
    .applyQuaternion(car.quaternion);

  cameraForward.y = 0;
  cameraForward.normalize();

  // Camera is BEHIND the car.
  targetCameraPosition.copy(car.position);
  targetCameraPosition.addScaledVector(
    cameraForward,
    -12
  );

  // Camera is ABOVE the car.
  targetCameraPosition.y += 5.5;

  camera.position.copy(targetCameraPosition);

  cameraLookTarget.copy(car.position);
  cameraLookTarget.addScaledVector(
    cameraForward,
    8
  );
  cameraLookTarget.y += 1.3;

  camera.lookAt(cameraLookTarget);
}

function updateCamera(dt) {
  if (!car) return;

  // Local -Z is the car's forward direction.
  cameraForward.set(0, 0, -1)
    .applyQuaternion(car.quaternion);

  cameraForward.y = 0;
  cameraForward.normalize();

  // =========================
  // CAMERA BEHIND + ABOVE CAR
  // =========================

  targetCameraPosition.copy(car.position);

  targetCameraPosition.addScaledVector(
    cameraForward,
    -12
  );

  targetCameraPosition.y += 5.5;

  // Smooth but not overly locked to the car.
  const positionSmooth =
    1 - Math.exp(-5 * dt);

  camera.position.lerp(
    targetCameraPosition,
    positionSmooth
  );

  // Look ahead of the car.
  cameraLookTarget.copy(car.position);

  cameraLookTarget.addScaledVector(
    cameraForward,
    8
  );

  cameraLookTarget.y += 1.3;

  camera.lookAt(cameraLookTarget);
}

// =========================
// GAME LOOP
// =========================
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

// =========================
// RESIZE
// =========================
addEventListener('resize', () => {
  camera.aspect =
    innerWidth / innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    innerWidth,
    innerHeight
  );
});
