// --- 游戏全局变量 ---
let scene, camera, renderer;
let car, ground, track;

// 运动物理参数
let speed = 0;
let maxSpeed = 120;
let maxReverseSpeed = -30;
let acceleration = 40;
let deceleration = 25;
let braking = 60;
let turnSpeed = 2.2;

// 按键状态
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

// 摄像机控制向量
const targetCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

// 摄像机第三人称偏移设置 (相对于赛车)
// CAMERA_OFFSET: X=0(正后居中), Y=2.5(高度), Z=7.0(后方距离)
// LOOK_OFFSET: 摄像机视点位置
const CAMERA_OFFSET = new THREE.Vector3(0, 2.5, 7.0);
const LOOK_OFFSET = new THREE.Vector3(0, 1.0, -5.0);

let clock = new THREE.Clock();

function init() {
    // 1. 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // 天蓝色天空
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.008);

    // 2. 创建摄像机
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    // 3. 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // 4. 灯光设置
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 80, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    const d = 100;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // 5. 构建场景元素 (地面 & 赛道 & 赛车)
    createEnvironment();
    createCar();

    // 6. 初始化摄像机位置
    resetCamera();

    // 7. 事件监听
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));

    // 8. 启动渲染循环
    animate();
}

// --- 构建赛车模型 ---
function createCar() {
    car = new THREE.Group();

    // 车身材质
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.2, metalness: 0.5 });
    const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1, metalness: 0.9 });
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    // 主车体 (F1 单座舱风格)
    const bodyGeo = new THREE.BoxGeometry(1.2, 0.5, 3.2);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMaterial);
    bodyMesh.position.y = 0.4;
    bodyMesh.castShadow = true;
    car.add(bodyMesh);

    // 车头锥体
    const noseGeo = new THREE.BoxGeometry(0.7, 0.35, 1.2);
    const noseMesh = new THREE.Mesh(noseGeo, bodyMaterial);
    noseMesh.position.set(0, 0.35, -2.0);
    noseMesh.castShadow = true;
    car.add(noseMesh);

    // 前翼
    const frontWingGeo = new THREE.BoxGeometry(2.0, 0.08, 0.5);
    const frontWingMesh = new THREE.Mesh(frontWingGeo, blackMaterial);
    frontWingMesh.position.set(0, 0.2, -2.5);
    frontWingMesh.castShadow = true;
    car.add(frontWingMesh);

    // 后尾翼
    const rearWingGeo = new THREE.BoxGeometry(1.6, 0.1, 0.6);
    const rearWingMesh = new THREE.Mesh(rearWingGeo, blackMaterial);
    rearWingMesh.position.set(0, 1.0, 1.5);
    rearWingMesh.castShadow = true;
    car.add(rearWingMesh);

    // 尾翼立柱
    const wingSupportGeo = new THREE.BoxGeometry(0.1, 0.5, 0.3);
    const wingSupport1 = new THREE.Mesh(wingSupportGeo, blackMaterial);
    wingSupport1.position.set(0.4, 0.7, 1.5);
    car.add(wingSupport1);
    const wingSupport2 = new THREE.Mesh(wingSupportGeo, blackMaterial);
    wingSupport2.position.set(-0.4, 0.7, 1.5);
    car.add(wingSupport2);

    // 驾驶舱 / 挡风玻璃
    const cockpitGeo = new THREE.BoxGeometry(0.6, 0.35, 0.8);
    const cockpitMesh = new THREE.Mesh(cockpitGeo, glassMaterial);
    cockpitMesh.position.set(0, 0.7, -0.2);
    car.add(cockpitMesh);

    // 车轮构造
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 24);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelPositions = [
        { x: -0.9, y: 0.4, z: -1.2 }, // 左前
        { x: 0.9, y: 0.4, z: -1.2 },  // 右前
        { x: -0.95, y: 0.4, z: 1.2 },  // 左后
        { x: 0.95, y: 0.4, z: 1.2 }   // 右后
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMaterial);
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        car.add(wheel);
    });

    car.position.set(0, 0, 0);
    scene.add(car);
}

