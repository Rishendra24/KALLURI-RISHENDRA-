/* ============================================================
   0. GLOBAL STATE
   ============================================================ */
const yearEl = document.getElementById('year');
if(yearEl) yearEl.textContent = new Date().getFullYear();

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = ('ontouchstart' in window) || window.matchMedia('(pointer:coarse)').matches;
if(isTouch){ document.body.classList.add('touch-device'); }
document.body.classList.add('lock-scroll');
const hasGSAP = typeof gsap !== 'undefined';

/* ============================================================
   1. CUSTOM CURSOR + RIPPLE
   ============================================================ */
const cursorDot = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');
let ringX=0, ringY=0, mouseX=0, mouseY=0;

if(!isTouch){
  window.addEventListener('mousemove', e=>{
    mouseX = e.clientX; mouseY = e.clientY;
    cursorDot.style.left = mouseX+'px'; cursorDot.style.top = mouseY+'px';
  }, { passive:true });
  function animateRing(){
    ringX += (mouseX-ringX)*0.18;
    ringY += (mouseY-ringY)*0.18;
    cursorRing.style.left = ringX+'px'; cursorRing.style.top = ringY+'px';
    requestAnimationFrame(animateRing);
  }
  animateRing();

  document.addEventListener('mousedown', e=>{
    const ripple = document.createElement('div');
    ripple.className = 'cursor-ripple';
    ripple.style.left = e.clientX+'px';
    ripple.style.top = e.clientY+'px';
    document.body.appendChild(ripple);
    if(hasGSAP){
      gsap.to(ripple, { width:70, height:70, opacity:0, duration:0.6, ease:'power2.out', onComplete:()=>ripple.remove() });
    } else {
      ripple.style.transition = 'all .6s ease';
      requestAnimationFrame(()=>{ ripple.style.width='70px'; ripple.style.height='70px'; ripple.style.opacity='0'; });
      setTimeout(()=>ripple.remove(), 650);
    }
  });

  document.querySelectorAll('a, button').forEach(el=>{
    el.addEventListener('mouseenter', ()=>cursorRing.classList.add('hovering'));
    el.addEventListener('mouseleave', ()=>cursorRing.classList.remove('hovering'));
  });
}

/* ============================================================
   2. KONAMI CODE EASTER EGG
   ============================================================ */
const konamiSeq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiProgress = 0;
document.addEventListener('keydown', e=>{
  const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const expected = konamiSeq[konamiProgress];
  if(got === expected){
    konamiProgress++;
    if(konamiProgress === konamiSeq.length){ triggerEasterEgg(); konamiProgress = 0; }
  } else {
    konamiProgress = (got === konamiSeq[0]) ? 1 : 0;
  }
});
function triggerEasterEgg(){
  const eggToast = document.getElementById('egg-toast');
  eggToast.classList.add('show');
  setTimeout(()=> eggToast.classList.remove('show'), 3200);
  if(webglBg && webglBg.burst) webglBg.burst();
}

/* ============================================================
   3. WEBGL SPACE BACKGROUND — starfield, nebula, wireframe core
   ============================================================ */
let webglBg = null;

function createGlowTexture(hex){
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const gctx = c.getContext('2d');
  const grd = gctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  grd.addColorStop(0, hex + 'FF');
  grd.addColorStop(0.35, hex + '55');
  grd.addColorStop(1, hex + '00');
  gctx.fillStyle = grd;
  gctx.fillRect(0,0,size,size);
  return new THREE.CanvasTexture(c);
}

