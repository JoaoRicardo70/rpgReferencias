import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// Replica a construcao de faces de DadoFisico3D (MapaCombate.jsx), sem WebGL.
function construirFaces() {
    const geo = new THREE.IcosahedronGeometry(2.8, 0);
    const pos = geo.getAttribute('position');
    const lista = [];
    for (let i = 0; i < 20; i++) {
        const v0 = new THREE.Vector3().fromBufferAttribute(pos, i * 3);
        const v1 = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 1);
        const v2 = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 2);
        const centro = new THREE.Vector3().add(v0).add(v1).add(v2).divideScalar(3);
        const normal = centro.clone().normalize();
        const cima = v0.clone().sub(centro).normalize();
        const direita = new THREE.Vector3().crossVectors(cima, normal).normalize();
        const orientacao = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(direita, cima, normal));
        lista.push({ centro, normal, cima, direita, orientacao });
    }
    return lista;
}

const proximo = (v, x, y, z) => {
    expect(v.x).toBeCloseTo(x, 5);
    expect(v.y).toBeCloseTo(y, 5);
    expect(v.z).toBeCloseTo(z, 5);
};

describe('matematica das faces do d20', () => {
    const faces = construirFaces();

    it('gera 20 faces distintas', () => {
        expect(faces).toHaveLength(20);
        for (let i = 0; i < 20; i++) {
            for (let j = i + 1; j < 20; j++) {
                expect(faces[i].normal.distanceTo(faces[j].normal)).toBeGreaterThan(1e-3);
            }
        }
    });

    for (let i = 0; i < 20; i++) {
        describe(`face ${i + 1}`, () => {
            const f = faces[i];
            const inversa = f.orientacao.clone().invert();

            it('inversa leva a normal da face para (0,0,1)', () => {
                proximo(f.normal.clone().applyQuaternion(inversa), 0, 0, 1);
            });
            it('inversa leva "cima" para (0,1,0)', () => {
                proximo(f.cima.clone().applyQuaternion(inversa), 0, 1, 0);
            });
            it('inversa e ortonormal com determinante +1 (x cross y = z)', () => {
                const x = new THREE.Vector3(1, 0, 0).applyQuaternion(inversa);
                const y = new THREE.Vector3(0, 1, 0).applyQuaternion(inversa);
                const z = new THREE.Vector3(0, 0, 1).applyQuaternion(inversa);
                expect(x.length()).toBeCloseTo(1, 5);
                expect(y.length()).toBeCloseTo(1, 5);
                expect(z.length()).toBeCloseTo(1, 5);
                expect(x.dot(y)).toBeCloseTo(0, 5);
                expect(y.dot(z)).toBeCloseTo(0, 5);
                expect(x.dot(z)).toBeCloseTo(0, 5);
                proximo(new THREE.Vector3().crossVectors(x, y), z.x, z.y, z.z);
                expect(new THREE.Matrix4().makeRotationFromQuaternion(inversa).determinant()).toBeCloseTo(1, 5);
            });
        });
    }
});
