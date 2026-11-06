import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Agent, AgentStatus, Task } from '../core/models';
import { BubbleKind, drawBubble, drawLabel, drawScreen, makeCanvas, roundRect } from './canvas-textures';
import { CharacterRig, buildCharacter, disposeObject } from './character-factory';

const COLS = 4;
const SPACING_X = 3.3;
const SPACING_Z = 3.1;
const FIRST_ROW_Z = -1.6;

interface Station {
  agent: Agent;
  lookKey: string;
  group: THREE.Group;
  rig: CharacterRig;
  hitbox: THREE.Mesh;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  label: { sprite: THREE.Sprite; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  bubble: { sprite: THREE.Sprite; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; kind?: BubbleKind; tick: number };
  screen: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; lastDraw: number };
  status: AgentStatus;
  since: number;
  progress: number;
  message?: string;
  phase: number;
  nextBlink: number;
}

interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; }

/**
 * Escritório 3D: uma mesa por agente. Reage ao estado de cada agente
 * (recebendo, pensando, trabalhando, concluído, erro) com animações e balões.
 */
export class OfficeScene {
  onSelect: (agentId: number | null) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private stations = new Map<number, Station>();
  private particles: Particle[] = [];
  private particleGeo = new THREE.BoxGeometry(0.07, 0.07, 0.02);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private selectedId: number | null = null;
  private hoverId: number | null = null;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private clockHands!: { hour: THREE.Object3D; minute: THREE.Object3D };
  private board!: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private disposed = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#17130f');
    this.scene.fog = new THREE.Fog('#17130f', 26, 46);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 8.2, 11.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.2, -0.4);
    this.controls.enableDamping = true;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 28;
    this.controls.maxPolarAngle = 1.25;
    this.controls.minAzimuthAngle = -1.1;
    this.controls.maxAzimuthAngle = 1.1;

    this.buildLights();
    this.buildRoom();

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('click', this.onClick);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ---------------------------------------------------------------- API pública

  /** Sincroniza as mesas com a lista de agentes (cria, remove e atualiza). */
  setAgents(agents: Agent[]) {
    const ids = new Set(agents.map(a => a.id));
    for (const [id, st] of this.stations) {
      if (!ids.has(id)) this.removeStation(id, st);
    }
    for (const agent of agents) {
      const st = this.stations.get(agent.id);
      const key = lookKey(agent);
      if (!st || st.lookKey !== key || st.agent.deskIndex !== agent.deskIndex) {
        if (st) this.removeStation(agent.id, st);
        this.addStation(agent);
      } else {
        st.agent = agent;
        this.setStatus(st, agent.status);
        drawLabel(st.label.ctx, agent.name, st.status, this.selectedId === agent.id);
        st.label.texture.needsUpdate = true;
      }
    }
    this.updateBoard();
  }

  /** Progresso/mensagem da tarefa ativa de um agente. */
  setTask(agentId: number, task: Task | undefined, message?: string) {
    const st = this.stations.get(agentId);
    if (!st) return;
    st.progress = task?.progress ?? 0;
    if (message !== undefined) st.message = message;
    if (st.status === 'TRABALHANDO') this.showBubble(st, 'progresso');
  }

  select(agentId: number | null) {
    const prev = this.selectedId;
    this.selectedId = agentId;
    for (const id of [prev, agentId]) {
      const st = id != null ? this.stations.get(id) : undefined;
      if (!st) continue;
      drawLabel(st.label.ctx, st.agent.name, st.status, id === agentId);
      st.label.texture.needsUpdate = true;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('click', this.onClick);
    this.controls.dispose();
    disposeObject(this.scene);
    this.renderer.dispose();
    el.remove();
  }

  // ---------------------------------------------------------------- estações

  private deskPosition(index: number) {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    return new THREE.Vector3((col - (COLS - 1) / 2) * SPACING_X, 0, FIRST_ROW_Z + row * SPACING_Z);
  }

  private addStation(agent: Agent) {
    const group = new THREE.Group();
    group.position.copy(this.deskPosition(agent.deskIndex));
    this.scene.add(group);

    // tapete/anel de status
    const ringMat = new THREE.MeshBasicMaterial({
      color: agent.color, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(roundedRectGeometry(2.7, 2.4, 0.35), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.012, -0.35);
    group.add(ring);

    group.add(buildDesk());

    // monitor com tela dinâmica
    const screen = makeCanvas(256, 160);
    const monitor = buildMonitor(screen.texture);
    monitor.position.set(-0.55, 0.8, -0.08);
    monitor.rotation.y = 0.3;
    group.add(monitor);

    // cadeira + personagem
    const chair = buildChair();
    chair.position.set(0.15, 0, -0.95);
    group.add(chair);
    const rig = buildCharacter(agent);
    rig.root.position.set(0.15, 0.42, -0.85);
    rig.root.scale.setScalar(0.95);
    group.add(rig.root);

    // etiqueta na frente da mesa
    const labelTex = makeCanvas(320, 100);
    const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex.texture, depthWrite: false }));
    labelSprite.scale.set(1.6, 0.5, 1);
    labelSprite.position.set(0, 1.05, 0.62);
    labelSprite.renderOrder = 2;
    group.add(labelSprite);

    // balão de feedback
    const bubbleTex = makeCanvas(160, 160);
    const bubbleSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex.texture, depthWrite: false, depthTest: false }));
    bubbleSprite.scale.set(0, 0, 1);
    bubbleSprite.position.set(0.15, 0.42 + rig.height + 0.45, -0.85);
    bubbleSprite.renderOrder = 3;
    group.add(bubbleSprite);

    // caixa invisível para clique/hover
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hitbox.position.set(0, 1.1, -0.35);
    hitbox.userData['agentId'] = agent.id;
    group.add(hitbox);

    const st: Station = {
      agent, lookKey: lookKey(agent), group, rig, hitbox, ring, ringMat,
      label: { sprite: labelSprite, ...labelTex },
      bubble: { sprite: bubbleSprite, ...bubbleTex, tick: 0 },
      screen: { ...screen, lastDraw: -1 },
      status: 'DISPONIVEL', since: this.clock.elapsedTime, progress: 0,
      phase: Math.random() * Math.PI * 2, nextBlink: Math.random() * 4,
    };
    this.stations.set(agent.id, st);
    this.setStatus(st, agent.status, true);
    drawLabel(st.label.ctx, agent.name, st.status, this.selectedId === agent.id);
    st.label.texture.needsUpdate = true;
  }

  private removeStation(id: number, st: Station) {
    this.scene.remove(st.group);
    disposeObject(st.group);
    this.stations.delete(id);
  }

  private setStatus(st: Station, status: AgentStatus, initial = false) {
    if (st.status === status && !initial) return;
    st.status = status;
    st.since = this.clock.elapsedTime;
    st.screen.lastDraw = -1;
    drawLabel(st.label.ctx, st.agent.name, status, this.selectedId === st.agent.id);
    st.label.texture.needsUpdate = true;
    switch (status) {
      case 'RECEBENDO': this.showBubble(st, 'alerta'); st.progress = 0; st.message = 'Nova tarefa!'; break;
      case 'PENSANDO': this.showBubble(st, 'pensando'); break;
      case 'TRABALHANDO': this.showBubble(st, 'progresso'); break;
      case 'CONCLUIDO':
        st.progress = 100;
        this.showBubble(st, 'ok');
        if (!initial) this.burst(st);
        break;
      case 'ERRO': this.showBubble(st, 'erro'); break;
      default: st.bubble.kind = undefined; st.message = undefined;
    }
  }

  private showBubble(st: Station, kind: BubbleKind) {
    const changed = st.bubble.kind !== kind;
    st.bubble.kind = kind;
    drawBubble(st.bubble.ctx, kind, st.agent.color, st.progress, st.bubble.tick);
    st.bubble.texture.needsUpdate = true;
    if (changed) st.bubble.sprite.userData['popAt'] = this.clock.elapsedTime;
  }

  private burst(st: Station) {
    const origin = new THREE.Vector3();
    st.rig.root.getWorldPosition(origin);
    origin.y += st.rig.height;
    const palette = [st.agent.color, '#57c78a', '#f2c14e', '#ffffff', '#f08a5d'];
    for (let i = 0; i < 46; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: palette[i % palette.length], transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(origin);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 1.8;
      const vel = new THREE.Vector3(Math.cos(angle) * speed, 3 + Math.random() * 2.5, Math.sin(angle) * speed);
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, life: 1.6 + Math.random() * 0.6 });
    }
  }

  // ---------------------------------------------------------------- animação

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    for (const st of this.stations.values()) this.animateStation(st, t);
    this.animateParticles(dt);
    this.animateClock();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private animateStation(st: Station, t: number) {
    const { rig } = st;
    const age = t - st.since;
    rig.bob.position.set(0, 0, 0);
    rig.bob.rotation.set(0, 0, 0);
    let ringTarget = 0.08;
    let tipGlow = 0.3;

    switch (st.status) {
      case 'DISPONIVEL':
        rig.bob.position.y = Math.sin(t * 2 + st.phase) * 0.02;
        break;
      case 'RECEBENDO':
        rig.bob.position.y = Math.abs(Math.sin(age * 9)) * 0.28 * Math.max(0, 1 - age / 1.6);
        ringTarget = 0.35 + Math.sin(t * 12) * 0.15;
        tipGlow = 1.5;
        break;
      case 'PENSANDO':
        rig.bob.rotation.z = Math.sin(t * 3 + st.phase) * 0.09;
        rig.bob.position.y = 0.03 + Math.sin(t * 1.5) * 0.02;
        ringTarget = 0.22;
        tipGlow = 0.8 + Math.sin(t * 6) * 0.7;
        if (Math.floor(t * 2.5) !== st.bubble.tick) {
          st.bubble.tick = Math.floor(t * 2.5);
          this.showBubble(st, 'pensando');
        }
        break;
      case 'TRABALHANDO':
        rig.bob.position.y = Math.abs(Math.sin(t * 16 + st.phase)) * 0.035;
        rig.bob.rotation.y = -0.25 + Math.sin(t * 0.8) * 0.06; // olhando para o monitor
        ringTarget = 0.28 + Math.sin(t * 4) * 0.08;
        tipGlow = 1.6;
        break;
      case 'CONCLUIDO':
        rig.bob.position.y = Math.abs(Math.sin(age * 6)) * 0.22 * Math.max(0, 1 - age / 2);
        rig.bob.rotation.y = Math.min(1, age / 0.8) * Math.PI * 2;
        ringTarget = 0.4 * Math.max(0.2, 1 - age / 2.5);
        tipGlow = 1.2;
        break;
      case 'ERRO':
        rig.bob.position.x = Math.sin(age * 40) * 0.04 * Math.max(0, 1 - age);
        rig.bob.rotation.z = -0.12;
        ringTarget = 0.25;
        break;
    }

    // selecionado/hover realça o tapete
    if (this.selectedId === st.agent.id) ringTarget = Math.max(ringTarget, 0.32);
    else if (this.hoverId === st.agent.id) ringTarget = Math.max(ringTarget, 0.2);
    st.ringMat.opacity += (ringTarget - st.ringMat.opacity) * 0.15;
    if (st.status === 'ERRO') st.ringMat.color.set('#e25b5b');
    else st.ringMat.color.set(st.agent.color);

    for (const tip of rig.antennaTips) {
      (tip.material as THREE.MeshStandardMaterial).emissiveIntensity = tipGlow;
    }

    // piscar
    if (t > st.nextBlink) {
      rig.eyes.scale.y = 0.15;
      if (t > st.nextBlink + 0.12) {
        rig.eyes.scale.y = 1;
        st.nextBlink = t + 2.5 + Math.random() * 3.5;
      }
    }

    // balão: aparece com "pop" e some quando disponível
    const bubble = st.bubble.sprite;
    const target = st.bubble.kind ? 1.1 : 0;
    const popAt = bubble.userData['popAt'] as number | undefined;
    const pop = popAt !== undefined && t - popAt < 0.35 ? 1 + Math.sin(((t - popAt) / 0.35) * Math.PI) * 0.35 : 1;
    const s = bubble.scale.x + (target * pop - bubble.scale.x) * 0.2;
    bubble.scale.set(s, s, 1);
    bubble.position.y = 0.42 + rig.height + 0.45 + Math.sin(t * 3) * 0.04;

    // tela do monitor (~12 fps quando ativa)
    const active = st.status !== 'DISPONIVEL';
    if (st.screen.lastDraw < 0 || (active && t - st.screen.lastDraw > 0.08)) {
      drawScreen(st.screen.ctx, st.status, st.agent.color, st.progress, t, st.message);
      st.screen.texture.needsUpdate = true;
      st.screen.lastDraw = t;
    }
  }

  private animateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 7 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;
      if (p.mesh.position.y < 0.03) { p.mesh.position.y = 0.03; p.vel.set(0, 0, 0); }
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life * 2);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  private animateClock() {
    const now = new Date();
    const min = now.getMinutes() + now.getSeconds() / 60;
    const hour = (now.getHours() % 12) + min / 60;
    this.clockHands.minute.rotation.z = -(min / 60) * Math.PI * 2;
    this.clockHands.hour.rotation.z = -(hour / 12) * Math.PI * 2;
  }

  private updateBoard() {
    const { ctx, texture } = this.board;
    const all = [...this.stations.values()];
    const busy = all.filter(s => s.status !== 'DISPONIVEL').length;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = busy ? '#f08a5d' : '#57c78a';
    ctx.font = '700 34px Inter, sans-serif';
    ctx.fillText(busy ? `${busy} agente${busy > 1 ? 's' : ''} trabalhando` : 'Time disponível', 28, 60);
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '500 22px Inter, sans-serif';
    ctx.fillText(`${all.length} agentes no escritório`, 28, 100);
    all.slice(0, 16).forEach((s, i) => {
      ctx.fillStyle = s.status === 'DISPONIVEL' ? 'rgba(255,255,255,0.18)' : s.agent.color;
      ctx.beginPath();
      ctx.arc(40 + i * 30, 150, 10, 0, Math.PI * 2);
      ctx.fill();
    });
    texture.needsUpdate = true;
  }

  // ---------------------------------------------------------------- interação

  private pick(ev: PointerEvent | MouseEvent): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.stations.values()].map(s => s.hitbox), false);
    return hits.length ? (hits[0].object.userData['agentId'] as number) : null;
  }

  private onPointerMove = (ev: PointerEvent) => {
    this.hoverId = this.pick(ev);
    this.renderer.domElement.style.cursor = this.hoverId != null ? 'pointer' : 'grab';
  };

  private onClick = (ev: MouseEvent) => {
    const id = this.pick(ev);
    this.select(id);
    this.onSelect(id);
  };

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // em telas estreitas, afasta a câmera para caber as 4 colunas
    this.camera.fov = w / h < 1 ? 66 : 45;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- cenário

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#ffe9d2', '#2a1f18', 1.1));
    const sun = new THREE.DirectionalLight('#ffd9b0', 2.2);
    sun.position.set(-8, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 1; c.far = 40;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const fill = new THREE.PointLight('#ff9a5c', 18, 20, 1.6);
    fill.position.set(0, 6, -3);
    this.scene.add(fill);
  }

  private buildRoom() {
    const floorMat = new THREE.MeshStandardMaterial({ color: '#4a3527', roughness: 0.85 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 20), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 3;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // tábuas
    const plankMat = new THREE.LineBasicMaterial({ color: '#3b2a1f' });
    const pts: THREE.Vector3[] = [];
    for (let x = -13; x <= 13; x += 0.9) pts.push(new THREE.Vector3(x, 0.005, -7), new THREE.Vector3(x, 0.005, 13));
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), plankMat));

    const wallMat = new THREE.MeshStandardMaterial({ color: '#2b2420', roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 0.3), wallMat);
    back.position.set(0, 3.5, -7);
    back.receiveShadow = true;
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 20), wallMat);
    left.position.set(-13, 3.5, 3);
    left.receiveShadow = true;
    this.scene.add(back, left);

    // rodapé
    const trimMat = new THREE.MeshStandardMaterial({ color: '#1d1815' });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(26, 0.25, 0.1), trimMat);
    trim.position.set(0, 0.12, -6.8);
    this.scene.add(trim);

    // letreiro
    const sign = makeCanvas(1024, 256);
    const g = sign.ctx;
    g.fillStyle = '#1a1512';
    roundRect(g, 0, 0, 1024, 256, 26); g.fill();
    g.textAlign = 'center';
    g.fillStyle = '#ffe9d6';
    g.font = '700 104px Inter, sans-serif';
    g.shadowColor = '#f08a5d'; g.shadowBlur = 28;
    g.fillText('Estúdio de Agentes', 512, 140);
    g.shadowBlur = 0;
    g.fillStyle = '#b8a594';
    g.font = '600 30px Inter, sans-serif';
    g.fillText('E S C R I T Ó R I O   E M   T E M P O   R E A L', 512, 205);
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: sign.texture }));
    signMesh.position.set(1.5, 4.6, -6.82);
    this.scene.add(signMesh);

    // quadro de status
    this.board = makeCanvas(512, 200);
    const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.33), new THREE.MeshBasicMaterial({ map: this.board.texture }));
    boardMesh.position.set(-5.2, 4.3, -6.81);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.5, 0.08), trimMat);
    frame.position.set(-5.2, 4.3, -6.88);
    this.scene.add(frame, boardMesh);

    // relógio
    const clock = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 40), new THREE.MeshStandardMaterial({ color: '#f4efe8' }));
    face.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 40), trimMat);
    const handMat = new THREE.MeshBasicMaterial({ color: '#222' });
    const hour = new THREE.Group();
    const hourMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), handMat);
    hourMesh.position.y = 0.15; hour.add(hourMesh); hour.position.z = 0.06;
    const minute = new THREE.Group();
    const minMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.02), handMat);
    minMesh.position.y = 0.22; minute.add(minMesh); minute.position.z = 0.07;
    clock.add(face, rim, hour, minute);
    clock.position.set(7.8, 4.9, -6.8);
    this.scene.add(clock);
    this.clockHands = { hour, minute };

    // janelas na parede esquerda
    const glassMat = new THREE.MeshBasicMaterial({ color: '#c9dcf2' });
    for (const z of [-3.5, 0.5]) {
      const win = new THREE.Group();
      const frameW = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 2.4), trimMat);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), glassMat);
      glass.rotation.y = Math.PI / 2; glass.position.x = 0.07;
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, 0.06), trimMat);
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 2.2), trimMat);
      win.add(frameW, glass, barV, barH);
      win.position.set(-12.83, 3.6, z);
      this.scene.add(win);
    }
    const windowLight = new THREE.PointLight('#bcd4ff', 10, 12, 1.5);
    windowLight.position.set(-11, 3.5, -1.5);
    this.scene.add(windowLight);

    // área de descanso: sofá, mesa redonda, planta, bebedouro
    const sofaMat = new THREE.MeshStandardMaterial({ color: '#34425f', roughness: 0.8 });
    const sofa = new THREE.Group();
    const seat = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.45, 3.4, 2, 0.12), sofaMat);
    seat.position.y = 0.32;
    const backrest = new THREE.Mesh(new RoundedBoxGeometry(0.35, 0.85, 3.4, 2, 0.12), sofaMat);
    backrest.position.set(-0.5, 0.65, 0);
    for (const z of [-1.6, 1.6]) {
      const arm = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.6, 0.3, 2, 0.1), sofaMat);
      arm.position.set(0, 0.45, z);
      sofa.add(arm);
    }
    sofa.add(seat, backrest);
    sofa.position.set(-11.7, 0, 5.5);
    shadowAll(sofa);
    this.scene.add(sofa);

    const woodMat = new THREE.MeshStandardMaterial({ color: '#8a5a3a', roughness: 0.6 });
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 40), woodMat);
    top.position.y = 0.72;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.25, 0.7, 16), trimMat);
    leg.position.y = 0.36;
    for (const [x, z, r] of [[-0.3, 0.1, 0.3], [0.35, -0.25, -0.4]]) {
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.01, 0.56), new THREE.MeshStandardMaterial({ color: '#f1ece4' }));
      paper.position.set(x, 0.78, z); paper.rotation.y = r;
      table.add(paper);
    }
    table.add(top, leg);
    table.position.set(-8.2, 0, 0.8);
    shadowAll(table);
    this.scene.add(table);

    this.scene.add(plant(-12, -6), plant(11.8, -6.1), plant(11.5, 9));
    const cooler = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.6, 1.1, 0.6, 2, 0.06), new THREE.MeshStandardMaterial({ color: '#e9e6e1' }));
    base.position.y = 0.55;
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 20),
      new THREE.MeshStandardMaterial({ color: '#8fc3ff', transparent: true, opacity: 0.6, roughness: 0.1 }));
    bottle.position.y = 1.38;
    cooler.add(base, bottle);
    cooler.position.set(-12.3, 0, -1.6);
    shadowAll(cooler);
    this.scene.add(cooler);

    // estante à direita
    const shelf = new THREE.Group();
    const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.6), woodMat);
    shelfBody.position.y = 1.6;
    shelf.add(shelfBody);
    const bookColors = ['#e07a5f', '#f2cc8f', '#81b29a', '#3d7dd8', '#9b6bdb'];
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 7; i++) {
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6 + (i % 3) * 0.08, 0.4),
          new THREE.MeshStandardMaterial({ color: bookColors[(i + r) % bookColors.length] }));
        book.position.set(-0.9 + i * 0.28, 0.55 + r * 1.0 + book.geometry.parameters.height / 2 - 0.3, 0.12);
        shelf.add(book);
      }
    }
    shelf.position.set(9.6, 0, -6.5);
    shadowAll(shelf);
    this.scene.add(shelf);
  }
}

