import * as THREE from 'three';
import { CharacterLook, CharacterRig, buildCharacter, disposeObject } from './character-factory';

/** Mini-cena que mostra um personagem girando (usada no criador de agente e nos cards). */
export class CharacterPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  private rig?: CharacterRig;
  private frame = 0;
  private ro: ResizeObserver;
  private start = performance.now();

  constructor(private container: HTMLElement, private spin = true) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 1.1, 4);
    this.camera.lookAt(0, 0.62, 0);
    this.scene.add(new THREE.HemisphereLight('#fff1e0', '#2a1f18', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  setLook(look: CharacterLook) {
    if (this.rig) {
      this.scene.remove(this.rig.root);
      disposeObject(this.rig.root);
    }
    this.rig = buildCharacter(look);
    this.scene.add(this.rig.root);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const t = (performance.now() - this.start) / 1000;
    if (this.rig) {
      this.rig.root.rotation.y = this.spin ? Math.sin(t * 0.8) * 0.6 : 0;
      this.rig.bob.position.y = Math.sin(t * 2) * 0.03;
      this.rig.eyes.scale.y = t % 4 < 0.12 ? 0.15 : 1;
    }
    this.renderer.render(this.scene, this.camera);
  };
}