function initWebGLBackground(){
  const container = document.getElementById('webgl-bg');
  if(!container || typeof THREE === 'undefined') return null;

  let renderer;
  try{ renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'low-power' }); }
  catch(e){ return null; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050311, 0.016);
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth/window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 22);

  /* ---- procedural galaxy shader background ----
     A faithful port of react-bits' Galaxy component (originally OGL/React)
     to a vanilla Three.js ShaderMaterial. Same algorithm: hashed star
     layers with flare rays, per-star twinkle, depth-cycled parallax
     layers, and mouse repulsion — parented to the camera so it always
     fills the frame regardless of the camera's parallax. */
  const galaxyMat = new THREE.ShaderMaterial({
    uniforms:{
      uTime:{value:0},
      uResolution:{value:new THREE.Vector3(window.innerWidth, window.innerHeight, window.innerWidth/window.innerHeight)},
      uFocal:{value:new THREE.Vector2(0.5,0.5)},
      uRotation:{value:new THREE.Vector2(1.0,0.0)},
      uStarSpeed:{value:0.2},
      uDensity:{value:2.4},
      uHueShift:{value:80.0},
      uSpeed:{value:2.2},
      uMouse:{value:new THREE.Vector2(0.5,0.5)},
      uGlowIntensity:{value:0.25},
      uSaturation:{value:0.55},
      uMouseRepulsion:{value:true},
      uTwinkleIntensity:{value:0.8},
      uRotationSpeed:{value:0.25},
      uRepulsionStrength:{value:0.5},
      uMouseActiveFactor:{value:0.0},
      uAutoCenterRepulsion:{value:0.0},
      uTransparent:{value:false},
      uBurst:{value:0.0}
    },
    vertexShader:`
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;

      uniform float uTime;
      uniform vec3 uResolution;
      uniform vec2 uFocal;
      uniform vec2 uRotation;
      uniform float uStarSpeed;
      uniform float uDensity;
      uniform float uHueShift;
      uniform float uSpeed;
      uniform vec2 uMouse;
      uniform float uGlowIntensity;
      uniform float uSaturation;
      uniform bool uMouseRepulsion;
      uniform float uTwinkleIntensity;
      uniform float uRotationSpeed;
      uniform float uRepulsionStrength;
      uniform float uMouseActiveFactor;
      uniform float uAutoCenterRepulsion;
      uniform bool uTransparent;
      uniform float uBurst;

      #define NUM_LAYER 4.0
      #define STAR_COLOR_CUTOFF 0.2
      #define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
      #define PERIOD 3.0

      float Hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float tri(float x) { return abs(fract(x) * 2.0 - 1.0); }
      float tris(float x) { float t = fract(x); return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0)); }
      float trisn(float x) { float t = fract(x); return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0; }

      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      float Star(vec2 uv, float flare) {
        float d = length(uv);
        float m = (0.05 * uGlowIntensity) / d;
        float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
        m += rays * flare * uGlowIntensity;
        uv *= MAT45;
        rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
        m += rays * 0.3 * flare * uGlowIntensity;
        m *= smoothstep(1.0, 0.2, d);
        return m;
      }

      vec3 StarLayer(vec2 uv) {
        vec3 col = vec3(0.0);
        vec2 gv = fract(uv) - 0.5;
        vec2 id = floor(uv);

        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 si = id + vec2(float(x), float(y));
            float seed = Hash21(si);
            float size = fract(seed * 345.32);
            float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
            float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

            float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
            float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
            float grn = min(red, blu) * seed;
            vec3 base = vec3(red, grn, blu);

            float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
            hue = fract(hue + uHueShift / 360.0);
            float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
            float val = max(max(base.r, base.g), base.b);
            base = hsv2rgb(vec3(hue, sat, val));

            vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

            float star = Star(gv - offset - pad, flareSize);
            vec3 color = base;

            float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
            twinkle = mix(1.0, twinkle, uTwinkleIntensity);
            star *= twinkle;

            col += star * size * color;
          }
        }
        return col;
      }

      void main() {
        vec2 focalPx = uFocal * uResolution.xy;
        vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

        vec2 mouseNorm = uMouse - vec2(0.5);

        if (uAutoCenterRepulsion > 0.0) {
          vec2 centerUV = vec2(0.0, 0.0);
          float centerDist = length(uv - centerUV);
          vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
          uv += repulsion * 0.05;
        } else if (uMouseRepulsion) {
          vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
          float mouseDist = length(uv - mousePosUV);
          vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
          uv += repulsion * 0.05 * uMouseActiveFactor;
        } else {
          vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
          uv += mouseOffset;
        }

        float autoRotAngle = uTime * uRotationSpeed;
        mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
        uv = autoRot * uv;
        uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

        vec3 col = vec3(0.0);
        for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
          float depth = fract(i + uStarSpeed * uSpeed);
          float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
          float fade = depth * smoothstep(1.0, 0.9, depth);
          col += StarLayer(uv * scale + i * 453.32) * fade;
        }
        col *= (1.0 + uBurst * 1.5);

        if (uTransparent) {
          float alpha = length(col);
          alpha = smoothstep(0.0, 0.3, alpha);
          alpha = min(alpha, 1.0);
          gl_FragColor = vec4(col, alpha);
        } else {
          gl_FragColor = vec4(col, 1.0);
        }
      }
    `,
    depthWrite:false
  });
  const galaxyPlane = new THREE.Mesh(new THREE.PlaneGeometry(1,1), galaxyMat);
  galaxyPlane.position.set(0, 0, -50);
  camera.add(galaxyPlane);
  scene.add(camera);

  function sizeGalaxyPlane(){
    const dist = 50;
    const vFov = camera.fov * Math.PI/180;
    const height = 2 * dist * Math.tan(vFov/2);
    const width = height * camera.aspect;
    galaxyPlane.scale.set(width, height, 1);
    galaxyMat.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight, window.innerWidth/window.innerHeight);
  }
  sizeGalaxyPlane();

  /* smoothed mouse-active factor, matching the original component's lerp-based fade in/out */
  let targetMouseActive = 0.0, smoothMouseActive = 0.0;

  /* ---- bright warm core glow (like a distant star/nebula heart), centered behind the wireframe shape ---- */
  const corePos = new THREE.Vector3(0, 0, -18);
  const glowFar = new THREE.Sprite(new THREE.SpriteMaterial({ map:createGlowTexture('#FF9D4D'), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.4 }));
  glowFar.scale.set(46, 46, 1); glowFar.position.copy(corePos);
  scene.add(glowFar);
  const glowMid = new THREE.Sprite(new THREE.SpriteMaterial({ map:createGlowTexture('#FFD9A8'), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.5 }));
  glowMid.scale.set(24, 24, 1); glowMid.position.copy(corePos);
  scene.add(glowMid);
  const glowHot = new THREE.Sprite(new THREE.SpriteMaterial({ map:createGlowTexture('#FFFFFF'), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.75 }));
  glowHot.scale.set(9, 9, 1); glowHot.position.copy(corePos);
  scene.add(glowHot);

  /* diffraction star-spikes crossing the bright core, like a camera-flare on a bright star */
  const spikeTex = createGlowTexture('#FFF6E8');
  const spikeGroup = new THREE.Group();
  [[3.2, 60], [60, 3.2]].forEach(([sx, sy])=>{
    const spikeMat = new THREE.SpriteMaterial({ map:spikeTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.45 });
    const spike = new THREE.Sprite(spikeMat);
    spike.scale.set(sx, sy, 1);
    spike.position.copy(corePos);
    spikeGroup.add(spike);
  });
  scene.add(spikeGroup);

  /* ---- ambient wireframe core — the retained central spherical shape ---- */
  const coreGeo = new THREE.IcosahedronGeometry(6, 1);
  const coreMat = new THREE.MeshBasicMaterial({ color:0x8B5CF6, wireframe:true, transparent:true, opacity:0.32 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.copy(corePos);
  scene.add(core);
  const coreGlowGeo = new THREE.IcosahedronGeometry(6.6, 1);
  const coreGlowMat = new THREE.MeshBasicMaterial({ color:0x3B82F6, wireframe:true, transparent:true, opacity:0.15 });
  const coreGlow = new THREE.Mesh(coreGlowGeo, coreGlowMat);
  coreGlow.position.copy(core.position);
  scene.add(coreGlow);

  /* ---- interaction + lifecycle ---- */
  let mouseNX = 0, mouseNY = 0, targetX = 0, targetY = 0;
  const GALAXY_STAR_SPEED = 0.2; // base starSpeed prop, matches the original component's config
  window.addEventListener('mousemove', e=>{
    mouseNX = (e.clientX/window.innerWidth - 0.5);
    mouseNY = (e.clientY/window.innerHeight - 0.5);
    galaxyMat.uniforms.uMouse.value.set(e.clientX/window.innerWidth, 1 - e.clientY/window.innerHeight);
    targetMouseActive = 1.0;
  }, { passive:true });

  const clock = new THREE.Clock();
  let frameId = null, isPaused = false, burstT = 0;

  function renderOnce(){ renderer.render(scene, camera); }

  function resize(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    sizeGalaxyPlane();
    if(reduceMotion) renderOnce();
  }
  window.addEventListener('resize', resize);

  function animate(){
    if(isPaused) return;
    const t = clock.getElapsedTime();
    galaxyMat.uniforms.uTime.value = t;
    galaxyMat.uniforms.uStarSpeed.value = (t * GALAXY_STAR_SPEED) / 10.0;
    smoothMouseActive += (targetMouseActive - smoothMouseActive) * 0.05;
    galaxyMat.uniforms.uMouseActiveFactor.value = smoothMouseActive;
    if(burstT > 0){ burstT -= 0.005; galaxyMat.uniforms.uBurst.value = Math.max(0, burstT); }

    targetX += (mouseNX - targetX) * 0.035;
    targetY += (mouseNY - targetY) * 0.035;
    camera.position.x = targetX * 6.5;
    camera.position.y = -targetY * 5;
    camera.lookAt(0, 0, -10);

    core.rotation.y += 0.0009;
    core.rotation.x += 0.0005;
    coreGlow.rotation.y -= 0.0006;

    const pulse = 1 + Math.sin(t*0.7)*0.06;
    glowHot.scale.set(9*pulse, 9*pulse, 1);
    spikeGroup.children.forEach(sp=> sp.material.opacity = 0.4 + Math.sin(t*0.7)*0.08);

    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  }
  function start(){
    isPaused = false;
    if(reduceMotion){ renderOnce(); return; }
    if(frameId) return;
    frameId = requestAnimationFrame(animate);
  }
  function stop(){
    isPaused = true;
    if(frameId){ cancelAnimationFrame(frameId); frameId = null; }
  }
  document.addEventListener('visibilitychange', ()=> document.hidden ? stop() : start());

  function burst(){ burstT = 2; }

  start();
  return { start, stop, burst };
}

/* ============================================================
   4. INTRO PARTICLE TUNNEL
   ============================================================ */
function initIntroCanvas(){
  const canvas = document.getElementById('intro-canvas');
  if(!canvas || typeof THREE === 'undefined') return null;
  let renderer;
  try{ renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true }); }
  catch(e){ return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 300);
  camera.position.set(0,0,0);

  const COUNT = window.innerWidth < 700 ? 500 : 900;
  const positions = new Float32Array(COUNT*3);
  const colors = new Float32Array(COUNT*3);
  const angles = new Float32Array(COUNT);
  const lens = new Float32Array(COUNT);
  // mostly white/pale for a realistic streak look, with a touch of brand color mixed in
  const palette = [new THREE.Color(0xffffff), new THREE.Color(0xffffff), new THREE.Color(0xE8E4FF), new THREE.Color(0x8B5CF6), new THREE.Color(0x3B82F6)];
  for(let i=0;i<COUNT;i++){
    const x = (Math.random()-0.5)*40;
    const y = (Math.random()-0.5)*40;
    positions[i*3]   = x;
    positions[i*3+1] = y;
    positions[i*3+2] = -Math.random()*220;
    const c = palette[Math.floor(Math.random()*palette.length)];
    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
    angles[i] = Math.atan2(y, x);
    const radial = Math.min(1, Math.hypot(x,y) / 28);
    lens[i] = 0.55 + radial*2.2 + Math.random()*0.6; // peripheral stars streak longer, like real warp/rain perspective
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors,3));
  geo.setAttribute('aAngle', new THREE.BufferAttribute(angles,1));
  geo.setAttribute('aLen', new THREE.BufferAttribute(lens,1));

  const mat = new THREE.ShaderMaterial({
    uniforms:{ uPixelRatio:{ value: Math.min(window.devicePixelRatio,1.5) } },
    vertexShader:`
      attribute vec3 aColor;
      attribute float aAngle;
      attribute float aLen;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAngle;
      void main(){
        vColor = aColor;
        vAngle = aAngle;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aLen * uPixelRatio * (340.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader:`
      varying vec3 vColor;
      varying float vAngle;
      void main(){
        vec2 uv = gl_PointCoord - 0.5;
        float s = sin(vAngle), c = cos(vAngle);
        vec2 ruv = vec2(c*uv.x - s*uv.y, s*uv.x + c*uv.y);
        float widthFalloff = smoothstep(0.10, 0.0, abs(ruv.y));
        float tailFade = 1.0 - smoothstep(0.05, 0.5, ruv.x);
        float headTaper = smoothstep(-0.5, -0.38, ruv.x);
        float alpha = widthFalloff * tailFade * headTaper;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  function resize(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  let frameId = null, speed = 0.35;
  function animate(){
    camera.position.z -= speed;
    const posAttr = geo.attributes.position;
    for(let i=0;i<COUNT;i++){
      if(posAttr.array[i*3+2] > camera.position.z + 5){
        posAttr.array[i*3+2] = camera.position.z - 200;
      }
    }
    posAttr.needsUpdate = true;
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  }
  function start(){ if(!frameId && !reduceMotion) frameId = requestAnimationFrame(animate); else if(reduceMotion) renderer.render(scene,camera); }
  function stop(){ if(frameId){ cancelAnimationFrame(frameId); frameId=null; } }
  function setSpeed(v){ speed = v; }
  start();
  return { start, stop, setSpeed };
}

/* ============================================================
   5. CINEMATIC INTRO SEQUENCE (GSAP word reveal timeline)
   ============================================================ */
function runIntro(){
  const introEl = document.getElementById('intro');
  const words = document.querySelectorAll('.intro-word');
  const skipBtn = document.getElementById('intro-skip');
  const progressEl = document.getElementById('intro-progress-bar');
  const introScene = initIntroCanvas();

  let finished = false;
  function finishIntro(){
    if(finished) return;
    finished = true;
    if(hasGSAP) gsap.killTweensOf(words);
    introEl.classList.add('hidden');
    introEl.setAttribute('aria-hidden', 'true');
    introEl.inert = true;
    if(document.activeElement && introEl.contains(document.activeElement)){
      document.activeElement.blur();
    }
    document.body.classList.remove('lock-scroll');
    if(introScene) setTimeout(()=>introScene.stop(), 1200);
    webglBg = initWebGLBackground();
    setTimeout(()=> document.getElementById('webgl-bg').classList.add('ready'), 60);
  }

  setTimeout(()=> skipBtn.classList.add('show'), 1200);
  skipBtn.addEventListener('click', finishIntro);
  document.addEventListener('keydown', function onceKey(e){
    if((e.key === 'Enter' || e.key === ' ') && !finished){ finishIntro(); }
  });
  introEl.addEventListener('click', e=>{ if(e.target === introEl) finishIntro(); });

  const safetyTimer = setTimeout(finishIntro, 13000);

  if(!hasGSAP){
    introEl.classList.add('show-mark');
    setTimeout(finishIntro, 2200);
    return;
  }

  const tl = gsap.timeline({ delay:0.5, onComplete:()=>{ clearTimeout(safetyTimer); finishIntro(); } });
  tl.to(progressEl, { width:'100%', duration: words.length*1.7 + 0.6, ease:'none' }, 0);
  tl.call(()=> introEl.classList.add('show-mark'), null, 0.2);

  words.forEach((word, i)=>{
    if(introScene) tl.call(()=> introScene.setSpeed(0.3 + i*0.18), null, `+=${i===0?0:0}`);
    tl.fromTo(word, { opacity:0, scale:0.7, filter:'blur(22px)', y:36 },
                     { opacity:1, scale:1, filter:'blur(0px)', y:0, duration:0.85, ease:'power3.out' });
    tl.to(word, { opacity:0, scale:1.12, filter:'blur(14px)', y:-28, duration:0.55, ease:'power2.in' }, '+=0.5');
  });
}

/* ============================================================
   7. PROFILE CARD (React Bits component, ported to vanilla JS)
   ============================================================ */
function pcClamp(v, min=0, max=100){ return Math.min(Math.max(v,min),max); }
function pcRound(v, precision=3){ return parseFloat(v.toFixed(precision)); }
function pcAdjust(v, fMin, fMax, tMin, tMax){ return pcRound(tMin + ((tMax-tMin)*(v-fMin))/(fMax-fMin)); }

function makeMonogramAvatar(){
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8B5CF6"/>
        <stop offset="1" stop-color="#3B82F6"/>
      </linearGradient>
    </defs>
    <rect width="400" height="500" fill="url(#g)"/>
    <circle cx="200" cy="195" r="230" fill="#ffffff" fill-opacity="0.07"/>
    <text x="200" y="255" font-family="'Space Grotesk', sans-serif" font-size="150" font-weight="700" fill="#ffffff" text-anchor="middle">KR</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function initProfileCard(wrap){
  if(!wrap) return;
  const shell = wrap.querySelector('.pc-card-shell');
  if(!shell) return;

  let rafId = null, running = false, lastTs = 0;
  let currentX = 0, currentY = 0, targetX = 0, targetY = 0;
  const DEFAULT_TAU = 0.14, INITIAL_TAU = 0.6;
  let initialUntil = 0;

  /* cache shell dimensions instead of reading clientWidth/clientHeight every
     animation frame — that read-after-write pattern forces a synchronous
     layout recalc each frame while dragging (confirmed via Lighthouse's
     forced-reflow audit). Size only actually changes on resize. */
  let cachedWidth = shell.clientWidth || 1;
  let cachedHeight = shell.clientHeight || 1;
  window.addEventListener('resize', ()=>{
    cachedWidth = shell.clientWidth || 1;
    cachedHeight = shell.clientHeight || 1;
  });

  function setVarsFromXY(x, y){
    const width = cachedWidth;
    const height = cachedHeight;
    const percentX = pcClamp((100/width)*x);
    const percentY = pcClamp((100/height)*y);
    const centerX = percentX - 50;
    const centerY = percentY - 50;
    const properties = {
      '--pointer-x': percentX+'%',
      '--pointer-y': percentY+'%',
      '--background-x': pcAdjust(percentX,0,100,35,65)+'%',
      '--background-y': pcAdjust(percentY,0,100,35,65)+'%',
      '--pointer-from-center': pcClamp(Math.hypot(percentY-50,percentX-50)/50,0,1),
      '--pointer-from-top': percentY/100,
      '--pointer-from-left': percentX/100,
      '--rotate-x': pcRound(-(centerX/5))+'deg',
      '--rotate-y': pcRound(centerY/4)+'deg'
    };
    for(const k in properties) wrap.style.setProperty(k, properties[k]);
  }

  function step(ts){
    if(!running) return;
    if(lastTs === 0) lastTs = ts;
    const dt = (ts-lastTs)/1000;
    lastTs = ts;
    const tau = ts < initialUntil ? INITIAL_TAU : DEFAULT_TAU;
    const k = 1 - Math.exp(-dt/tau);
    currentX += (targetX-currentX)*k;
    currentY += (targetY-currentY)*k;
    setVarsFromXY(currentX, currentY);
    const stillFar = Math.abs(targetX-currentX) > 0.05 || Math.abs(targetY-currentY) > 0.05;
    if(stillFar || document.hasFocus()){ rafId = requestAnimationFrame(step); }
    else { running = false; lastTs = 0; if(rafId){ cancelAnimationFrame(rafId); rafId = null; } }
  }
  function start(){ if(running) return; running = true; lastTs = 0; rafId = requestAnimationFrame(step); }
  function setTarget(x,y){ targetX = x; targetY = y; start(); }
  function setImmediate(x,y){ currentX = x; currentY = y; setVarsFromXY(currentX, currentY); }
  function toCenter(){ setTarget(cachedWidth/2, cachedHeight/2); }
  function beginInitial(durationMs){ initialUntil = performance.now() + durationMs; start(); }
  function getOffsets(evt){
    const rect = shell.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  let enterTimer = null, leaveRaf = null;
  shell.addEventListener('pointerenter', e=>{
    shell.classList.add('active','entering');
    if(enterTimer) clearTimeout(enterTimer);
    enterTimer = setTimeout(()=> shell.classList.remove('entering'), 180);
    const { x, y } = getOffsets(e);
    setTarget(x, y);
  });
  shell.addEventListener('pointermove', e=>{
    const { x, y } = getOffsets(e);
    setTarget(x, y);
  });
  shell.addEventListener('pointerleave', ()=>{
    toCenter();
    function checkSettle(){
      const settled = Math.hypot(targetX-currentX, targetY-currentY) < 0.6;
      if(settled){ shell.classList.remove('active'); leaveRaf = null; }
      else{ leaveRaf = requestAnimationFrame(checkSettle); }
    }
    if(leaveRaf) cancelAnimationFrame(leaveRaf);
    leaveRaf = requestAnimationFrame(checkSettle);
  });

  const initialX = (cachedWidth || 0) - 70;
  const initialY = 60;
  setImmediate(initialX, initialY);
  toCenter();
  beginInitial(1200);
}

const avatarSrc = makeMonogramAvatar();
const profileAvatar = document.getElementById('profile-avatar');
const profileMiniAvatar = document.getElementById('profile-mini-avatar');
if(profileAvatar) profileAvatar.src = avatarSrc;
if(profileMiniAvatar) profileMiniAvatar.src = avatarSrc;
initProfileCard(document.getElementById('profile-card'));
document.getElementById('profile-contact-btn')?.addEventListener('click', ()=>{
  window.location.href = 'mailto:rishendrakalluri24@gmail.com';
  navigator.clipboard?.writeText('rishendrakalluri24@gmail.com').catch(()=>{});
  showToast2('Email copied — rishendrakalluri24@gmail.com');
});

/* ============================================================
   7b. CONTENT — real resume data
   ============================================================ */
const skillGroups = [
  { name:'Programming Languages', items:['C','C++','Python'] },
  { name:'Web Technologies', items:['HTML','CSS','JavaScript','React'] },
  { name:'Databases', items:['MySQL','MongoDB'] },
  { name:'Frameworks', items:['Flask','Django','Node.js'] },
  { name:'Tools', items:['Git','GitHub','VS Code'] },
  { name:'Soft Skills', items:['Communication','Teamwork'] },
];
document.getElementById('skills-cols').innerHTML = `<div class="skills-cat-grid">` +
  skillGroups.map(g => `
    <div class="skills-cat reveal">
      <h3>${g.name}</h3>
      <div class="skills-badges">${g.items.map(s => `<span class="skill-badge2"><span class="dot2"></span>${s}</span>`).join('')}</div>
    </div>
  `).join('') + `</div>`;

const iconAttendance = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const iconTimetable = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
const iconInventory = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 8L12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>`;
const arrowSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M7 7h10v10"/></svg>`;

const projectsData2 = [
  {
    icon: iconAttendance, title:'Automated Student Attendance Monitoring System', tech:['Python','OpenCV'],
    points:['Developed an automated system to track and record student attendance using digital inputs','Implemented features to reduce manual errors and improve accuracy of attendance data','Designed a user-friendly interface for easy monitoring and report generation'],
    link:'https://github.com/Rishendra24'
  },
  {
    icon: iconTimetable, title:'Time Table Management System', tech:['HTML','CSS','JavaScript','MySQL'],
    points:['Developed a full-stack web application to manage class schedules, subject allocations and faculty assignments','Built a database-driven system to generate, store and update timetable information accurately','Implemented user-friendly features for timetable creation and schedule tracking'],
    link:'https://github.com/Rishendra24'
  },
  {
    icon: iconInventory, title:'Inventory and Order Management System', tech:['Python','Flask','MySQL'],
    points:['Developed a full-stack web application to manage inventory and process customer orders efficiently','Implemented features for product tracking, order placement and real-time stock updates','Integrated user-friendly interfaces and backend functionality to streamline workflow'],
    link:'https://github.com/Rishendra24'
  },
];
document.getElementById('proj-track').innerHTML = projectsData2.map(p => `
  <article class="proj-card2 card">
    <div class="proj-top2">
      <div class="proj-icon2">${p.icon}</div>
      <a href="${p.link}" target="_blank" rel="noopener" class="proj-arrow2" aria-label="View ${p.title} on GitHub">${arrowSvg}</a>
    </div>
    <h3 class="proj-title2">${p.title}</h3>
    <div class="proj-desc2"><ul>${p.points.map(pt=>`<li>${pt}</li>`).join('')}</ul></div>
    <div class="proj-tags2">${p.tech.map(t=>`<span class="tag2">${t}</span>`).join('')}</div>
  </article>
`).join('');
/* Note: exact GitHub repo URLs weren't extractable from the PDF (just "GitHub Repository" text),
   so each currently links to the main profile — replace p.link above with the real repo URLs. */

document.getElementById('timeline2').innerHTML = `
  <div class="tl2-item reveal">
    <div class="tl2-dot"></div>
    <span class="tl2-date">May 2026 — July 2026</span>
    <h3>Artificial Intelligence and Machine Learning Intern</h3>
    <div class="tl2-org">SmartBridge Indonesia · Remote</div>
    <ul>
      <li>Built a machine learning model using Python to predict loan eligibility based on income, credit history and employment details, integrated into a Django-based web application</li>
      <li>Preprocessed and cleaned applicant datasets, engineering relevant features to improve model prediction accuracy</li>
      <li>Deployed the application on IBM Cloud, enabling real-time loan approval predictions through a web interface</li>
    </ul>
  </div>
`;

const certIconTrophy = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="6"/><path d="M9 14l-2 7 5-3 5 3-2-7"/></svg>`;
const certsData2 = [
  { title:'MongoDB Certified Associate Developer', issuer:'MongoDB · 2026' },
  { title:'AI and ML Engineer', issuer:'SmartBridge Indonesia · 2026' },
];
document.getElementById('cert-grid2').innerHTML = certsData2.map(c => `
  <div class="cert-card2 card reveal">
    <div class="cert-icon2">${certIconTrophy}</div>
    <div>
      <h3>${c.title}</h3>
      <div class="cert-issuer2">${c.issuer}</div>
    </div>
  </div>
`).join('');

/* ============================================================
   7c. NAV, SCROLL PROGRESS, REVEAL, BACK-TO-TOP
   ============================================================ */
const header2 = document.getElementById('site-header');
const navLinks2 = document.querySelectorAll('.nav-link');
const sectionEls2 = ['hero-section','about','projects','skills','experience','certifications','contact'].map(id=>document.getElementById(id)).filter(Boolean);
const progressBar2 = document.getElementById('scroll-progress2');
const backToTop2 = document.getElementById('back-to-top2');

let _scrollTicking2 = false;
function onScroll2(){
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  progressBar2.style.width = (docHeight>0 ? (scrollTop/docHeight)*100 : 0) + '%';
  header2.classList.toggle('scrolled', scrollTop > 30);
  backToTop2.classList.toggle('show', scrollTop > window.innerHeight * 0.6);

  let current = sectionEls2[0]?.id;
  sectionEls2.forEach(sec=>{ if(scrollTop >= sec.offsetTop - 200) current = sec.id; });
  navLinks2.forEach(link=>{
    const isActive = link.dataset.target === current;
    link.classList.toggle('active', isActive);
    if(isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('scroll', ()=>{
  if(_scrollTicking2) return;
  _scrollTicking2 = true;
  requestAnimationFrame(()=>{ onScroll2(); _scrollTicking2 = false; });
}, { passive:true });
onScroll2();

backToTop2.addEventListener('click', ()=> window.scrollTo({ top:0, behavior: reduceMotion ? 'auto' : 'smooth' }));

/* toast helper */
const toast2 = document.getElementById('toast2');
const toast2Text = document.getElementById('toast2-text');
let toast2Timer = null;
function showToast2(msg){
  toast2Text.textContent = msg;
  toast2.classList.add('show');
  clearTimeout(toast2Timer);
  toast2Timer = setTimeout(()=> toast2.classList.remove('show'), 2800);
}

/* section navigation — JS-driven scrollIntoView rather than native #hash navigation,
   which is more reliable across embedded/preview contexts */
function goToSection2(id){
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block:'start' });
}
document.getElementById('logo-btn')?.addEventListener('click', ()=> goToSection2('hero-section'));

const navToggle2 = document.getElementById('nav-toggle');
const navLinksEl2 = document.getElementById('nav-links');
const navBackdrop2 = document.getElementById('nav-backdrop');
function closeMobileNav2(){
  navLinksEl2.classList.remove('open');
  navBackdrop2.classList.remove('show');
  navToggle2.setAttribute('aria-expanded','false');
}
navToggle2.addEventListener('click', ()=>{
  const isOpen = navLinksEl2.classList.toggle('open');
  navBackdrop2.classList.toggle('show', isOpen);
  navToggle2.setAttribute('aria-expanded', String(isOpen));
});
navBackdrop2.addEventListener('click', closeMobileNav2);
navLinks2.forEach(link=> link.addEventListener('click', ()=>{
  goToSection2(link.dataset.target);
  closeMobileNav2();
}));

const revealObserver2 = new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){ entry.target.classList.add('is-visible'); revealObserver2.unobserve(entry.target); }
  });
},{threshold:0.12});
document.querySelectorAll('.reveal').forEach(el=>revealObserver2.observe(el));

/* ============================================================
   7d. PROJECTS — horizontal drag-to-scroll track
   ============================================================ */
(function initProjectsTrack(){
  const track = document.getElementById('proj-track');
  if(!track) return;
  let isDown = false, startX = 0, scrollStart = 0, moved = 0, didDrag = false;

  track.addEventListener('mousedown', e=>{
    isDown = true; moved = 0; didDrag = false;
    track.classList.add('dragging');
    startX = e.pageX; scrollStart = track.scrollLeft;
  });

  function onMove(e){
    if(!isDown) return;
    const dx = e.pageX - startX;
    moved = Math.max(moved, Math.abs(dx));
    if(moved > 6){ didDrag = true; }
    if(didDrag){
      e.preventDefault();
      track.scrollLeft = scrollStart - dx * 1.4;
    }
  }
  function onUp(){
    if(!isDown) return;
    isDown = false;
    track.classList.remove('dragging');
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  track.addEventListener('mouseleave', ()=>{ if(isDown && !didDrag){ isDown = false; track.classList.remove('dragging'); } });

  /* only suppress the click on project links if the gesture was an actual drag */
  track.addEventListener('click', e=>{
    if(didDrag){ e.preventDefault(); e.stopPropagation(); didDrag = false; }
  }, true);

  document.getElementById('track-prev')?.addEventListener('click', ()=> track.scrollBy({ left:-380, behavior:'smooth' }));
  document.getElementById('track-next')?.addEventListener('click', ()=> track.scrollBy({ left:380, behavior:'smooth' }));
})();

/* ============================================================
   7e. CONTACT FORM
   ============================================================ */
(function initContactForm(){
  const form = document.getElementById('contact-form');
  if(!form) return;
  const status = document.getElementById('form-status');
  form.addEventListener('submit', e=>{
    e.preventDefault();
    const name = form.name.value.trim(), email = form.email.value.trim();
    const subject = form.subject.value.trim(), message = form.message.value.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if(!name || !email || !subject || !message){
      status.textContent = 'Please fill in every field before sending.'; status.className = 'form-status err'; return;
    }
    if(!emailOk){ status.textContent = "That email address doesn't look right."; status.className = 'form-status err'; return; }
    status.textContent = 'Sending…'; status.className = 'form-status';
    setTimeout(()=>{
      status.textContent = `Thanks, ${name.split(' ')[0]} — your message has been queued.`;
      status.className = 'form-status ok';
      form.reset();
    }, 800);
  });
})();

/* ============================================================
   7f. CONTACT LINK FALLBACKS (copy-to-clipboard alongside mailto/tel,
       in case the protocol handler is blocked in a preview context)
   ============================================================ */
function wireContactFallback(id, value, label){
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('click', ()=>{
    navigator.clipboard?.writeText(value).catch(()=>{});
    showToast2(`${label} copied — ${value}`);
  });
}
wireContactFallback('contact-email-link', 'rishendrakalluri24@gmail.com', 'Email');
wireContactFallback('contact-tel-link', '+91-9030536659', 'Phone');
wireContactFallback('social-email-link', 'rishendrakalluri24@gmail.com', 'Email');

/* ============================================================
   8. INIT
   ============================================================ */
runIntro();
