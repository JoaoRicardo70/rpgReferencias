// ==========================================
// 📦 GAVETA DE TOKENS — os NPCs da mesa (fichas com isNPC / bio.mesa 'npc', os mesmos do
// "Visor de Entidades > NPCs" da aba Mestre) viram tokens de combate (dummies) no Mapa com um
// clique, já com Vida, Defesa e Poder Calculado tirados da ficha.
// ==========================================
import { getTetoVida, getVitalMax, getVitalMaxEstavel, FATOR_EXIBICAO_VITAIS } from './vitals.js';
import { calcularFatorMultiplicadorForca } from './poder.js';
import { calcularCA } from './engine.js';
import { getPoderParaDisputa } from './disputaPoder.js';

export const FAMILIA_SEM_CLA = 'Sem Clã / Bestas Soltas';

export function ehNpc(ficha) {
    return !!(ficha && (ficha.isNPC || ficha.bio?.mesa === 'npc'));
}

// Mesma regra do Visor de Entidades (MestreSubComponents.jsx): afiliação da Bio ou o "Clã de
// Origem" escrito no poder "📖 Linhagem & Lore".
export function getFamiliaNpc(ficha) {
    let familia = ficha?.bio?.afiliacao;
    if (!familia || String(familia).trim() === '') {
        const lorePoder = (ficha?.poderes || []).find(p => p && p.nome === '📖 Linhagem & Lore');
        if (lorePoder && lorePoder.descricao) {
            const match = String(lorePoder.descricao).match(/Clã de Origem:\s*(.*)/);
            if (match && match[1]) familia = match[1].trim();
        }
    }
    if (!familia || familia === 'Nenhum' || String(familia).trim() === '') return FAMILIA_SEM_CLA;
    return String(familia).trim();
}

// { familia: [{ nome, ficha }] } com os NPCs de `personagens`, em ordem alfabética.
export function agruparNpcsPorFamilia(personagens, busca = '') {
    const termo = String(busca || '').trim().toLowerCase();
    const grupos = {};
    Object.entries(personagens || {}).forEach(([nome, ficha]) => {
        if (!ehNpc(ficha)) return;
        if (termo && !String(nome).toLowerCase().includes(termo)) return;
        const familia = getFamiliaNpc(ficha);
        (grupos[familia] = grupos[familia] || []).push({ nome, ficha });
    });
    Object.values(grupos).forEach(l => l.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')));
    return grupos;
}

// Vida máxima BRUTA do NPC (mesma conta do card do Mestre e da Ficha: teto com o Multiplicador de
// Força da Vida) — é a unidade de hpMax/hpAtual dos dummies.
export function getVidaMaxBrutaNpc(ficha) {
    if (!ficha) return 0;
    try {
        const fator = calcularFatorMultiplicadorForca(ficha, 'vida');
        const v = getTetoVida(getVitalMax('vida', ficha) * fator, 'vida', getVitalMaxEstavel('vida', ficha) * fator);
        return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
        return 0;
    }
}

// Próximas `quantidade` casas livres do Mapa (varre linha a linha a partir de [0,0]), pra os tokens
// novos não nascerem empilhados em cima de quem já está na cena.
export function posicoesLivres(ocupadas, quantidade, tamanho = 30) {
    const usadas = new Set((ocupadas || []).filter(p => p && p.x !== undefined).map(p => `${p.x},${p.y}`));
    const livres = [];
    for (let y = 0; y < tamanho && livres.length < quantidade; y++) {
        for (let x = 0; x < tamanho && livres.length < quantidade; x++) {
            if (!usadas.has(`${x},${y}`)) livres.push({ x, y });
        }
    }
    while (livres.length < quantidade) livres.push({ x: 0, y: 0 });
    return livres;
}

// Esconder tokens de entidade: o Mapa lê a invisibilidade de cenario.tokensOcultos (ids dos dummies,
// ver MapaGrelha.jsx/MapaCombate.jsx) — um campo "oculto" no próprio dummy não esconde nada.
// Devolve um cenário NOVO (o original não é alterado), pronto pra salvarCenarioCompleto.
export function cenarioComTokensOcultos(cenario, ids) {
    const novo = JSON.parse(JSON.stringify(cenario || {}));
    const lista = Array.isArray(novo.tokensOcultos) ? novo.tokensOcultos : [];
    (ids || []).forEach(id => { if (id && !lista.includes(id)) lista.push(id); });
    novo.tokensOcultos = lista;
    return novo;
}

// Token (dummy) pronto pra salvarDummie. Vida cheia (100 de Vida exibida se a ficha não tiver
// nenhuma), Defesa = a maior CA da ficha, Poder Atual da ficha neste momento.
// O nome ganha sempre o número da cópia ("Goblin #1") pra nunca colidir com o nome da ficha do NPC
// (alvos, iniciativa e tokensOcultos de personagens são por nome).
export function montarDummieDeNpc(nome, ficha, { divisorPoderMesa, cenaId = 'default', posicao = { x: 0, y: 0 }, visibilidadeHp = 'todos', numero = 1 } = {}) {
    const hp = getVidaMaxBrutaNpc(ficha) || 100 * FATOR_EXIBICAO_VITAIS;
    let evasiva = 10;
    let resistencia = 10;
    try { evasiva = calcularCA(ficha, 'evasiva'); resistencia = calcularCA(ficha, 'resistencia'); } catch (e) { /* CA padrão */ }
    const usaResistencia = (Number(resistencia) || 0) > (Number(evasiva) || 0);
    const poder = getPoderParaDisputa(ficha, divisorPoderMesa);
    return {
        nome: `${nome} #${numero}`,
        hpMax: hp,
        hpAtual: hp,
        tipoDefesa: usaResistencia ? 'resistencia' : 'evasiva',
        valorDefesa: (usaResistencia ? Number(resistencia) : Number(evasiva)) || 10,
        visibilidadeHp,
        cenaId,
        posicao,
        fichaOrigem: nome,
        ...(poder !== null ? { poderCalculado: Math.round(poder * 100) / 100 } : {}),
    };
}
