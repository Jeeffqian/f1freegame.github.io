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

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(100, 200, 80);
sun.castShadow = true;
scene.add(sun);

const keys = {};
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
  keys[k] = true;
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

let car = null;
let speed = 0;
const clock = new THREE.Clock();

const carController = new THREE.Group();
scene.add(carController);

// Your original code used -Z as the car's forward direction.
const CAR_FORWARD_AXIS = -1;

function topLevelAncestor(obj, root) {
  let x = obj;
  while (x.parent && x.parent !== root) x = x.parent;
  return x;
}

function findCarRoot(root) {
  const candidates = [];
  root.traverse(o => {
    const n = (o.name || '').toLowerCase();
    if (n.includes('car rig') || n.includes('f1') || n === 'car' || n.startsWith('car ') || n.endsWith(' car')) {
      candidates.push(o);
    }
  });
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const score = name => {
      name = (name || '').toLowerCase();
      if (name.includes('car rig')) return 100;
      if (name.includes('f1')) return 80;
      if (name === 'car') return 60;
      return 40;
    };
    return score(b.name) - score(a.name);
  });
  return topLevelAncestor(candidates[0], root);
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

    const foundCar = findCarRoot(model);

    if (!foundCar) {
      console.error('Could not find the F1 car object inside taas-circuit.glb.');
      loading.textContent = 'Could not find the F1 car in the GLB';
      return;
    }

    // Detach the car from the circuit hierarchy while preserving its world transform.
    scene.attach(foundCar);

    // Put the visual car inside an independent controller.
    carController.position.copy(foundCar.position);
    carController.quaternion.copy(foundCar.quaternion);
    carController.scale.copy(foundCar.scale);

    scene.remove(foundCar);
    carController.add(foundCar);

    foundCar.position.set(0, 0, 0);
    foundCar.rotation.set(0, 0, 0);
    foundCar.scale.set(1, 1, 1);

    car = carController;
    setupCamera();
    loading.style.display = 'none';
  },
  xhr => {
    if (xhr.total) loading.textContent = `Loading Taas Circuit… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
  },
  err => {
    console.error(err);
    loading.textContent = 'Could not load taas-circuit.glb';
  }
);

const localForward = new THREE.Vector3();
const worldForward = new THREE.Vector3();

function updateCar(dt) {
  if (!car) return;

  const throttle = keys.w || keys.arrowup;
  const brake = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  if (throttle) speed += 32 * dt;
  else speed -= 10 * dt;
  if (brake) speed -= 55 * dt;

  speed = THREE.MathUtils.clamp(speed, 0, 85);

  // Lower steering sensitivity: max about 0.30 rad/sec.
  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  const speedFactor = THREE.MathUtils.clamp(speed / 45, 0, 1);
  const steerRate = 0.30 * speedFactor;

  if (steerInput !== 0 && speed > 0.5) {
    car.rotation.y -= steerInput * steerRate * dt;
  }

  localForward.set(0, 0, CAR_FORWARD_AXIS);
  worldForward.copy(localForward).applyQuaternion(car.quaternion);
  worldForward.y = 0;
  worldForward.normalize();

  // Move the car controller, not the camera.
  car.position.addScaledVector(worldForward, speed * dt);

  speedLabel.textContent = Math.round(speed * 3.6);
}

const cameraForward = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();

function getCarForward() {
  cameraForward.set(0, 0, CAR_FORWARD_AXIS).applyQuaternion(car.quaternion);
  cameraForward.y = 0;
  cameraForward.normalize();
  return cameraForward;
}

function setupCamera() {
  if (!car) return;
  const forward = getCarForward();

  // Third-person: behind and above the car.
  targetCameraPosition.copy(car.position);
  targetCameraPosition.addScaledVector(forward, -12);
  targetCameraPosition.y += 5.0;
  camera.position.copy(targetCameraPosition);

  cameraLookTarget.copy(car.position);
  cameraLookTarget.addScaledVector(forward, 7);
  cameraLookTarget.y += 1.0;
  camera.lookAt(cameraLookTarget);
}

function updateCamera(dt) {
  if (!car) return;
  const forward = getCarForward();

  targetCameraPosition.copy(car.position);
  targetCameraPosition.addScaledVector(forward, -12);
  targetCameraPosition.y += 5.0;

  // Smooth chase camera; it will not move when the car is stationary.
  const positionSmooth = 1 - Math.exp(-6 * dt);
  camera.position.lerp(targetCameraPosition, positionSmooth);

  cameraLookTarget.copy(car.position);
  cameraLookTarget.addScaledVector(forward, 7);
  cameraLookTarget.y += 1.0;
  camera.lookAt(cameraLookTarget);
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
