import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Body, Eyes } from '../core/models';

export interface CharacterLook {
  color: string;
  body: Body;
  eyes: Eyes;
  antennas: boolean;
}

/** Partes do personagem que o escritório anima. */
export interface CharacterRig {
  root: THREE.Group;        // posição/rotação no mundo
  bob: THREE.Group;         // sobe/desce (respiração, pulo, digitação)
  eyes: THREE.Group;        // piscar (escala Y)
  antennaTips: THREE.Mesh[];
  bodyMaterial: THREE.MeshStandardMaterial;
  height: number;
}

const DARK = new THREE.Color('#1d1b22');

/**
 * Monta um personagem estilizado a partir de primitivas.
 * Altura aproximada: 1 unidade; frente voltada para +Z.
 */
export function buildCharacter(look: CharacterLook): CharacterRig {
  const color = new THREE.Color(look.color);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  const darker = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.72), roughness: 0.6 });

  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  const eyes = new THREE.Group();
  const antennaTips: THREE.Mesh[] = [];
  let faceZ = 0.31;
  let faceY = 0.62;
  let eyeColor = DARK;
  let height = 1;

  switch (look.body) {
    case 'BLOCOS': {
      const torso = mesh(new RoundedBoxGeometry(0.9, 0.62, 0.6, 3, 0.08), bodyMaterial);
      torso.position.y = 0.55;
      bob.add(torso);
      for (const x of [-0.28, 0.28]) {           // orelhas
        const ear = mesh(new RoundedBoxGeometry(0.16, 0.2, 0.2, 2, 0.04), bodyMaterial);
        ear.position.set(x, 0.94, 0);
        bob.add(ear);
      }
      for (const x of [-0.53, 0.53]) {           // braços
        const arm = mesh(new RoundedBoxGeometry(0.16, 0.12, 0.12, 2, 0.03), darker);
        arm.position.set(x, 0.5, 0);
        bob.add(arm);
      }
      for (const x of [-0.3, -0.1, 0.1, 0.3]) {  // pernas
        const leg = mesh(new RoundedBoxGeometry(0.12, 0.26, 0.14, 2, 0.03), darker);
        leg.position.set(x, 0.13, 0);
        root.add(leg);
      }
      faceZ = 0.305; faceY = 0.58;
      break;
    }
    case 'NUVEM': {
      const puffs: [number, number, number, number][] = [
        [0, 0.68, 0, 0.32], [-0.26, 0.62, -0.02, 0.22], [0.26, 0.62, -0.02, 0.22],
        [-0.16, 0.86, -0.04, 0.2], [0.16, 0.86, -0.04, 0.2], [0, 0.92, -0.06, 0.2],
      ];
      for (const [x, y, z, r] of puffs) {
        const p = mesh(new THREE.SphereGeometry(r, 24, 16), bodyMaterial);
        p.position.set(x, y, z);
        bob.add(p);
      }
      const screen = mesh(new RoundedBoxGeometry(0.46, 0.32, 0.06, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#12204a', roughness: 0.3 }));
      screen.position.set(0, 0.7, 0.3);
      bob.add(screen);
      const torso = mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 16), darker);
      torso.position.y = 0.36;
      bob.add(torso);
      for (const x of [-0.08, 0.08]) {
        const leg = mesh(new RoundedBoxGeometry(0.1, 0.26, 0.12, 2, 0.03), darker);
        leg.position.set(x, 0.13, 0);
        root.add(leg);
      }
      faceZ = 0.335; faceY = 0.7; eyeColor = new THREE.Color('#e8f0ff');
      height = 1.1;
      break;
    }
    case 'ESTRELA': {
      const star = mesh(starGeometry(0.5, 0.2, 0.2), bodyMaterial);
      star.position.y = 0.62;
      bob.add(star);
      faceZ = 0.2; faceY = 0.64;
      height = 1.15;
      break;
    }
  }

  buildEyes(eyes, look.eyes, eyeColor);
  eyes.position.set(0, faceY, faceZ);
  bob.add(eyes);

  if (look.antennas) {
    const tipMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
    const top = look.body === 'ESTRELA' ? 1.05 : look.body === 'NUVEM' ? 1.08 : 0.86;
    for (const x of [-0.14, 0.14]) {
      const stick = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), darker);
      stick.position.set(x, top + 0.11, 0);
      stick.rotation.z = -x * 1.2;
      const tip = mesh(new THREE.SphereGeometry(0.05, 12, 8), tipMat);
      tip.position.set(x * 1.25, top + 0.23, 0);
      bob.add(stick, tip);
      antennaTips.push(tip);
    }
    height += 0.2;
  }

  return { root, bob, eyes, antennaTips, bodyMaterial, height };
}

function buildEyes(group: THREE.Group, kind: Eyes, color: THREE.Color) {
  const mat = new THREE.MeshBasicMaterial({ color });
  const bar = (w: number, h: number) => new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mat);
  if (kind === 'PONTOS') {
    for (const x of [-0.1, 0.1]) {
      const e = bar(0.06, 0.12);
      e.position.x = x;
      group.add(e);
    }
  } else if (kind === 'CHEVRON') {
    // ">  <"
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const a = bar(0.11, 0.035); a.position.y = 0.03; a.rotation.z = side * -0.6;
      const b = bar(0.11, 0.035); b.position.y = -0.03; b.rotation.z = side * 0.6;
      g.add(a, b);
      g.position.x = side * 0.11;
      group.add(g);
    }
  } else {
    // ">_"
    const g = new THREE.Group();
    const a = bar(0.1, 0.035); a.position.y = 0.028; a.rotation.z = -0.6;
    const b = bar(0.1, 0.035); b.position.y = -0.028; b.rotation.z = 0.6;
    g.add(a, b);
    g.position.x = -0.07;
    const under = bar(0.11, 0.035);
    under.position.set(0.08, -0.06, 0);
    group.add(g, under);
  }
}

function starGeometry(outer: number, inner: number, depth: number) {
  const shape = new THREE.Shape();
  const points = 8;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Libera geometrias e materiais de um objeto removido da cena. */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
}
