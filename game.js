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
let steeringAngle = 0;
let wheelSpin = 0;
let wheelRadius = 0.27;

const frontWheelPivots = [];
const wheelMeshes = [];
const baseQuaternions = new WeakMap();

const clock = new THREE.Clock();
const localForward = new THREE.Vector3(0, 0, 1);
const forward = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const desiredLookTarget = new THREE.Vector3();
const smoothLookTarget = new THREE.Vector3();
const steeringRotation = new THREE.Quaternion();
const wheelRotation = new THREE.Quaternion();
const steeringAxis = new THREE.Vector3(0, 0, 1);
const wheelAxis = new THREE.Vector3(0, 1, 0);
const cameraDistance = 3.8;
const cameraHeight = 1.7;
const cameraLookAhead = 5;
const cameraLookHeight = 0.55;

function findGLTFNode(root, originalName) {
  const runtimeName = THREE.PropertyBinding.sanitizeNodeName(originalName);
  return root.getObjectByName(runtimeName);
}

function makeCarController(model) {
  const rig = findGLTFNode(model, 'Car Rig');
  if (!rig) throw new Error('Car Rig was not found in taas-circuit.glb.');

  const requiredNodes = {
    body: findGLTFNode(rig, 'JEEP-Body'),
    frontLeftPivot: findGLTFNode(rig, 'DEF-Wheel.Ft.L'),
    frontRightPivot: findGLTFNode(rig, 'DEF-Wheel.Ft.R'),
    frontLeftWheel: findGLTFNode(rig, 'JEEP-Wheel.Ft.L'),
    frontRightWheel: findGLTFNode(rig, 'JEEP-Wheel.Ft.R'),
    rearLeftWheel: findGLTFNode(rig, 'JEEP-Wheel.Bk.L'),
    rearRightWheel: findGLTFNode(rig, 'JEEP-Wheel.Bk.R')
  };

  const missing = Object.entries(requiredNodes)
    .filter(([, object]) => !object)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Car Rig is missing required nodes: ${missing.join(', ')}`);
  }

  frontWheelPivots.length = 0;
  frontWheelPivots.push(requiredNodes.frontLeftPivot, requiredNodes.frontRightPivot);

  wheelMeshes.length = 0;
  wheelMeshes.push(
    requiredNodes.frontLeftWheel,
    requiredNodes.frontRightWheel,
    requiredNodes.rearLeftWheel,
    requiredNodes.rearRightWheel
  );

  for (const object of [...frontWheelPivots, ...wheelMeshes]) {
    baseQuaternions.set(object, object.quaternion.clone());
  }

  model.updateMatrixWorld(true);
  const wheelSize = new THREE.Box3()
    .setFromObject(requiredNodes.frontLeftWheel)
    .getSize(new THREE.Vector3());
  const measuredRadius = Math.max(wheelSize.y, wheelSize.z) * 0.5;
  if (Number.isFinite(measuredRadius) && measuredRadius > 0.01) {
    wheelRadius = measuredRadius;
  }

  return rig;
}

function carForward() {
  forward.copy(localForward).applyQuaternion(car.quaternion);
  forward.y = 0;
  return forward.normalize();
}

function placeCameraImmediately() {
  if (!car) return;
  const direction = carForward();
  desiredCameraPosition.copy(car.position).addScaledVector(direction, -cameraDistance);
  desiredCameraPosition.y += cameraHeight;
  desiredLookTarget.copy(car.position).addScaledVector(direction, cameraLookAhead);
  desiredLookTarget.y += cameraLookHeight;
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
      console.info(`F1 car ready: ${wheelMeshes.length} wheels bound to ${car.name}.`);
    } catch (error) {
      console.error(error);
      loading.textContent = 'Unable to initialize the car rig';
    }
  },
  xhr => {
    if (xhr.total) loading.textContent = `Loading Taas Circuit… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
  },
  error => {
    console.error(error);
    loading.textContent = 'Unable to load taas-circuit.glb';
  }
);

function updateWheelVisuals(steeringInput, distance, dt) {
  const maxSteeringAngle = THREE.MathUtils.degToRad(27);
  const targetSteeringAngle = steeringInput * maxSteeringAngle;
  const steeringResponse = 1 - Math.exp(-12 * dt);
  steeringAngle = THREE.MathUtils.lerp(
    steeringAngle,
    targetSteeringAngle,
    steeringResponse
  );

  // The exported DEF wheel pivots use the opposite local steering axis from
  // the vehicle root, so negate the angle to match the car's turn direction.
  steeringRotation.setFromAxisAngle(steeringAxis, -steeringAngle);
  for (const pivot of frontWheelPivots) {
    pivot.quaternion.copy(baseQuaternions.get(pivot)).multiply(steeringRotation);
  }

  wheelSpin = (wheelSpin - distance / wheelRadius) % (Math.PI * 2);
  wheelRotation.setFromAxisAngle(wheelAxis, wheelSpin);
  for (const wheel of wheelMeshes) {
    wheel.quaternion.copy(baseQuaternions.get(wheel)).multiply(wheelRotation);
  }
}

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
  const distance = speed * dt;
  updateWheelVisuals(steering, distance, dt);

  const steeringAuthority = THREE.MathUtils.clamp(speed / 12, 0, 1);
  const visualSteering = steeringAngle / THREE.MathUtils.degToRad(27);
  if (Math.abs(visualSteering) > 0.001 && speed > 0.05) {
    car.rotation.y -= visualSteering * 2.8 * steeringAuthority * dt;
  }

  // Move the exported rig root; its body and wheel branches follow it.
  car.position.addScaledVector(carForward(), distance);
  speedLabel.textContent = Math.round(speed * 3.6);
}

function updateCamera(dt) {
  if (!car) return;
  const direction = carForward();

  // PolyTrack-style chase view: low, close behind the car and looking ahead.
  desiredCameraPosition.copy(car.position).addScaledVector(direction, -cameraDistance);
  desiredCameraPosition.y += cameraHeight;
  desiredLookTarget.copy(car.position).addScaledVector(direction, cameraLookAhead);
  desiredLookTarget.y += cameraLookHeight;

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
