import React, { useEffect, useMemo, useRef } from 'react';

// ✨ Efeitos de resultado do dado (crítico, crítico fatal, falha crítica). Um canvas 2D por cima da tela, só enquanto dura:
//   fatal   = explosão de brasas vermelhas e alaranjadas;   crítico = faíscas douradas;
//   falha   = cacos escuros caindo + rachaduras no dado;    comum   = poucas fagulhas.
// `intensidade`: 'intensos' (cheio) ou 'suaves' (bem menos partículas). Posição (x, y) em pixels da tela, onde o dado pousou.
const PALETAS = {
    fatal: ['#ff003c', '#ff4d00', '#ff9500', '#ffd000'],
    critico: ['#ffcc00', '#ffe066', '#fff3b0', '#ffffff'],
    falha: ['#2a2233', '#4a3a5c', '#6c5b7b', '#120a18'],
    normal: ['#7cc4ff', '#bfe3ff', '#ffffff']
};

const aleatorio = (a, b) => a + Math.random() * (b - a);

export function criarParticulas(nivel, intensidade, x, y, cor) {
    const f = intensidade === 'suaves' ? 0.35 : 1;
    const paleta = nivel === 'normal' && cor ? [cor, '#ffffff'] : (PALETAS[nivel] || PALETAS.normal);
    const lista = [];
    const adicionar = (n, fazer) => { for (let i = 0; i < Math.max(1, Math.round(n * f)); i++) lista.push(fazer(i)); };
    const escolha = () => paleta[Math.floor(Math.random() * paleta.length)];

    if (nivel === 'fatal') {
        adicionar(150, () => { const a = aleatorio(0, Math.PI * 2); const v = aleatorio(220, 900); return { tipo: 'brasa', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 180, g: 380, vida: aleatorio(0.9, 1.8), tam: aleatorio(2, 6.5), cor: escolha() }; });
    } else if (nivel === 'critico') {
        adicionar(70, () => { const a = aleatorio(0, Math.PI * 2); const v = aleatorio(300, 820); return { tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 520, vida: aleatorio(0.45, 1), tam: aleatorio(1.5, 3.2), cor: escolha() }; });
    } else if (nivel === 'falha') {
        adicionar(26, () => { const a = aleatorio(-Math.PI, 0); const v = aleatorio(120, 360); return { tipo: 'caco', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1500, vida: aleatorio(1.1, 2), tam: aleatorio(5, 13), rot: aleatorio(0, 6), vrot: aleatorio(-9, 9), cor: escolha() }; });
        adicionar(18, () => ({ tipo: 'poeira', x: x + aleatorio(-40, 40), y: y + aleatorio(-10, 30), vx: aleatorio(-40, 40), vy: aleatorio(-60, -10), g: 0, vida: aleatorio(0.8, 1.6), tam: aleatorio(8, 22), cor: '#1b1024' }));
    } else if (nivel === 'normal') {
        // Rolagem comum: sem partículas (os efeitos especiais são para Crítico, Fatal e Falha).
    } else {
        adicionar(14, () => { const a = aleatorio(0, Math.PI * 2); const v = aleatorio(60, 220); return { tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 200, vida: aleatorio(0.4, 0.8), tam: aleatorio(1.2, 2.4), cor: escolha() }; });
    }
    return lista;
}

// Passo de simulação de uma partícula (dt em segundos). Devolve false quando morreu.
export function avancarParticula(p, dt) {
    p.idade = (p.idade || 0) + dt;
    if (p.idade >= p.vida) return false;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.tipo === 'caco') p.rot += p.vrot * dt;
    p.vx *= p.tipo === 'poeira' ? 0.96 : 0.995;
    return true;
}

// Rachaduras: linhas quebradas que saem do centro (em unidades de 0 a 100 de uma caixa quadrada).
export function gerarRachaduras(qtd = 8) {
    const linhas = [];
    for (let i = 0; i < qtd; i++) {
        let a = (i / qtd) * Math.PI * 2 + aleatorio(-0.3, 0.3);
        let px = 50, py = 50;
        const pontos = [[px, py]];
        const passos = 4 + Math.floor(Math.random() * 3);
        for (let k = 0; k < passos; k++) {
            a += aleatorio(-0.55, 0.55);
            const d = aleatorio(6, 12);
            px += Math.cos(a) * d; py += Math.sin(a) * d;
            pontos.push([px, py]);
        }
        linhas.push(pontos.map(p => p.map(n => n.toFixed(1)).join(',')).join(' '));
    }
    return linhas;
}

export default function ParticulasDado({ nivel = 'normal', intensidade = 'intensos', x, y, cor }) {
    const canvasRef = useRef(null);
    const rachaduras = useMemo(() => (nivel === 'falha' ? gerarRachaduras(intensidade === 'suaves' ? 5 : 9) : []), [nivel, intensidade]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || typeof window === 'undefined') return undefined;
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return undefined;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        ctx.scale(dpr, dpr);
        const particulas = criarParticulas(nivel, intensidade, x, y, cor);
        let ultimo = performance.now();
        let raf = 0;

        const quadro = (agora) => {
            const dt = Math.min(0.05, (agora - ultimo) / 1000);
            ultimo = agora;
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            ctx.globalCompositeOperation = nivel === 'falha' ? 'source-over' : 'lighter';
            for (let i = particulas.length - 1; i >= 0; i--) {
                const p = particulas[i];
                if (!avancarParticula(p, dt)) { particulas.splice(i, 1); continue; }
                const alpha = Math.max(0, 1 - p.idade / p.vida);
                ctx.globalAlpha = alpha;
                if (p.tipo === 'faisca') {
                    ctx.strokeStyle = p.cor; ctx.lineWidth = p.tam;
                    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
                } else if (p.tipo === 'caco') {
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.cor;
                    ctx.beginPath(); ctx.moveTo(-p.tam, p.tam * 0.6); ctx.lineTo(p.tam * 0.2, -p.tam); ctx.lineTo(p.tam, p.tam * 0.7); ctx.closePath(); ctx.fill(); ctx.restore();
                } else {
                    ctx.fillStyle = p.cor;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.tam * (p.tipo === 'poeira' ? 1 + p.idade : 1), 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
            if (particulas.length > 0) raf = requestAnimationFrame(quadro);
        };
        raf = requestAnimationFrame(quadro);
        return () => cancelAnimationFrame(raf);
    }, [nivel, intensidade, x, y, cor]);

    return (
        <>
            <canvas ref={canvasRef} className="dado-particulas" aria-hidden="true" style={{ width: '100vw', height: '100vh' }} />
            {rachaduras.length > 0 && (
                <svg className="dado-rachaduras" viewBox="0 0 100 100" aria-hidden="true" style={{ left: x, top: y }}>
                    {rachaduras.map((pts, i) => <polyline key={i} points={pts} pathLength="1" style={{ animationDelay: `${i * 35}ms` }} />)}
                </svg>
            )}
        </>
    );
}
