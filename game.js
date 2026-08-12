import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('game');
const loading = document.getElementById('loading');
const speedLabel = document.getElementById('speed');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d9);
scene.fog = new THREE.Fog(0x87b7d9, 250, 1800);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
camera.position.set(0, 8, 15);

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
let carDirection = new THREE.Vector3(0, 0, -1);
let speed = 0;
let wheelBase = 2.8;
const clock = new THREE.Clock();

function topLevelAncestor(obj, root) {
  let x = obj;
  while (x.parent && x.parent !== root) x = x.parent;
  return x;
}

function findCarRoot(root) {
  const candidates = [];
  root.traverse(o => {
    const n = (o.name || '').toLowerCase();
    if (n.includes('car rig') || n.includes('f1') || n.includes('car')) {
      candidates.push(o);
    }
  });
  if (!candidates.length) return null;
  // Prefer an object explicitly named Car Rig, then F1, then Car.
  candidates.sort((a,b) => {
    const score = n => {
      n = (n || '').toLowerCase();
      if (n.includes('car rig')) return 3;
      if (n.includes('f1')) return 2;
      return 1;
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

    car = findCarRoot(model);

    if (car) {
      // Keep the imported car at its Blender position and drive that object/group.
      car.updateMatrixWorld(true);
    } else {
      console.warn('No F1/car object was found in the GLB. The circuit will still load.');
    }

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!car) {
      camera.position.set(center.x, center.y + maxDim * 0.18, center.z + maxDim * 0.18);
      camera.lookAt(center);
    }

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

function updateCar(dt) {
  if (!car) return;

  const throttle = keys.w || keys.arrowup;
  const brake = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft;
  const right = keys.d || keys.arrowright;

  if (throttle) speed += 28 * dt;
  else speed -= 7 * dt;
  if (brake) speed -= 42 * dt;

  speed = THREE.MathUtils.clamp(speed, -12, 85);

  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  const steerStrength = 0.9 * THREE.MathUtils.clamp(Math.abs(speed) / 25, 0, 1);
  car.rotation.y -= steer * steerStrength * dt * Math.sign(speed || 1);

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(car.quaternion);
  car.position.addScaledVector(forward, speed * dt);

  speedLabel.textContent = Math.round(Math.max(0, speed) * 3.6);
}

function updateCamera(dt) {
  if (!car) return;

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(car.quaternion);
  const targetPos = car.position.clone()
    .addScaledVector(forward, -11)
    .add(new THREE.Vector3(0, 5, 0));

  camera.position.lerp(targetPos, 1 - Math.pow(0.001, dt));
  const lookAt = car.position.clone().add(new THREE.Vector3(0, 1.2, 0))
    .addScaledVector(forward, 8);
  camera.lookAt(lookAt);
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
