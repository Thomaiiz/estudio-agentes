import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { CharacterLook, buildCharacter, disposeObject } from './character-factory';

/**
 * Gera imagens estáticas dos personagens com UM único renderer WebGL
 * (evita abrir um contexto WebGL por card, que o navegador limita).
 */
@Injectable({ providedIn: 'root' })
export class CharacterSnapshotService {
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private cache = new Map<string, string>();

  constructor() {
    this.camera.position.set(0.6, 1.2, 4.2);
    this.camera.lookAt(0, 0.66, 0);
    this.scene.add(new THREE.HemisphereLight('#fff1e0', '#2a1f18', 1.7));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
  }

  image(look: CharacterLook): string {
    const key = [look.color, look.body, look.eyes, look.antennas].join('|');
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setSize(320, 320);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    const rig = buildCharacter(look);
    rig.root.rotation.y = -0.25;
    this.scene.add(rig.root);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(rig.root);
    disposeObject(rig.root);
    this.cache.set(key, url);
    return url;
  }
}
