// 1. 初始化场景、相机与渲染器
const container = document.getElementById('canvas-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0005);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// 2. 光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(300, 600, 300);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// 3. 草地地面
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000),
    new THREE.MeshLambertMaterial({ color: 0x3b7a57 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 4. 绝对不交叉的顺畅赛道几何路径 (闭合环形 2D Path)
const trackPoints2D = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(300, 200),
    new THREE.Vector2(550, 0),
    new THREE.Vector2(400, -350),
    new THREE.Vector2(-250, -400),
    new THREE.Vector2(-550, -150),
    new THREE.Vector2(-400, 300),
    new THREE.Vector2(-100, 600),
    new THREE.Vector2(250, 600),
    new THREE.Vector2(500, 400),
    new THREE.Vector2(450, 200),
    new THREE.Vector2(200, -100)
];

const trackCurve2D = new THREE.CurvePath();
for (let i = 0; i < trackPoints2D.length; i++) {
    const p1 = trackPoints2D[i];
    const p2 = trackPoints2D[(i + 1) % trackPoints2D.length];
    trackCurve2D.add(new THREE.LineCurve(p1, p2));
}

// 转换为 3D 曲线
const silverstone3DPoints = trackPoints2D.map(p => new THREE.Vector3(p.x, 0, p.y));
const trackPath = new THREE.CatmullRomCurve3(silverstone3DPoints, true, 'centripetal', 0.5);

const trackWidth = 24;
const trackSegments = 600;

// 5. 生成赛道沥青路面
const trackGeometry = new THREE.BufferGeometry();
const positions = [];
const trackLeftEdge = [];
const trackRightEdge = [];

for (let i = 0; i <= trackSegments; i++) {
    const t = i / trackSegments;
    const pt = trackPath.getPointAt(t);
    const tangent = trackPath.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const left = pt.clone().add(normal.clone().multiplyScalar(trackWidth / 2));
    const right = pt.clone().sub(normal.clone().multiplyScalar(trackWidth / 2));

    positions.push(left.x, left.y + 0.05, left.z);
    positions.push(right.x, right.y + 0.05, right.z);

    // 记录边缘坐标用于构建连贯实体墙
    trackLeftEdge.push(left);
    trackRightEdge.push(right);
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

// 6. 核心修改：生成无缝连贯的【纯石心/混凝土连续墙】
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3 });
const wallHeight = 2.5;
const wallThickness = 1.2;

function createSolidWall(edgePoints, isOutward) {
    const wallGeo = new THREE.BufferGeometry();
    const wallPos = [];
    const wallIndices = [];
    const len = edgePoints.length;

    for (let i = 0; i < len; i++) {
        const pt = edgePoints[i];
        const nextPt = edgePoints[(i + 1) % len];
        const dir = nextPt.clone().sub(pt).normalize();
        const normal = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(isOutward ? 1 : -1);

        const pInnerBottom = pt.clone();
        const pInnerTop = pt.clone().add(new THREE.Vector3(0, wallHeight, 0));
        const pOuterBottom = pt.clone().add(normal.clone().multiplyScalar(wallThickness));
        const pOuterTop = pInnerTop.clone().add(normal.clone().multiplyScalar(wallThickness));

        wallPos.push(
            pInnerBottom.x, pInnerBottom.y, pInnerBottom.z,
            pInnerTop.x, pInnerTop.y, pInnerTop.z,
            pOuterTop.x, pOuterTop.y, pOuterTop.z,
            pOuterBottom.x, pOuterBottom.y, pOuterBottom.z
        );

        const base = i * 4;
        const nextBase = ((i + 1) % len) * 4;

        // 内侧面
        wallIndices.push(base, base + 1, nextBase);
        wallIndices.push(nextBase, base + 1, nextBase + 1);
        // 顶面
        wallIndices.push(base + 1, base + 2, nextBase + 1);
        wallIndices.push(nextBase + 1, base + 2, nextBase + 2);
    }

    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();

    const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);
}

// 自动生成左侧与右侧一体化连贯石墙
createSolidWall(trackLeftEdge, true);
createSolidWall(trackRightEdge, false);

// 7. 赛车模型
const carGroup = new THREE.Group();

const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.5, roughness: 0.2 });
const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 4.2), bodyMat);
carBody.position.y = 0.6;
carBody.castShadow = true;
carGroup.add(carBody);

const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.1 });
const carCabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), cabinMat);
carCabin.position.set(0, 1.15, -0.2);
carCabin.castShadow = true;
carGroup.add(carCabin);

const wingMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), wingMat);
wing.position.set(0, 1.3, -2.0);
wing.castShadow = true;
carGroup.add(wing);

const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 24);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
wheelGeo.rotateZ(Math.PI / 2);

[[-1.25, 0.45, 1.3], [1.25, 0.45, 1.3], [-1.25, 0.45, -1.3], [1.25, 0.45, -1.3]].forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(...pos);
    wheel.castShadow = true;
    carGroup.add(wheel);
});

const startPt = trackPath.getPointAt(0);
carGroup.position.set(startPt.x, 0, startPt.z);
scene.add(carGroup);

// 8. 赛车物理操控参数
const carStats = { speed: 0, maxSpeed: 3.0, acceleration: 0.05, friction: 0.96, steering: 0.035, angle: 0 };
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

// 9. 主循环 (动画与平滑第三人称相机)
function animate() {
    requestAnimationFrame(animate);

    if (keys.Forward) carStats.speed = Math.min(carStats.speed + carStats.acceleration, carStats.maxSpeed);
    if (keys.Backward) carStats.speed = Math.max(carStats.speed - carStats.acceleration, -carStats.maxSpeed / 2);

    carStats.speed *= carStats.friction;

    if (Math.abs(carStats.speed) > 0.01) {
        const dir = carStats.speed > 0 ? 1 : -1;
        if (keys.Left) carStats.angle += carStats.steering * dir;
        if (keys.Right) carStats.angle -= carStats.steering * dir;
    }

    carGroup.rotation.y = carStats.angle;

    carGroup.position.x += Math.sin(carStats.angle) * carStats.speed;
    carGroup.position.z += Math.cos(carStats.angle) * carStats.speed;

    // 平滑第三人称相机
    const cameraDistance = 20;
    const cameraHeight = 8;

    const idealCameraPos = new THREE.Vector3(
        carGroup.position.x - Math.sin(carStats.angle) * cameraDistance,
        carGroup.position.y + cameraHeight,
        carGroup.position.z - Math.cos(carStats.angle) * cameraDistance
    );

    camera.position.lerp(idealCameraPos, 0.1);
    camera.lookAt(carGroup.position.x, carGroup.position.y + 1.2, carGroup.position.z);

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
