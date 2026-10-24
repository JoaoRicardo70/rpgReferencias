// ==========================================
// 🌍 GLOBO DA TERRA 0 (components/mapa/MapaMundi.jsx, tela "Visão Orbital").
// Esfera azul clara: oceano em degradê, continentes de Runeterra em azul mais fundo (silhuetas orgânicas via ruído SVG),
// nuvens e atmosfera brilhante. As texturas giram devagar e acompanham o arrastar do mouse (longitude/latitude).
// ==========================================
import { svgRuido } from './astrosCss';
import { CONTINENTES_RUNETERRA as CONTINENTES } from '../../core/globoTerra';

function svgContinentes() {
    const caminhos = CONTINENTES.map(d => `<path d='${d}'/>`).join('');
    const ilhas = `<ellipse cx='8' cy='110' rx='5' ry='3'/><ellipse cx='172' cy='96' rx='6' ry='4'/><ellipse cx='20' cy='150' rx='4' ry='2.5'/><ellipse cx='160' cy='140' rx='7' ry='3'/><ellipse cx='88' cy='42' rx='3' ry='2'/>`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800' viewBox='0 0 200 200' preserveAspectRatio='none'><defs><filter id='c' x='-5%' y='-5%' width='110%' height='110%'><feTurbulence type='fractalNoise' baseFrequency='0.05' numOctaves='3' seed='7' stitchTiles='stitch' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='9' xChannelSelector='R' yChannelSelector='G'/></filter></defs><g filter='url(#c)'><g fill='#1c64b8' stroke='#9fdcff' stroke-width='1.6' stroke-linejoin='round'>${caminhos}${ilhas}</g><g fill='#2f86d6' opacity='0.8' transform='translate(0 0)'>${caminhos}</g></g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const T = {
    continentes: svgContinentes(),
    oceano: svgRuido({ fx: 0.02, fy: 0.03, oct: 4, seed: 21, rgb: [0.85, 0.96, 1], alfa: [1.6, -0.6] }),
    nuvens: svgRuido({ fx: 0.012, fy: 0.05, oct: 5, seed: 33, rgb: [1, 1, 1], alfa: [3.2, -1.65] })
};

export const CSS_GLOBO = `
.globo-terra-area { position: relative; display: flex; flex-direction: column; align-items: center; gap: 26px; z-index: 5; }
.globo-terra-area::before { content: ""; position: absolute; top: 50%; left: 50%; width: 760px; height: 760px; max-width: 150vw; transform: translate(-50%, -62%); border-radius: 50%; background: radial-gradient(circle, rgba(60,150,255,0.22) 0%, rgba(20,80,200,0.1) 45%, transparent 70%); pointer-events: none; }
.globo-terra { user-select: none; touch-action: none; position: relative; width: min(480px, 72vw); aspect-ratio: 1; cursor: grab; transition: opacity 1s; }
.globo-arrastando { cursor: grabbing; }
.globo-3d { position: absolute; inset: -14%; touch-action: none; cursor: grab; }
.globo-3d:active { cursor: grabbing; }
.globo-3d canvas { display: block; }
.globo-terra-voando { transform: scale(10); transition: transform 1.5s cubic-bezier(0.4, 0, 0.2, 1); }
.globo-esfera { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: radial-gradient(circle at 32% 26%, #d6f3ff 0%, #8fdcff 22%, #4eb2f3 52%, #2377d4 80%, #0e4aa0 100%); box-shadow: inset 0 0 50px rgba(200,235,255,0.55), inset -40px -50px 90px rgba(5,40,110,0.6); }
.globo-atmosfera { position: absolute; inset: -3%; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, transparent 62%, rgba(150,215,255,0.55) 70%, rgba(110,190,255,0.18) 80%, transparent 90%); filter: blur(5px); }
.globo-textura { position: absolute; width: 300%; height: 116%; background-repeat: repeat-x; background-size: 33.3334% 100%; pointer-events: none; animation: globoGira 160s linear infinite; will-change: transform; }
.globo-arrastando .globo-textura { animation-play-state: paused; }
@keyframes globoGira { to { transform: translateX(-33.3334%); } }
.globo-oceano { background-image: ${T.oceano}; mix-blend-mode: soft-light; animation-duration: 200s; }
.globo-continentes { background-image: ${T.continentes}; filter: drop-shadow(0 0 5px rgba(5,40,110,0.55)); }
.globo-nuvens { background-image: ${T.nuvens}; opacity: 0.6; animation-duration: 110s; }
.globo-borda { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; background: radial-gradient(circle at 30% 26%, rgba(255,255,255,0.45) 0%, transparent 32%), radial-gradient(circle at 50% 50%, transparent 52%, rgba(6,50,130,0.55) 100%), linear-gradient(120deg, transparent 45%, rgba(2,20,70,0.45) 86%); }
.globo-entrar { position: relative; z-index: 2; background: rgba(10,40,100,0.55); border: 2px solid #9fdcff; color: #e6f7ff; padding: 12px 28px; border-radius: 30px; cursor: pointer; font-weight: bold; font-size: 0.95em; letter-spacing: 2px; backdrop-filter: blur(5px); box-shadow: 0 0 22px rgba(110,190,255,0.5); transition: opacity 1s, box-shadow 0.2s, background 0.2s; }
.globo-entrar:hover { background: rgba(30,90,190,0.7); box-shadow: 0 0 34px rgba(150,215,255,0.8); }
/* A altura de 116% e o top (-8% -/+ 7%) cobrem a esfera enquanto a latitude fica limitada a +/-70 graus em MapaMundi.jsx. */
@media (prefers-reduced-motion: reduce) { .globo-textura { animation: none; } }
body.reduzir-animacoes .globo-textura { animation: none; }
`;
