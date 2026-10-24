import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONTINENTES_RUNETERRA, ILHAS_RUNETERRA, ALTURA_MAPA, LARGURA_MAPA, pontosDoCaminho, costaOrganica, sorteadorComSemente } from '../../core/globoTerra';

// ==========================================
// 🌍 GLOBO 3D DA TERRA 0: esfera de verdade (WebGL) com relevo, nuvens, luz vinda do alto à esquerda e brilho de atmosfera.
// As texturas são desenhadas em canvas 2D ao abrir (sem imagens): continentes de Runeterra com costa recortada.
// Arrastar gira o globo com inércia; sozinho ele gira devagar. (MapaMundi.jsx cai no globo em CSS se não houver WebGL.)
// ==========================================

const LARGURA = 2048;
const ALTURA = 1024;
const ESCALA = 2.7;                   // mesma escala nos dois eixos (o mapa inteiro ocupa cerca de 1/4 da volta)
const DESLOCA_X = LARGURA / 2 - (LARGURA_MAPA / 2) * ESCALA; // mundo centralizado na textura
const DESLOCA_Y = (ALTURA - ALTURA_MAPA * ESCALA) / 2;
const CENTRO_U = 0.5; // por onde a câmera "entra" no mundo

function novoCanvas(largura, altura) {
    const c = document.createElement('canvas');
    c.width = largura;
    c.height = altura;
    return c;
}