// --- 构建环境 & 赛道 ---
function createEnvironment() {
    // 草地地面
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 环形赛道
    const trackGroup = new THREE.Group();
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });

    const outerRadius = 80;
    const innerRadius = 60;

    const ringGeo = new THREE.RingGeometry(innerRadius, outerRadius, 64);
    const trackMesh = new THREE.Mesh(ringGeo, trackMat);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.y = 0.01;
    trackMesh.receiveShadow = true;
    trackGroup.add(trackMesh);

    scene.add(trackGroup);
}

// --- 摄像机跟随逻辑 (正后方第三人称视角) ---
function getCameraWorldPosition(targetVec) {
    targetVec.copy(CAMERA_OFFSET);
    car.localToWorld(targetVec);
    return targetVec;
}

function getLookTargetWorldPosition(targetVec) {
    targetVec.copy(LOOK_OFFSET);
    car.localToWorld(targetVec);
    return targetVec;
}

function resetCamera() {
    if (!car) return;
    getCameraWorldPosition(targetCamera);
    camera.position.copy(targetCamera);

    getLookTargetWorldPosition(lookTarget);
    camera.lookAt(lookTarget);
}

function updateCamera(dt) {
    if (!car) return;

    // 1. 计算车正后方的目标世界坐标
    getCameraWorldPosition(targetCamera);

    // 2. 使用平滑插值 (lerp) 紧密跟随
    const followSpeed = 15;
    const lerpFactor = 1 - Math.exp(-followSpeed * dt);
    camera.position.lerp(targetCamera, lerpFactor);

    // 3. 计算前方焦点并设置看向该点
    getLookTargetWorldPosition(lookTarget);
    camera.lookAt(lookTarget);
}

// --- 键盘输入处理 ---
function handleKey(e, isDown) {
    const key = e.key.toLowerCase();
    if (key === 'w' || e.key === 'ArrowUp') keys.forward = isDown;
    if (key === 's' || e.key === 'ArrowDown') keys.backward = isDown;
    if (key === 'a' || e.key === 'ArrowLeft') keys.left = isDown;
    if (key === 'd' || e.key === 'ArrowRight') keys.right = isDown;

    if (key === 'r' && isDown) {
        car.position.set(0, 0, 0);
        car.rotation.set(0, 0, 0);
        speed = 0;
        resetCamera();
    }
}

// --- 车辆运动物理更新 ---
function updatePhysics(dt) {
    if (keys.forward) {
        speed += acceleration * dt;
        if (speed > maxSpeed) speed = maxSpeed;
    } else if (keys.backward) {
        if (speed > 0) {
            speed -= braking * dt;
        } else {
            speed -= acceleration * 0.5 * dt;
            if (speed < maxReverseSpeed) speed = maxReverseSpeed;
        }
    } else {
        if (speed > 0) {
            speed -= deceleration * dt;
            if (speed < 0) speed = 0;
        } else if (speed < 0) {
            speed += deceleration * dt;
            if (speed > 0) speed = 0;
        }
    }

    if (Math.abs(speed) > 0.1) {
        const dir = speed > 0 ? 1 : -1;
        if (keys.left) {
            car.rotation.y += turnSpeed * dir * dt;
        }
        if (keys.right) {
            car.rotation.y -= turnSpeed * dir * dt;
        }
    }

    car.translateZ(-speed * dt * 0.3);

    document.getElementById('speed-display').innerText = Math.abs(Math.round(speed));
}

// --- 窗口大小调节 ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- 主游戏循环 ---
function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();

    updatePhysics(dt);
    updateCamera(dt);

    renderer.render(scene, camera);
}

function startGame() {
    document.getElementById('instructions').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('instructions').style.display = 'none';
    }, 300);
}

window.onload = init;
