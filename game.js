// 1. 初始化场景、相机与渲染器
const container = document.getElementById('canvas-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // 天蓝色
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// 2. 光源设置
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(300, 500, 300);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// 3. 地面 (草地)
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: 0x2e8b57 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 4. 优化后的 Silverstone 赛道坐标点 (修正交叉重叠问题)
const silverstonePoints = [
    new THREE.Vector3(0, 0, 0),          // 1. Abbey 大直道
    new THREE.Vector3(150, 0, 100),      // 2. Farm Curve
    new THREE.Vector3(250, 0, 0),        // 3. Village
    new THREE.Vector3(180, 0, -150),     // 4. The Loop
    new THREE.Vector3(80, 0, -200),      // 5. Aintree
    new THREE.Vector3(-200, 0, -200),    // 6. Wellington 直道
    new THREE.Vector3(-450, 0, -120),    // 7. Brooklands
    new THREE.Vector3(-550, 0, 50),      // 8. Luffield
    new THREE.Vector3(-400, 0, 180),     // 9. Woodcote
    new THREE.Vector3(-200, 0, 300),     // 10. Copse 弯
    new THREE.Vector3(50, 0, 450),       // 11. Maggotts
    new THREE.Vector3(200, 0, 480),      // 12. Becketts
    new THREE.Vector3(320, 0, 420),      // 13. Chapel
    new THREE.Vector3(280, 0, 180),      // 14. Hangar 直道
    new THREE.Vector3(350, 0, -250),     // 15. Stowe 弯
    new THREE.Vector3(180, 0, -400),     // 16. Vale 弯
    new THREE.Vector3(-50, 0, -350)      // 17. Club 弯
];

const trackPath = new THREE.CatmullRomCurve3(silverstonePoints, true, 'centripetal');
const trackWidth = 20;
const trackSegments = 600;

// 5. 生成赛道网格
const trackGeometry = new THREE.BufferGeometry();
const positions = [];
for (let i = 0; i <= trackSegments; i++) {
    const t = i / trackSegments;
    const pt = trackPath.getPointAt(t);
    const tangent = trackPath.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const left = pt.clone().add(normal.clone().multiplyScalar(trackWidth / 2));
    const right = pt.clone().sub(normal.clone().multiplyScalar(trackWidth / 2));

    positions.push(left.x, left.y + 0.05, left.z);
    positions.push(right.x, right.y + 0.05, right.z);
}

const indices = [];
for (let i = 0; i < trackSegments; i++) {
    const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1;
    indices.push(a, b, c, b, d, c);
}

trackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
trackGeometry.setIndex(indices);
trackGeometry.computeVertexNormals();

const trackMesh = new THREE.Mesh(
    trackGeometry,
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
);
trackMesh.receiveShadow = true;
scene.add(trackMesh);

// 6. 生成水泥护栏
const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
const barrierGeo = new THREE.BoxGeometry(1.5, 2.5, 5);
const barrierBoxes = [];

function generateBarriers(offset) {
    const count = 450;
    for (let i = 0; i < count; i++) {
        const t = i / count;
        const pt = trackPath.getPointAt(t);
        const tangent = trackPath.getTangentAt(t);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const pos = pt.clone().add(normal.multiplyScalar(offset));
        const barrier = new THREE.Mesh(barrierGeo, barrierMaterial);
        barrier.position.set(pos.x, 1.25, pos.z);
        barrier.rotation.y = Math.atan2(tangent.x, tangent.z);
        barrier.castShadow = true;
        scene.add(barrier);

        const box = new THREE.Box3().setFromObject(barrier);
        barrierBoxes.push(box);
    }
}

generateBarriers(12);
generateBarriers(-12);

// 7. 组合建模：构建完整赛车模型
const carGroup = new THREE.Group();

// 车身底盘
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.5, roughness: 0.2 });
const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 4.2), bodyMat);
carBody.position.y = 0.6;
carBody.castShadow = true;
carGroup.add(carBody);

// 车舱顶
const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.1 });
const carCabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), cabinMat);
carCabin.position.set(0, 1.15, -0.2);
carCabin.castShadow = true;
carGroup.add(carCabin);

// 车尾翼
const wingMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), wingMat);
wing.position.set(0, 1.3, -2.0);
wing.castShadow = true;
carGroup.add(wing);

const wingStand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), wingMat);
wingStand.position.set(0, 1.05, -2.0);
carGroup.add(wingStand);

// 4个车轮
const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 24);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
wheelGeo.rotateZ(Math.PI / 2);

const wheelPositions = [
    [-1.25, 0.45, 1.3],   // 左前轮
    [1.25, 0.45, 1.3],    // 右前轮
    [-1.25, 0.45, -1.3],  // 左后轮
    [1.25, 0.45, -1.3]    // 右后轮
];

wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(...pos);
    wheel.castShadow = true;
    carGroup.add(wheel);
});

carGroup.position.set(0, 0, 0);
scene.add(carGroup);

// 8. 物理控制参数与监听
const carStats = {
    speed: 0,
    maxSpeed: 2.5,
    acceleration: 0.04,
    friction: 0.96,
    steering: 0.03,
    angle: 0
};

const keys = { Forward: false, Backward: false, Left: false, Right: false };

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.Forward = true;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.Backward = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.Left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.Right = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.Forward = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.Backward = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.Left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.Right = false;
});

// 9. 主循环 (运动、碰撞与平滑第三人称相机)
function animate() {
    requestAnimationFrame(animate);

    // 动力学计算
    if (keys.Forward) carStats.speed = Math.min(carStats.speed + carStats.acceleration, carStats.maxSpeed);
    if (keys.Backward) carStats.speed = Math.max(carStats.speed - carStats.acceleration, -carStats.maxSpeed / 2);

    carStats.speed *= carStats.friction;

    if (Math.abs(carStats.speed) > 0.01) {
        const dir = carStats.speed > 0 ? 1 : -1;
        if (keys.Left) carStats.angle += carStats.steering * dir;
        if (keys.Right) carStats.angle -= carStats.steering * dir;
    }

    carGroup.rotation.y = carStats.angle;

    // 碰撞检测
    const nextX = carGroup.position.x + Math.sin(carStats.angle) * carStats.speed;
    const nextZ = carGroup.position.z + Math.cos(carStats.angle) * carStats.speed;

    const carBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(nextX, 1, nextZ),
        new THREE.Vector3(2.5, 1, 4.5)
    );

    let hasCollided = false;
    for (let i = 0; i < barrierBoxes.length; i++) {
        if (carBox.intersectsBox(barrierBoxes[i])) {
            hasCollided = true;
            break;
        }
    }

    if (!hasCollided) {
        carGroup.position.x = nextX;
        carGroup.position.z = nextZ;
    } else {
        carStats.speed = -carStats.speed * 0.5; // 撞墙反弹
    }

    // 平滑第三人称视角跟踪 (Third-Person Camera)
    const cameraDistance = 18;
    const cameraHeight = 7;

    const idealCameraPos = new THREE.Vector3(
        carGroup.position.x - Math.sin(carStats.angle) * cameraDistance,
        carGroup.position.y + cameraHeight,
        carGroup.position.z - Math.cos(carStats.angle) * cameraDistance
    );

    camera.position.lerp(idealCameraPos, 0.1);

    const lookAtTarget = new THREE.Vector3(
        carGroup.position.x + Math.sin(carStats.angle) * 6,
        carGroup.position.y + 1.2,
        carGroup.position.z + Math.cos(carStats.angle) * 6
    );
    camera.lookAt(lookAtTarget);

    renderer.render(scene, camera);
}

// 窗口适配
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