// -------------------------------------------------------------------- helpers

function lookKey(a: Agent) {
  return [a.color, a.body, a.eyes, a.antennas].join('|');
}

function shadowAll(obj: THREE.Object3D) {
  obj.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
}

function buildDesk() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#9a6a45', roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#6e4a31', roughness: 0.7 });
  const top = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.09, 1.05, 2, 0.03), wood);
  top.position.y = 0.76;
  const front = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.06), dark);
  front.position.set(0, 0.42, 0.47);
  for (const x of [-0.98, 0.98]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.98), dark);
    side.position.set(x, 0.36, 0);
    g.add(side);
  }
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), new THREE.MeshStandardMaterial({ color: '#2a2a2e' }));
  kb.position.set(0.15, 0.82, -0.12);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.13, 14), new THREE.MeshStandardMaterial({ color: '#f1ece4' }));
  mug.position.set(0.82, 0.87, 0.15);
  g.add(top, front, kb, mug);
  shadowAll(g);
  return g;
}

function buildMonitor(screenTexture: THREE.Texture) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#1e1e22', roughness: 0.4 });
  const frame = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.6, 0.05, 2, 0.02), body);
  frame.position.y = 0.45;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.52), new THREE.MeshBasicMaterial({ map: screenTexture }));
  screen.position.set(0, 0.45, 0.027);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.04), body);
  neck.position.y = 0.1;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), body);
  foot.position.y = 0.0;
  g.add(frame, screen, neck, foot);
  g.traverse(o => { o.castShadow = true; });
  return g;
}

function buildChair() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#2b2b30', roughness: 0.7 });
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.1, 0.7, 2, 0.04), mat);
  seat.position.y = 0.42;
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.8, 0.1, 2, 0.04), mat);
  back.position.set(0, 0.85, -0.35);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 10), mat);
  pole.position.y = 0.2;
  g.add(seat, back, pole);
  shadowAll(g);
  return g;
}

function plant(x: number, z: number) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.25, 0.55, 18), new THREE.MeshStandardMaterial({ color: '#2d2d2d' }));
  pot.position.y = 0.27;
  g.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8f4f', roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.6, 4, 8), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.15, 0.95 + (i % 2) * 0.15, Math.sin(a) * 0.15);
    leaf.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  shadowAll(g);
  return g;
}

function roundedRectGeometry(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s);
}
