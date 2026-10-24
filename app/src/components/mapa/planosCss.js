// ==========================================
// 🌌 MAPA DOS PLANOS: visual de cada plano, do reino central e do Plano do Caos que envolve tudo (components/mapa/MapaMundi.jsx).
// Desenhado só com CSS/SVG (sem imagens): o Caos é um mar de fogo e brasas que preenche o palco inteiro; as fronteiras
// douradas do Multiverso recortam um reino calmo no meio, onde ficam os demais planos. Mesmo esquema de astrosCss.js/globoCss.js.
// ==========================================
import { svgRuido } from './astrosCss';

const T = {
    fogo: svgRuido({ fx: 0.012, fy: 0.02, oct: 5, seed: 4, rgb: [1, 0.3, 0.04], alfa: [3.4, -1.2] }),
    brasa: svgRuido({ fx: 0.03, fy: 0.05, oct: 4, seed: 12, rgb: [1, 0.78, 0.2], alfa: [3.6, -1.7] }),
    sombra: svgRuido({ fx: 0.02, fy: 0.02, oct: 4, seed: 9, rgb: [0.1, 0, 0.12], alfa: [2.4, -0.8] }),
    rocha: svgRuido({ fx: 0.06, oct: 5, seed: 17, rgb: [0.12, 0.07, 0.03], alfa: [2.6, -1] }),
    nuvem: svgRuido({ fx: 0.01, fy: 0.04, oct: 5, seed: 31, rgb: [1, 1, 1], alfa: [3, -1.45] })
};

