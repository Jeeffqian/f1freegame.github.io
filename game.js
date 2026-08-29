// 1. 初始化场景、相机与渲染器
const container = document.getElementById('canvas-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // 天蓝色
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0005);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// 2. 光源设置
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(300, 600, 300);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// 3. 地面 (草地)
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000),
    new THREE.MeshLambertMaterial({ color: 0x3b7a57 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 4. 精简无交叉的 Silverstone 赛道核心拓扑点（按顺时针顺畅连接）
const silverstonePoints = [
    new THREE.Vector3(0, 0, 0),        // Start / Hamilton Straight
    new THREE.Vector3(250, 0, 150),    // Abbey & Farm Curve
    new THREE.Vector3(450, 0, 0),      // Village & Loop
    new THREE.Vector3(300, 0, -300),   // Aintree & Wellington Straight
    new THREE.Vector3(-200, 0, -350),  // Brooklands
    new THREE.Vector3(-450, 0, -150),  // Luffield & Woodcote
    new THREE.Vector3(-350, 0, 250),   // Copse Corner
    new THREE.Vector3(-100, 0, 500),   // Maggotts & Becketts
    new THREE.Vector3(200, 0, 500),    // Chapel
    new THREE.Vector3(400, 0, 350),    // Hangar Straight
    new THREE.Vector3(350, 0, 150),    // Stowe Corner
    new THREE.Vector3(150, 0, -100)    // Vale & Club
];

// 使用 centripetal 参数算法，彻底防止曲线过冲自交
const trackPath = new THREE.CatmullRomCurve3(silverstonePoints, true, 'centripetal', 0.5);
const trackWidth = 22;
const trackSegments = 800;

// 5. 生成赛道网格 (带红白路肩)
const trackGeometry = new THREE.BufferGeometry();
const positions = [];
const uvs = [];

for (let i = 0; i <= trackSegments; i++) {
    const t = i / trackSegments;
    const pt = trackPath.getPointAt(t);
    const tangent = trackPath.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const left = pt.clone().add(normal.clone().multiplyScalar(trackWidth / 2));
    const right = pt.clone().sub(normal.clone().multiplyScalar(trackWidth / 2));

    positions.push(left.x, left.y + 0.1, left.z);
    positions.push(right.x, right.y + 0.1, right.z);

    uvs.push(0, i / 10);
    uvs.push(1, i / 10);
}

const indices = [];
for (let i = 0; i < trackSegments; i++) {
    const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1;
    indices.push(a, b, c, b, d, c);
}

trackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
trackGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
trackGeometry.setIndex(indices);
trackGeometry.computeVertexNormals();

const trackMesh = new THREE.Mesh(
    trackGeometry,
    new THREE.MeshStandardMaterial({ color: 0x282828, roughness: 0.8 })
);
trackMesh.receiveShadow = true;
scene.add(trackMesh);

// 6. 严密按法线距离偏移生成左右独立护栏 (解决交叉)
const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.4 });
const barrierGeo = new THREE.BoxGeometry(1.2, 2.0, 4.0);
const barrierBoxes = [];

function generateBarriers(offsetDistance) {
    const count = 350;
    for (let i = 0; i < count; i++) {
        const t = i / count;
        const pt = trackPath.getPointAt(t);
        const tangent = trackPath.getTangentAt(t);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // 护栏生成在赛道边缘外侧 2 个单位处
        const pos = pt.clone().add(normal.multiplyScalar(offsetDistance));
        const barrier = new THREE.Mesh(barrierGeo, barrierMaterial);
        barrier.position.set(pos.x, 1.0, pos.z);
        barrier.rotation.y = Math.atan2(tangent.x, tangent.z);
        barrier.castShadow = true;
        scene.add(barrier);

        const box = new THREE.Box3().setFromObject(barrier);
        barrierBoxes.push(box);
    }
}

// 赛道宽度 22，左右护栏分别偏移 +14 和 -14，留出安全边距
generateBarriers(trackWidth / 2 + 3);
generateBarriers(-(trackWidth / 2 + 3));

// 7. 赛车建模
const carGroup = new THREE.Group();

// 车身
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.5, roughness: 0.2 });
const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 4.2), bodyMat);
carBody.position.y = 0.6;
carBody.castShadow = true;
carGroup.add(carBody);

// 座舱
const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.1 });
const carCabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), cabinMat);
carCabin.position.set(0, 1.15, -0.2);
carCabin.castShadow = true;
carGroup.add(carCabin);

// 尾翼
const wingMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), wingMat);
wing.position.set(0, 1.3, -2.0);
wing.castShadow = true;
carGroup.add(wing);

const wingStand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), wingMat);
wingStand.position.set(0, 1.05, -2.0);
carGroup.add(wingStand);

// 车轮
const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 24);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
wheelGeo.rotateZ(Math.PI / 2);

const wheelPositions = [
    [-1.25, 0.45, 1.3],
    [1.25, 0.45, 1.3],
    [-1.25, 0.45, -1.3],
    [1.25, 0.45, -1.3]
];

wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(...pos);
    wheel.castShadow = true;
    carGroup.add(wheel);
});

// 将赛车放在赛道起点
const startPoint = trackPath.getPointAt(0);
carGroup.position.set(startPoint.x, 0, startPoint.z);
scene.add(carGroup);

// 8. 控制参数
const carStats = {
    speed: 0,
    maxSpeed: 3.0,
    acceleration: 0.05,
    friction: 0.96,
    steering: 0.035,
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

// 9. 渲染与物理循环
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

    // 移动与碰撞
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
        carStats.speed = -carStats.speed * 0.4; // 碰撞减速弹回
    }

    // 平滑第三人称相机跟踪
    const cameraDistance = 20;
    const cameraHeight = 8;

    const idealCameraPos = new THREE.Vector3(
        carGroup.position.x - Math.sin(carStats.angle) * cameraDistance,
        carGroup.position.y + cameraHeight,
        carGroup.position.z - Math.cos(carStats.angle) * cameraDistance
    );

    camera.position.lerp(idealCameraPos, 0.1);

    const lookAtTarget = new THREE.Vector3(
        carGroup.position.x + Math.sin(carStats.angle) * 8,
        carGroup.position.y + 1.2,
        carGroup.position.z + Math.cos(carStats.angle) * 8
    );
    camera.lookAt(lookAtTarget);

    renderer.render(scene, camera);
}

// 屏幕适配
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
