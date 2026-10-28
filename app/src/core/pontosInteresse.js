// ==========================================
// 📍 PONTOS DE INTERESSE DAS REGIÕES DO MAPA DA TERRA 0 (components/mapa/PontosDaRegiao.jsx)
// Ao clicar numa região o mapa aproxima dela e mostra os pontos de interesse que o Mestre marcou (cidades, ruínas,
// masmorras...). Cada ponto guarda as suas Cenas. No Firebase (cenario.pontos):
//   { [id]: { reino, nome, x, y, icone } }   — x/y em % do mapa inteiro (0-100)
// e cada Cena (cenario.lista[id]) ganha `ponto: <id do ponto>`. Cena sem ponto (ou de um ponto apagado) fica em
// "Cenas sem ponto", então nada se perde. Só Mestre/Co-Mestre cria e edita pontos; esta lógica é pura.
// ==========================================
import { podeAcessarCena, regiaoDaCena } from './cenasRegiao';
import { FACCOES_PADRAO, gradePadrao } from './fronteirasPadrao';
import { GRADE_L, GRADE_A } from './fronteiras';

export const NOME_PONTO_MAX = 40;

export const ICONES_PONTO = [
    { id: 'cidade', emoji: '🏰', nome: 'Cidade' },
    { id: 'vila', emoji: '🏘️', nome: 'Vila' },
    { id: 'porto', emoji: '⚓', nome: 'Porto' },
    { id: 'floresta', emoji: '🌲', nome: 'Floresta' },
    { id: 'montanha', emoji: '⛰️', nome: 'Montanha' },
    { id: 'ruina', emoji: '🏛️', nome: 'Ruína' },
    { id: 'masmorra', emoji: '🕳️', nome: 'Masmorra' },
    { id: 'templo', emoji: '⛩️', nome: 'Templo' },
    { id: 'batalha', emoji: '⚔️', nome: 'Batalha' },
    { id: 'misterio', emoji: '❓', nome: 'Mistério' }
];
export const ICONE_PADRAO = 'cidade';

export function emojiDoIcone(icone) {
    return (ICONES_PONTO.find((i) => i.id === icone) || ICONES_PONTO[0]).emoji;
}

const limitar = (n, min, max) => Math.min(max, Math.max(min, n));
const arredondar = (n) => Math.round(n * 10) / 10;

export function nomeDePontoValido(nome) {
    return typeof nome === 'string' ? nome.trim().slice(0, NOME_PONTO_MAX) : '';
}

export function novoPonto({ reino, nome, x, y, icone = ICONE_PADRAO }) {
    return {
        reino: String(reino || ''),
        nome: nomeDePontoValido(nome),
        x: arredondar(limitar(Number(x) || 0, 0, 100)),
        y: arredondar(limitar(Number(y) || 0, 0, 100)),
        icone: ICONES_PONTO.some((i) => i.id === icone) ? icone : ICONE_PADRAO
    };
}

// Pontos válidos do Firebase (ignora entradas quebradas): { [id]: ponto }.
export function pontosValidos(brutos) {
    const saida = {};
    if (!brutos || typeof brutos !== 'object') return saida;
    Object.entries(brutos).forEach(([id, p]) => {
        if (!p || typeof p !== 'object' || !p.reino || !nomeDePontoValido(p.nome) || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) return;
        saida[id] = novoPonto(p);
    });
    return saida;
}

// Cenas que esta pessoa pode ver num ponto: [{ id, cena }] em ordem alfabética.
export function cenasDoPonto(lista, pontoId, contexto = {}) {
    if (!lista || typeof lista !== 'object' || !pontoId) return [];
    return Object.entries(lista)
        .filter(([id, cena]) => cena?.ponto === pontoId && podeAcessarCena(cena, id, contexto))
        .map(([id, cena]) => ({ id, cena }))
        .sort((a, b) => String(a.cena.nome || '').localeCompare(String(b.cena.nome || ''), 'pt-BR'));
}

