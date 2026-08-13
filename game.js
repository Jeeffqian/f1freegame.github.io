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

// -----------------------------
// Keyboard
// -----------------------------
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

// -----------------------------
// Car
// -----------------------------
let car = null;
let speed = 0;
const clock = new THREE.Clock();

// Keep the same car-direction convention as your original working file.
const CAR_FORWARD = new THREE.Vector3(0, 0, -1);

function findCarRoot(root) {
  const candidates = [];

  root.traverse(o => {
    const n = (o.name || '').toLowerCase();

    // This is the SAME broad detection logic from your original
    // working game.js, not the incorrect hard-coded Cube.176/cockpit list.
    if (n.includes('car rig') || n.includes('f1') || n.includes('car')) {
      candidates.push(o);
    }
  });

  if (!candidates.length) return null;

  // Prefer an explicitly named car controller.
  candidates.sort((a, b) => {
    const score = n => {
      n = (n || '').toLowerCase();
      if (n.includes('car rig')) return 100;
      if (n.includes('f1')) return 80;
      if (n === 'car') return 60;
      return 40;
    };
    return score(b.name) - score(a.name);
  });

  // IMPORTANT FIX:
  // Do NOT automatically climb all the way to the GLB top-level child.
  // That can select a whole circuit/group and make it look like the
  // camera is moving instead of the car.
  return candidates[0];
}

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
        'No car object found. Objects containing car/F1 were not found.'
      );
      loading.textContent = 'Could not find the F1 car in the GLB';
      return;
    }

    console.log('F1 controller selected:', car.name);

    car.updateMatrixWorld(true);

    // Start with the camera directly behind the actual selected car.
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

// -----------------------------
// Driving
// -----------------------------
const forward = new THREE.Vector3();

function updateCar(dt) {
  if (!car) return;

  const throttle = keys.w || keys.arrowup;
  const brake = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  // Acceleration.
  if (throttle) {
    speed += 30 * dt;
  } else {
    speed -= 8 * dt;
  }

  if (brake) {
    speed -= 45 * dt;
  }

  speed = THREE.MathUtils.clamp(speed, 0, 85);

  // MUCH lower steering sensitivity than the old 0.9.
  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  const speedFactor = THREE.MathUtils.clamp(speed / 45, 0, 1);

  // Maximum = 0.22 rad/sec at speed.
  const steerRate = 0.22 * speedFactor;

  if (steerInput !== 0 && speed > 0.2) {
    car.rotation.y -= steerInput * steerRate * dt;
  }

  // Move the actual car object.
  forward
    .copy(CAR_FORWARD)
    .applyQuaternion(car.quaternion);

  forward.y = 0;
  forward.normalize();

  car.position.addScaledVector(
    forward,
    speed * dt
  );

  speedLabel.textContent =
    Math.round(speed * 3.6);
}

// -----------------------------
// TRUE THIRD-PERSON CAMERA
// -----------------------------
const cameraForward = new THREE.Vector3();
const targetCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function getForward() {
  cameraForward
    .copy(CAR_FORWARD)
    .applyQuaternion(car.quaternion);

  cameraForward.y = 0;
  cameraForward.normalize();

  return cameraForward;
}

function setupCamera() {
  if (!car) return;

  const f = getForward();

  // Behind + above the car.
  targetCamera
    .copy(car.position)
    .addScaledVector(f, -12);

  targetCamera.y += 5;

  camera.position.copy(targetCamera);

  lookTarget
    .copy(car.position)
    .addScaledVector(f, 7);

  lookTarget.y += 1.2;

  camera.lookAt(lookTarget);
}

function updateCamera(dt) {
  if (!car) return;

  const f = getForward();

  // The target is ALWAYS behind the car.
  targetCamera
    .copy(car.position)
    .addScaledVector(f, -12);

  targetCamera.y += 5;

  // Smooth following, but no autonomous camera movement.
  const follow = 1 - Math.exp(-7 * dt);

  camera.position.lerp(
    targetCamera,
    follow
  );

  lookTarget
    .copy(car.position)
    .addScaledVector(f, 7);

  lookTarget.y += 1.2;

  camera.lookAt(lookTarget);
}

// -----------------------------
// Loop
// -----------------------------
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

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