function tracarPoligono(ctx, pontos) {
    ctx.beginPath();
    pontos.forEach(([x, y], i) => {
        const px = DESLOCA_X + x * ESCALA;
        const py = DESLOCA_Y + y * ESCALA;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
}

function terrasDoMundo() {
    const sorteio = sorteadorComSemente(7);
    const poligonos = CONTINENTES_RUNETERRA.map(c => costaOrganica(pontosDoCaminho(c), sorteio, { niveis: 2, amplitude: 0.1 }));
    ILHAS_RUNETERRA.forEach(([cx, cy, rx, ry]) => {
        const aro = [];
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; aro.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
        poligonos.push(costaOrganica(aro, sorteio, { niveis: 2, amplitude: 0.25 }));
    });
    return poligonos;
}

// Cor do planeta (oceano, plataforma rasa, terra) e relevo (terra clara = alta).
function desenharTexturas() {
    const poligonos = terrasDoMundo();
    const sorteio = sorteadorComSemente(21);

    const cor = novoCanvas(LARGURA, ALTURA);
    const c = cor.getContext('2d');
    const mar = c.createLinearGradient(0, 0, 0, ALTURA);
    mar.addColorStop(0, '#8ad6ff'); mar.addColorStop(0.5, '#3b97e6'); mar.addColorStop(1, '#8ad6ff');
    c.fillStyle = mar; c.fillRect(0, 0, LARGURA, ALTURA);
    for (let i = 0; i < 900; i++) {
        c.fillStyle = sorteio() > 0.5 ? 'rgba(210,240,255,0.05)' : 'rgba(10,60,150,0.05)';
        c.beginPath(); c.ellipse(sorteio() * LARGURA, sorteio() * ALTURA, 20 + sorteio() * 70, 6 + sorteio() * 20, 0, 0, Math.PI * 2); c.fill();
    }
    // plataforma rasa (águas claras ao redor da costa)
    c.lineJoin = 'round'; c.strokeStyle = 'rgba(160,225,255,0.35)'; c.lineWidth = 26;
    poligonos.forEach(p => { tracarPoligono(c, p); c.stroke(); });
    c.strokeStyle = 'rgba(190,235,255,0.45)'; c.lineWidth = 12;
    poligonos.forEach(p => { tracarPoligono(c, p); c.stroke(); });
    // terra
    c.fillStyle = '#2468b8';
    poligonos.forEach(p => { tracarPoligono(c, p); c.fill(); });
    c.save();
    poligonos.forEach(p => { tracarPoligono(c, p); c.clip(); });
    for (let i = 0; i < 700; i++) {
        c.fillStyle = sorteio() > 0.45 ? 'rgba(90,170,235,0.16)' : 'rgba(5,40,110,0.18)';
        c.beginPath(); c.ellipse(DESLOCA_X + sorteio() * LARGURA_MAPA * ESCALA, sorteio() * ALTURA, 8 + sorteio() * 40, 5 + sorteio() * 22, sorteio() * 3, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    c.strokeStyle = 'rgba(200,240,255,0.85)'; c.lineWidth = 3;
    poligonos.forEach(p => { tracarPoligono(c, p); c.stroke(); });

    const alto = novoCanvas(LARGURA, ALTURA);
    const h = alto.getContext('2d');
    h.fillStyle = '#000'; h.fillRect(0, 0, LARGURA, ALTURA);
    h.filter = 'blur(7px)'; h.fillStyle = '#fff';
    poligonos.forEach(p => { tracarPoligono(h, p); h.fill(); });
    h.filter = 'none';
    for (let i = 0; i < 900; i++) {
        h.fillStyle = `rgba(255,255,255,${0.06 + sorteio() * 0.1})`;
        h.beginPath(); h.ellipse(DESLOCA_X + sorteio() * LARGURA_MAPA * ESCALA, sorteio() * ALTURA, 6 + sorteio() * 26, 4 + sorteio() * 14, sorteio() * 3, 0, Math.PI * 2); h.fill();
    }
    return { cor, alto };
}

function desenharNuvens() {
    const sorteio = sorteadorComSemente(99);
    const tela = novoCanvas(1024, 512);
    const c = tela.getContext('2d');
    for (let i = 0; i < 160; i++) {
        const x = sorteio() * 1024; const y = 40 + sorteio() * 432;
        const r = 18 + sorteio() * 50; const alfa = 0.1 + sorteio() * 0.22;
        [-1024, 0, 1024].forEach(d => {
            const g = c.createRadialGradient(x + d, y, 0, x + d, y, r);
            g.addColorStop(0, `rgba(255,255,255,${alfa})`); g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g; c.save(); c.translate(x + d, y); c.scale(2.6, 0.7); c.translate(-(x + d), -y);
            c.beginPath(); c.arc(x + d, y, r, 0, Math.PI * 2); c.fill(); c.restore();
        });
    }
    return tela;
}

const VERTEX = 'varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG_ATMOSFERA = 'varying vec3 vNormal; void main() { float i = pow(max(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0); gl_FragColor = vec4(0.45, 0.78, 1.0, 1.0) * i * 0.5; }';
const FRAG_BORDA = 'varying vec3 vNormal; void main() { float i = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.6); gl_FragColor = vec4(0.62, 0.86, 1.0, 1.0) * i * 0.45; }';

let texturasEmCache = null;
function texturasDoGlobo() {
    if (!texturasEmCache) texturasEmCache = { ...desenharTexturas(), nuvens: desenharNuvens() };
    return texturasEmCache;
}

function Planeta({ estado, parado }) {
    const grupo = useRef();
    const nuvens = useRef();
    const { mapaCor, mapaAlto, mapaNuvens } = useMemo(() => {
        const { cor, alto, nuvens: telaNuvens } = texturasDoGlobo();
        const tCor = new THREE.CanvasTexture(cor); tCor.colorSpace = THREE.SRGBColorSpace; tCor.anisotropy = 8;
        const tAlto = new THREE.CanvasTexture(alto);
        const tNuvens = new THREE.CanvasTexture(telaNuvens); tNuvens.colorSpace = THREE.SRGBColorSpace; tNuvens.wrapS = THREE.RepeatWrapping;
        return { mapaCor: tCor, mapaAlto: tAlto, mapaNuvens: tNuvens };
    }, []);
    useEffect(() => () => { mapaCor.dispose(); mapaAlto.dispose(); mapaNuvens.dispose(); }, [mapaCor, mapaAlto, mapaNuvens]);

    // câmera olha o +z: gira o globo pra os continentes ficarem de frente no começo
    const inicioY = (0.25 - CENTRO_U) * Math.PI * 2;
    useFrame((_, delta) => {
        const e = estado.current;
        const dt = Math.min(delta, 0.05);
        // Enquanto arrasta, quem move o globo é o ponteiro (aoMover); solto, a velocidade vira inércia e volta ao giro lento.
        if (!e.arrastando) {
            e.velY += ((parado ? 0 : e.velAuto) - e.velY) * Math.min(1, dt * 1.5);
            e.velX *= Math.max(0, 1 - dt * 3);
            e.rotY += e.velY * dt;
            e.rotX = Math.max(-0.9, Math.min(0.9, e.rotX + e.velX * dt));
        }
        if (grupo.current) { grupo.current.rotation.y = inicioY + e.rotY; grupo.current.rotation.x = e.rotX; }
        if (nuvens.current && !parado) nuvens.current.rotation.y += dt * 0.012;
    });

    return (
        <>
            <ambientLight intensity={0.6} color="#cfe6ff" />
            <directionalLight position={[-3.2, 2.4, 3.4]} intensity={2.8} color="#ffffff" />
            <directionalLight position={[3, -1.5, -2.5]} intensity={0.6} color="#5aa0ff" />
            <group ref={grupo}>
                <mesh>
                    <sphereGeometry args={[1, 96, 64]} />
                    <meshStandardMaterial map={mapaCor} bumpMap={mapaAlto} bumpScale={2.2} roughness={0.55} metalness={0.05} emissive="#1a5fb0" emissiveIntensity={0.22} />
                </mesh>
                <mesh ref={nuvens} scale={1.012}>
                    <sphereGeometry args={[1, 64, 48]} />
                    <meshStandardMaterial map={mapaNuvens} transparent opacity={0.7} depthWrite={false} roughness={1} />
                </mesh>
            </group>
            <mesh scale={1.02}>
                <sphereGeometry args={[1, 64, 48]} />
                <shaderMaterial vertexShader={VERTEX} fragmentShader={FRAG_BORDA} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            <mesh scale={1.14}>
                <sphereGeometry args={[1, 64, 48]} />
                <shaderMaterial vertexShader={VERTEX} fragmentShader={FRAG_ATMOSFERA} side={THREE.BackSide} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
        </>
    );
}

export default function GloboTerra3D() {
    const reduzir = typeof document !== 'undefined' && (document.body.classList.contains('reduzir-animacoes') || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
    const estado = useRef({ arrastando: false, ultimoX: 0, ultimoY: 0, ultimoT: 0, rotY: 0, rotX: 0.12, velY: 0.06, velX: 0, velAuto: 0.06 });

    const aoPressionar = (e) => {
        const s = estado.current;
        s.arrastando = true; s.ultimoX = e.clientX; s.ultimoY = e.clientY; s.ultimoT = performance.now(); s.velY = 0; s.velX = 0;
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const aoMover = (e) => {
        const s = estado.current;
        if (!s.arrastando) return;
        const agora = performance.now();
        const dt = Math.max((agora - s.ultimoT) / 1000, 0.001);
        const dy = (e.clientX - s.ultimoX) * 0.0065;
        const dx = (e.clientY - s.ultimoY) * 0.0065;
        s.rotY += dy; s.rotX = Math.max(-0.9, Math.min(0.9, s.rotX + dx));
        s.velY = Math.max(-4, Math.min(4, dy / dt)); s.velX = Math.max(-4, Math.min(4, dx / dt));
        s.ultimoX = e.clientX; s.ultimoY = e.clientY; s.ultimoT = agora;
    };
    const aoSoltar = () => {
        const s = estado.current;
        s.arrastando = false;
        // segurou parado antes de soltar: sem lançamento
        if (performance.now() - s.ultimoT > 80) { s.velY = 0; s.velX = 0; }
    };

    return (
        <div className="globo-3d" onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar} onPointerLeave={aoSoltar}>
            <Canvas camera={{ position: [0, 0, 4.8], fov: 30 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
                <Planeta estado={estado} parado={reduzir} />
            </Canvas>
        </div>
    );
}
