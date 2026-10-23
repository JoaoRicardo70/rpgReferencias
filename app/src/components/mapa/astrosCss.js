// ==========================================
// 🪐 TEXTURAS DOS ASTROS DO MAPA DO UNIVERSO. Camadas translúcidas por cima do degradê de cada esfera (components/mapa/MapaMundi.jsx):
// ruído fractal em SVG (feTurbulence, sem imagens) vira continentes, nuvens, faixas de gás e granulação solar; a "borda" dá o
// escurecimento de limbo e a sombra do lado oposto à luz. As camadas giram devagar (translateX de uma volta inteira).
// ==========================================

// Uma textura de ruído que repete na horizontal: cor fixa (rgb 0-1) e opacidade = a * ruído + c (o ruído decide onde aparece).
export function svgRuido({ fx, fy = fx, oct = 4, seed = 1, rgb, alfa }) {
    const [r, g, b] = rgb;
    const [a, c] = alfa;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='${fx} ${fy}' numOctaves='${oct}' seed='${seed}' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${a} 0 0 0 ${c}'/></filter><rect width='256' height='256' filter='url(#f)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const T = {
    // Terra 0
    terraTerra: svgRuido({ fx: 0.010, fy: 0.018, oct: 5, seed: 11, rgb: [0.2, 0.5, 0.22], alfa: [11, -5.2] }),
    terraAltas: svgRuido({ fx: 0.010, fy: 0.018, oct: 5, seed: 11, rgb: [0.5, 0.42, 0.24], alfa: [16, -8.6] }),
    terraNuvens: svgRuido({ fx: 0.008, fy: 0.03, oct: 5, seed: 23, rgb: [1, 1, 1], alfa: [3.4, -1.3] }),
    // Vegeta (rochoso)
    vegetaManchas: svgRuido({ fx: 0.05, oct: 5, seed: 5, rgb: [0.12, 0, 0], alfa: [2.3, -1.2] }),
    vegetaPoeira: svgRuido({ fx: 0.03, fy: 0.05, oct: 3, seed: 9, rgb: [1, 0.72, 0.5], alfa: [2.2, -0.95] }),
    // Namekusei (mares e ilhas)
    namekTerra: svgRuido({ fx: 0.012, fy: 0.02, oct: 5, seed: 3, rgb: [0, 0.28, 0.08], alfa: [8, -3.7] }),
    namekNuvens: svgRuido({ fx: 0.009, fy: 0.03, oct: 5, seed: 14, rgb: [0.88, 1, 0.9], alfa: [3.2, -1.25] }),
    // Desconhecido (gigante gasoso)
    gasClaro: svgRuido({ fx: 0.004, fy: 0.11, oct: 4, seed: 8, rgb: [0.85, 0.92, 1], alfa: [3.2, -1.25] }),
    gasEscuro: svgRuido({ fx: 0.003, fy: 0.07, oct: 3, seed: 19, rgb: [0, 0, 0.28], alfa: [3.2, -1.35] }),
    // Sóis
    solGranulos: svgRuido({ fx: 0.09, oct: 3, seed: 2, rgb: [1, 0.95, 0.5], alfa: [3.0, -1.2] }),
    solEscuro: svgRuido({ fx: 0.03, oct: 4, seed: 6, rgb: [0.6, 0.15, 0], alfa: [2.0, -1.0] })
};

export const CSS_ASTROS = `
/* Texturas dos astros: camadas translúcidas que giram devagar por cima do degradê de cada esfera */
.astro-esfera, .astro-estrela { position: relative; overflow: hidden; }
.astro-textura { position: absolute; top: 0; left: 0; width: 200%; height: 100%; background-repeat: repeat-x; background-size: 50% 100%; pointer-events: none; mix-blend-mode: soft-light; animation: astroGira var(--giro, 70s) linear infinite; will-change: transform; }
@keyframes astroGira { to { transform: translateX(-50%); } }
/* Luz vinda do alto à esquerda: brilho no topo, escurecimento de limbo e sombra suave do lado oposto */
.astro-borda { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; background: radial-gradient(circle at 30% 28%, rgba(255,255,255,0.2) 0%, transparent 34%), radial-gradient(circle at 50% 50%, transparent 48%, rgba(0,0,0,0.5) 100%), linear-gradient(115deg, transparent 38%, rgba(0,0,12,0.5) 82%); box-shadow: inset 0 0 14px 2px var(--atm, rgba(140,190,255,0.45)); }
.astro-borda-estrela { background: radial-gradient(circle at 30% 28%, rgba(255,255,255,0.28) 0%, transparent 40%), radial-gradient(circle at 50% 50%, transparent 55%, rgba(120,20,0,0.5) 100%); box-shadow: inset 0 0 30px 6px rgba(255,120,0,0.55); }
.astro-granulos { --giro: 160s; mix-blend-mode: overlay; background-image: ${T.solGranulos}, radial-gradient(circle at 12% 22%, rgba(255,255,190,0.7) 0 2.6%, transparent 3.4%), radial-gradient(circle at 34% 64%, rgba(255,120,0,0.55) 0 3.4%, transparent 4.4%), radial-gradient(circle at 78% 70%, rgba(255,90,0,0.55) 0 3%, transparent 4%); }
.astro-manchas { --giro: 220s; mix-blend-mode: multiply; background-image: ${T.solEscuro}, radial-gradient(ellipse at 28% 46%, rgba(150,45,0,0.6) 0 3.5%, rgba(255,120,0,0.2) 4.5% 7%, transparent 8%), radial-gradient(ellipse at 74% 36%, rgba(140,40,0,0.5) 0 2.6%, transparent 4.5%); }
.astro-corona { position: absolute; inset: -42%; border-radius: 50%; pointer-events: none; background: repeating-conic-gradient(from 0deg, rgba(255,190,40,0.14) 0deg 4deg, transparent 4deg 15deg); -webkit-mask-image: radial-gradient(circle, #000 34%, transparent 70%); mask-image: radial-gradient(circle, #000 34%, transparent 70%); animation: astroCoronaGira 90s linear infinite, astroCoronaPulsa 6s ease-in-out infinite alternate; }
@keyframes astroCoronaGira { to { rotate: 360deg; } }
@keyframes astroCoronaPulsa { from { opacity: 0.55; scale: 0.97; } to { opacity: 1; scale: 1.05; } }
.astro-vegeta .astro-superficie { --giro: 90s; mix-blend-mode: multiply; opacity: 0.85; background-image: ${T.vegetaManchas}, radial-gradient(circle at 18% 30%, rgba(40,0,0,0.65) 0 7%, transparent 8%), radial-gradient(circle at 62% 62%, rgba(40,0,0,0.6) 0 9%, transparent 10%), radial-gradient(circle at 82% 24%, rgba(40,0,0,0.55) 0 5%, transparent 6%), radial-gradient(circle at 40% 80%, rgba(40,0,0,0.55) 0 6%, transparent 7%); }
.astro-vegeta .astro-nuvens { --giro: 60s; mix-blend-mode: screen; opacity: 0.8; background-image: ${T.vegetaPoeira}, radial-gradient(circle at 18% 30%, transparent 0 7%, rgba(255,190,150,0.5) 8%, transparent 10%), radial-gradient(circle at 62% 62%, transparent 0 9%, rgba(255,190,150,0.45) 10%, transparent 12%); }
.astro-namekusei .astro-superficie { --giro: 110s; mix-blend-mode: multiply; background-image: ${T.namekTerra}; }
.astro-namekusei .astro-nuvens { --giro: 45s; mix-blend-mode: screen; opacity: 0.55; background-image: ${T.namekNuvens}; }
.astro-desconhecido .astro-superficie { --giro: 40s; mix-blend-mode: overlay; background-image: radial-gradient(ellipse at 62% 60%, rgba(255,255,255,0.8) 0 6%, rgba(0,40,140,0.65) 8% 13%, transparent 15%), ${T.gasEscuro}, ${T.gasClaro}; }
.astro-desconhecido .astro-nuvens { --giro: 28s; mix-blend-mode: soft-light; background-image: ${T.gasClaro}; }
.astro-terra0 .astro-superficie { --giro: 80s; mix-blend-mode: normal; background-image: linear-gradient(180deg, rgba(255,255,255,0.7) 0 5%, transparent 11% 90%, rgba(255,255,255,0.65) 95%), ${T.terraAltas}, ${T.terraTerra}; }
.astro-terra0 .astro-nuvens { --giro: 50s; mix-blend-mode: normal; opacity: 0.82; background-image: ${T.terraNuvens}; }
@media (prefers-reduced-motion: reduce) { .astro-textura, .astro-corona { animation: none; } }
`;
