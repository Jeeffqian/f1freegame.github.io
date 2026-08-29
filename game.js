// 1. 初始化场景、相机与渲染器
const container = document.getElementById('canvas-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // 天蓝色
scene.fog = new THREE.FogExp2(0x87ceeb, 0.001);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// 2. 光源设置
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(200, 400, 200);
dirLight.castShadow = true;
scene.add(dirLight);

// 3. 地面 (草地)
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshLambertMaterial({ color: 0x2e8b57 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 4. Silverstone 赛道坐标点
const silverstonePoints = [
    new THREE.Vector3(0, 0, 0),        // Abbey 弯
    new THREE.Vector3(120, 0, 80),     // Farm Curve
    new THREE.Vector3(160, 0, -40),    // Village / Loop
    new THREE.Vector3(80, 0, -120),    // Aintree
    new THREE.Vector3(-160, 0, -120),  // Wellington 直道
    new THREE.Vector3(-320, 0, -80),   // Brooklands
    new THREE.Vector3(-400, 0, 0),      // Luffield
    new THREE.Vector3(-320, 0, 80),    // Woodcote
    new THREE.Vector3(-160, 0, 200),   // Copse 弯
    new THREE.Vector3(40, 0, 320),     // Maggotts
    new THREE.Vector3(120, 0, 360),    // Becketts
    new THREE.Vector3(200, 0, 320),    // Chapel
    new THREE.Vector3(160, 0, 120),    // Hangar 直道
    new THREE.Vector3(200, 0, -160),   // Stowe 弯
    new THREE.Vector3(80, 0, -240),    // Vale
    new THREE.Vector3(-40, 0, -200)    // Club 弯
];

const trackPath = new THREE.CatmullRomCurve3(silverstonePoints, true);
const trackWidth = 16;
const trackSegments = 400;

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
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 })
);
trackMesh.receiveShadow = true;
scene.add(trackMesh);

// 6. 生成护栏与碰撞数据
const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5 });
const barrierGeo = new THREE.BoxGeometry(1.5, 2.5, 4);
const barrierBoxes = [];

function generateBarriers(offset) {
    const count = 300;
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

generateBarriers(10);
generateBarriers(-10);

// 7. 生成赛车模型
const carGroup = new THREE.Group();
const carBody = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 4),
    new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.3, roughness: 0.2 })
);
carBody.position.y = 0.75;
carBody.castShadow = true;
carGroup.add(carBody);

carGroup.position.set(0, 0, 0);
scene.add(carGroup);

// 8. 物理控制变量与输入监听
const carStats = {
    speed: 0,
    maxSpeed: 2.2,
    acceleration: 0.03,
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

// 9. 渲染与物理循环 (含平滑第三人称相机)
function animate() {
    requestAnimationFrame(animate);

    // 速度与转向
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
        new THREE.Vector3(2, 1, 4)
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
        carStats.speed = -carStats.speed * 0.5;
    }

    // 第三人称摄像机跟随 (Third-Person Camera with Smooth Lerp)
    const cameraDistance = 15;
    const cameraHeight = 6;

    const idealCameraPos = new THREE.Vector3(
        carGroup.position.x - Math.sin(carStats.angle) * cameraDistance,
        carGroup.position.y + cameraHeight,
        carGroup.position.z - Math.cos(carStats.angle) * cameraDistance
    );

    camera.position.lerp(idealCameraPos, 0.1);

    const lookAtTarget = new THREE.Vector3(
        carGroup.position.x + Math.sin(carStats.angle) * 5,
        carGroup.position.y + 1.5,
        carGroup.position.z + Math.cos(carStats.angle) * 5
    );
    camera.lookAt(lookAtTarget);

    renderer.render(scene, camera);
}

// 屏幕缩放自适应
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