// Cenas da região sem ponto de interesse válido (nunca marcadas ou de um ponto que foi apagado).
export function cenasSemPonto(lista, pontos, reino, contexto = {}) {
    if (!lista || typeof lista !== 'object' || !reino) return [];
    return Object.entries(lista)
        .filter(([id, cena]) => regiaoDaCena(cena) === reino && !(cena.ponto && pontos?.[cena.ponto]) && podeAcessarCena(cena, id, contexto))
        .map(([id, cena]) => ({ id, cena }))
        .sort((a, b) => String(a.cena.nome || '').localeCompare(String(b.cena.nome || ''), 'pt-BR'));
}

// Pontos da região a mostrar: o Mestre vê todos; os outros só os que têm alguma Cena liberada para eles.
export function pontosDaRegiao(pontos, lista, reino, contexto = {}) {
    return Object.entries(pontos || {})
        .filter(([, p]) => p.reino === reino)
        .map(([id, ponto]) => ({ id, ponto, cenas: cenasDoPonto(lista, id, contexto).length }))
        .filter((p) => contexto.ehMestre || p.cenas > 0)
        .sort((a, b) => a.ponto.nome.localeCompare(b.ponto.nome, 'pt-BR'));
}

// Todas as funções abaixo devolvem um cenário NOVO (o original não muda), pronto para salvarCenarioCompleto.
export function cenarioComPonto(cenario, id, ponto) {
    return { ...(cenario || {}), pontos: { ...(cenario?.pontos || {}), [id]: novoPonto(ponto) } };
}

export function cenarioSemPonto(cenario, id) {
    const { [id]: removido, ...restantes } = cenario?.pontos || {};
    const lista = { ...(cenario?.lista || {}) };
    Object.entries(lista).forEach(([cid, cena]) => {
        if (cena?.ponto === id) { const { ponto, ...resto } = cena; lista[cid] = resto; }
    });
    return { ...(cenario || {}), pontos: restantes, lista };
}

// Põe a Cena num ponto (ou tira de qualquer ponto com pontoId = null).
export function cenarioComCenaNoPonto(cenario, cenaId, pontoId) {
    const cena = cenario?.lista?.[cenaId];
    if (!cena) return cenario;
    const { ponto, ...resto } = cena;
    return { ...cenario, lista: { ...cenario.lista, [cenaId]: pontoId ? { ...resto, ponto: pontoId } : resto } };
}

// --- aproximação (zoom) na região ---

// Caixa que envolve o território da região (frações 0-1 do mapa), ignorando as ilhotas mais afastadas.
export function caixaDaRegiao(nomeRegiao) {
    const faccao = FACCOES_PADRAO.find((f) => f.nome === nomeRegiao);
    if (!faccao) return null;
    const xs = []; const ys = [];
    gradePadrao().forEach((linha, y) => { for (let x = 0; x < GRADE_L; x++) if (linha[x] === faccao.id) { xs.push(x); ys.push(y); } });
    if (!xs.length) return null;
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const pega = (v, q) => v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * q)))];
    return { x0: pega(xs, 0.03) / GRADE_L, x1: (pega(xs, 0.97) + 1) / GRADE_L, y0: pega(ys, 0.03) / GRADE_A, y1: (pega(ys, 0.97) + 1) / GRADE_A };
}

export const VISTA_SEM_FOCO = { escala: 1, x: 0, y: 0 };

// Zoom que enquadra a caixa: { escala, x, y } com x e y em % do tamanho do mapa (para `translate(x%, y%) scale(escala)`
// com origem no canto superior esquerdo). Nunca mostra fora do mapa.
export function vistaDeFoco(caixa, { margem = 0.2, escalaMin = 1.5, escalaMax = 4.5 } = {}) {
    if (!caixa) return VISTA_SEM_FOCO;
    const largura = Math.max(0.04, caixa.x1 - caixa.x0);
    const altura = Math.max(0.04, caixa.y1 - caixa.y0);
    const escala = limitar(Math.min((1 - margem) / largura, (1 - margem) / altura), escalaMin, escalaMax);
    const x = limitar(0.5 - ((caixa.x0 + caixa.x1) / 2) * escala, 1 - escala, 0);
    const y = limitar(0.5 - ((caixa.y0 + caixa.y1) / 2) * escala, 1 - escala, 0);
    return { escala, x: x * 100, y: y * 100 };
}
