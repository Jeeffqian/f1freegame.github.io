import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('game');
const loading = document.getElementById('loading');
const speedLabel = document.getElementById('speed');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d9);
scene.fog = new THREE.Fog(0x87b7d9, 250, 1800);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 3000);
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
const drivingKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (drivingKeys.has(key)) event.preventDefault();
  keys[key] = true;
});
addEventListener('keyup', event => {
  keys[event.key.toLowerCase()] = false;
});

let car = null;
let speed = 0;

const clock = new THREE.Clock();
const localForward = new THREE.Vector3(0, 0, 1);
const forward = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const desiredLookTarget = new THREE.Vector3();
const smoothLookTarget = new THREE.Vector3();

function isCarPart(object) {
  // The car is made of Plane.*, Cylinder.*, plus four root-level Cube parts.
  // Cube.175 is the large chassis/rear assembly that was left behind before.
  return object.isMesh && (
    /^(Plane|Cylinder)(?:\.\d+)?$/.test(object.name) ||
    ['Cube.175', 'Cube.176', 'Cube.177', 'Cube.178'].includes(object.name)
  );
}

function makeCarController(model) {
  const parts = [];
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (isCarPart(object)) parts.push(object);
  });

  if (!parts.length) throw new Error('No car meshes found in the GLB.');

  const bounds = new THREE.Box3();
  for (const part of parts) bounds.expandByObject(part);

  const controller = new THREE.Group();
  controller.name = 'F1_CAR_CONTROLLER';
  controller.position.copy(bounds.getCenter(new THREE.Vector3()));
  scene.add(controller);

  // attach() preserves each mesh's world position. Only the car now moves;
  // the track stays in place.
  for (const part of parts) controller.attach(part);
  return controller;
}

function carForward() {
  forward.copy(localForward).applyQuaternion(car.quaternion);
  forward.y = 0;
  return forward.normalize();
}

function placeCameraImmediately() {
  if (!car) return;
  const direction = carForward();
  desiredCameraPosition.copy(car.position).addScaledVector(direction, -8.5);
  desiredCameraPosition.y += 3.6;
  desiredLookTarget.copy(car.position).addScaledVector(direction, 6.5);
  desiredLookTarget.y += 0.7;
  camera.position.copy(desiredCameraPosition);
  smoothLookTarget.copy(desiredLookTarget);
  camera.lookAt(smoothLookTarget);
}

new GLTFLoader().load(
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

    try {
      car = makeCarController(model);
      placeCameraImmediately();
      loading.style.display = 'none';
      console.info(`F1 car ready: ${car.children.length} meshes attached.`);
    } catch (error) {
      console.error(error);
      loading.textContent = '赛车模型初始化失败';
    }
  },
  xhr => {
    if (xhr.total) loading.textContent = `Loading Taas Circuit… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
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

  if (throttle) speed += 30 * dt;
  else speed -= 10 * dt;
  if (brake) speed -= 52 * dt;
  speed = THREE.MathUtils.clamp(speed, 0, 52);

  const steering = (right ? 1 : 0) - (left ? 1 : 0);
  const steeringAuthority = THREE.MathUtils.clamp(speed / 12, 0, 1);
  if (steering && speed > 0.05) {
    car.rotation.y -= steering * 2.8 * steeringAuthority * dt;
  }

  // Move the car controller itself; the camera only follows it.
  car.position.addScaledVector(carForward(), speed * dt);
  speedLabel.textContent = Math.round(speed * 3.6);
}

function updateCamera(dt) {
  if (!car) return;
  const direction = carForward();

  // PolyTrack-style chase view: low, close behind the car and looking ahead.
  desiredCameraPosition.copy(car.position).addScaledVector(direction, -8.5);
  desiredCameraPosition.y += 3.6;
  desiredLookTarget.copy(car.position).addScaledVector(direction, 6.5);
  desiredLookTarget.y += 0.7;

  const cameraFollow = 1 - Math.exp(-9 * dt);
  const lookFollow = 1 - Math.exp(-14 * dt);
  camera.position.lerp(desiredCameraPosition, cameraFollow);
  smoothLookTarget.lerp(desiredLookTarget, lookFollow);
  camera.lookAt(smoothLookTarget);
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