export const CSS_PLANOS = `
@property --planoAng { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.planos-palco { position: relative; width: min(1000px, 96%, calc(78vh * 5 / 3)); aspect-ratio: 5 / 3; margin-top: 50px; border-radius: 15px; overflow: hidden; container-type: inline-size; box-shadow: 0 0 40px rgba(255, 80, 20, 0.25); }

/* PLANO DO CAOS: tudo que está fora das fronteiras */
.planos-caos { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, #0b0316 0%, #26060f 52%, #4a0d06 100%); }
.planos-caos-camada { position: absolute; inset: 0; mix-blend-mode: screen; pointer-events: none; -webkit-mask-image: radial-gradient(ellipse at 50% 50%, transparent 30%, #000 78%); mask-image: radial-gradient(ellipse at 50% 50%, transparent 30%, #000 78%); }
.planos-caos-fogo { background-image: ${T.fogo}; background-size: 420px 420px; opacity: 0.6; animation: planoDeriva 80s linear infinite; }
.planos-caos-brasa { background-image: ${T.brasa}; background-size: 260px 260px; opacity: 0.45; animation: planoDeriva 55s linear infinite reverse; }
.planos-caos-sombra { background-image: ${T.sombra}; background-size: 480px 480px; mix-blend-mode: multiply; opacity: 0.8; animation: planoDeriva 140s linear infinite; }
.planos-caos-raios { position: absolute; inset: -30%; background: conic-gradient(from var(--planoAng), transparent 0%, rgba(255, 110, 0, 0.35) 8%, transparent 18%, rgba(190, 0, 50, 0.3) 38%, transparent 52%, rgba(255, 150, 20, 0.35) 72%, transparent 86%); mix-blend-mode: screen; pointer-events: none; animation: planoAng 100s linear infinite; -webkit-mask-image: radial-gradient(ellipse at 50% 50%, transparent 38%, #000 80%); mask-image: radial-gradient(ellipse at 50% 50%, transparent 38%, #000 80%); }
.planos-brasa-ponto { position: absolute; bottom: -4%; width: 0.5%; aspect-ratio: 1; border-radius: 50%; background: #ffb347; box-shadow: 0 0 8px 2px rgba(255, 120, 20, 0.9); opacity: 0; pointer-events: none; animation: planoBrasa 9s ease-in infinite; }
@keyframes planoDeriva { to { background-position: 420px 260px; } }
@keyframes planoAng { to { --planoAng: 360deg; } }
@keyframes planoBrasa { 0% { transform: translateY(0) scale(1); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(-520%) translateX(40%) scale(0.3); opacity: 0; } }
.planos-legenda { position: absolute; right: 2.5%; bottom: 2%; max-width: 30%; text-align: right; font-size: clamp(8px, 1.15cqw, 12px); font-style: italic; letter-spacing: 1px; color: rgba(255, 190, 150, 0.8); text-shadow: 0 0 6px #000; pointer-events: none; }
.planos-titulo-canto { position: absolute; left: 2.5%; top: 2.5%; font-size: clamp(9px, 1.5cqw, 15px); letter-spacing: 3px; font-weight: bold; text-transform: uppercase; color: rgba(255, 210, 180, 0.8); text-shadow: 0 0 8px #000; pointer-events: none; }

/* REINO CENTRAL: o Multiverso cercado pela fronteira dourada */
.planos-reino { position: absolute; left: 5%; top: 4%; width: 90%; height: 90%; border-radius: 50%; background: radial-gradient(circle at 54% 50%, rgba(125, 75, 210, 0.38) 0%, transparent 46%), radial-gradient(1.5px 1.5px at 12% 28%, #fff, transparent), radial-gradient(1px 1px at 22% 66%, #fff, transparent), radial-gradient(1.5px 1.5px at 38% 14%, #fff, transparent), radial-gradient(1px 1px at 47% 84%, #fff, transparent), radial-gradient(1.5px 1.5px at 66% 20%, #fff, transparent), radial-gradient(1px 1px at 78% 72%, #fff, transparent), radial-gradient(1.5px 1.5px at 88% 38%, #fff, transparent), radial-gradient(1px 1px at 58% 92%, #fff, transparent), radial-gradient(ellipse at 50% 50%, #1b1240 0%, #0e0a2a 62%, #060418 100%); box-shadow: 0 0 36px 8px rgba(255, 200, 90, 0.45), inset 0 0 50px rgba(255, 200, 90, 0.28); border: 2px solid rgba(255, 220, 140, 0.9); }
.planos-reino::after { content: ""; position: absolute; inset: -13px; border-radius: 50%; pointer-events: none; background: conic-gradient(from var(--planoAng), #ffe9a8, #ff8a1f, #ffd77a, #ff5a00, #ffe9a8); -webkit-mask-image: radial-gradient(farthest-side, transparent calc(100% - 13px), #000 calc(100% - 9px), transparent 100%); mask-image: radial-gradient(farthest-side, transparent calc(100% - 13px), #000 calc(100% - 9px), transparent 100%); filter: blur(1.6px); opacity: 1; animation: planoAng 24s linear infinite; }
.planos-anel { position: absolute; left: 29%; top: 10%; width: 50%; height: 80%; pointer-events: none; overflow: visible; }
.planos-anel ellipse { fill: none; stroke: rgba(255, 215, 130, 0.85); vector-effect: non-scaling-stroke; }
.planos-anel .planos-anel-runas { stroke-width: 6; stroke: rgba(255, 215, 130, 0.35); stroke-dasharray: 2 5; animation: planoFluxo 30s linear infinite; }
@keyframes planoFluxo { to { stroke-dashoffset: -350; } }

/* ZONAS CLICÁVEIS (as posições vêm de zonasCosmologia em MapaMundi.jsx) */
.plano-zona { box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
.plano-zona > * { pointer-events: none; }
.plano-orbe { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 14px 2px var(--cor, #fff); overflow: hidden; transition: filter 0.25s, box-shadow 0.25s; }
.plano-ativo .plano-orbe { filter: brightness(1.3) saturate(1.2); box-shadow: 0 0 26px 7px var(--cor, #fff); }
.plano-rotulo { position: relative; z-index: 2; text-align: center; white-space: pre-line; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; font-size: clamp(7px, 1.25cqw, 13px); line-height: 1.15; color: #fff; text-shadow: 0 0 5px #000, 0 0 10px #000, 0 1px 2px #000; }
.plano-ajuste { background: rgba(255, 255, 255, 0.2); border: 2px dashed var(--cor, #fff); }

.pz-plano-do-vento .plano-orbe { background: radial-gradient(circle, rgba(8, 40, 24, 0.9) 0%, transparent 38%), conic-gradient(from 0deg, #1f7a4a, #84e8a8, #1f7a4a, #0c3a28, #4ac27c, #1f7a4a); }
.pz-plano-do-vento .plano-orbe::after, .pz-plano-da-agua .plano-orbe::after, .pz-plano-do-fogo .plano-orbe::after { content: ""; position: absolute; inset: -20%; background: inherit; mix-blend-mode: overlay; animation: planoGira 16s linear infinite; }
.pz-plano-da-agua .plano-orbe { background: radial-gradient(circle, rgba(5, 20, 70, 0.9) 0%, transparent 38%), conic-gradient(from 0deg, #2a5cd6, #8fc8ff, #2a5cd6, #0c2468, #4f95f0, #2a5cd6); }
.pz-plano-do-fogo .plano-orbe { background: radial-gradient(circle, rgba(60, 0, 0, 0.9) 0%, transparent 36%), conic-gradient(from 0deg, #c01818, #ffa030, #c01818, #5a0808, #ff6a1a, #c01818); }
.pz-plano-da-terra .plano-orbe { background: ${T.rocha}, radial-gradient(circle at 34% 30%, #b78a5a 0%, #7a5232 45%, #3a2412 100%); background-size: 120px, auto; }
.pz-plano-das-fadas .plano-orbe { background: radial-gradient(circle at 40% 36%, #e8ffb0 0%, #7be84a 40%, #1c7a1c 100%); animation: planoPulsa 3.5s ease-in-out infinite; }
.pz-plano-do-eter .plano-orbe { background: radial-gradient(circle at 40% 36%, #e4b8ff 0%, #8a2be2 45%, #2a0a5a 100%); animation: planoPulsa 4.5s ease-in-out infinite; }
.pz-terra-0-runeterra .plano-orbe { background: radial-gradient(circle at 34% 30%, #cdeeff 0%, #5fb4f4 34%, #1f6fc8 66%, #0a2f6a 100%); box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95), 0 0 24px 8px rgba(255, 255, 255, 0.7), 0 0 60px 18px rgba(170, 220, 255, 0.45); }
.pz-terra-0-runeterra .plano-orbe::after { content: ""; position: absolute; top: 0; left: 0; width: 200%; height: 100%; background: radial-gradient(ellipse at 18% 40%, rgba(30, 100, 60, 0.85) 0 14%, transparent 15%), radial-gradient(ellipse at 40% 66%, rgba(30, 100, 60, 0.8) 0 12%, transparent 13%), radial-gradient(ellipse at 66% 36%, rgba(30, 100, 60, 0.8) 0 15%, transparent 16%), radial-gradient(ellipse at 88% 62%, rgba(30, 100, 60, 0.8) 0 11%, transparent 12%); animation: planoDeslize 40s linear infinite; }
.pz-plano-da-ordem .plano-orbe { background: radial-gradient(circle at 40% 34%, #c9b8ff 0%, #6a54b8 52%, #2a2050 100%); }
.pz-plano-da-ordem .plano-orbe::before { content: ""; position: absolute; left: 24%; top: 24%; width: 52%; height: 52%; transform: rotate(45deg); background: linear-gradient(135deg, rgba(255, 255, 255, 0.55), rgba(180, 150, 255, 0.15)); border: 2px solid rgba(255, 255, 255, 0.8); animation: planoPulsa 5s ease-in-out infinite; }
.pz-plano-astral .plano-orbe { background: radial-gradient(circle, #0b0830 0%, #1a1450 55%, #3b2a8a 100%); }
.pz-plano-astral .plano-orbe::after { content: ""; position: absolute; inset: -25%; background: conic-gradient(from 0deg, transparent, rgba(255, 190, 70, 0.6), transparent 25%, rgba(255, 110, 30, 0.5) 50%, transparent 75%); animation: planoGira 12s linear infinite; }
.pz-ceus .plano-orbe { background: radial-gradient(circle at 40% 34%, #fff7d0 0%, #f6d760 45%, #b8861a 100%); }
.pz-ceus .plano-orbe::before { content: ""; position: absolute; inset: 8%; border-radius: 50%; border: 2px dashed rgba(120, 80, 0, 0.75); animation: planoGira 40s linear infinite; }
.pz-inferno .plano-orbe { border-radius: 0; clip-path: polygon(0 100%, 28% 42%, 40% 52%, 54% 8%, 70% 44%, 82% 36%, 100% 100%); background: repeating-linear-gradient(112deg, transparent 0 9px, rgba(255, 120, 20, 0.7) 9px 11px, transparent 11px 20px), linear-gradient(180deg, #ff6a1a 0%, #8a1006 38%, #1a0504 100%); box-shadow: none; animation: planoChama 3s ease-in-out infinite; }
.pz-inferno.plano-ativo .plano-orbe { box-shadow: none; }
.pz-plano-do-caos .plano-orbe, .pz-plano-do-caos-inferior .plano-orbe { border-radius: 14px; background: none; box-shadow: none; }
.pz-plano-do-caos .plano-rotulo, .pz-plano-do-caos-inferior .plano-rotulo { font-size: clamp(9px, 1.9cqw, 19px); letter-spacing: 3px; background: linear-gradient(180deg, #ffe08a, #ff5a1a); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; filter: drop-shadow(0 0 6px rgba(255, 70, 0, 0.85)) drop-shadow(0 2px 3px #000); }
@keyframes planoGira { to { transform: rotate(360deg); } }
@keyframes planoPulsa { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes planoDeslize { to { transform: translateX(-50%); } }
@keyframes planoChama { 0%, 100% { filter: brightness(1) drop-shadow(0 0 8px rgba(255, 90, 0, 0.8)); } 50% { filter: brightness(1.25) drop-shadow(0 0 16px rgba(255, 140, 0, 0.95)); } }
@media (prefers-reduced-motion: reduce) { .planos-caos-camada, .planos-caos-raios, .planos-reino::after, .planos-brasa-ponto, .planos-anel-runas, .plano-orbe, .plano-orbe::before, .plano-orbe::after { animation: none; } }
body.reduzir-animacoes .planos-caos-camada, body.reduzir-animacoes .planos-caos-raios, body.reduzir-animacoes .planos-reino::after, body.reduzir-animacoes .planos-brasa-ponto, body.reduzir-animacoes .planos-anel-runas, body.reduzir-animacoes .plano-orbe, body.reduzir-animacoes .plano-orbe::before, body.reduzir-animacoes .plano-orbe::after { animation: none; }
`;
