// ==========================================
// 🎯 ALVO DE COMBATE — quem pode ser atingido pelo Ataque/Acerto de quem está logado.
// Antes só dava pra mirar num Dummie (entidade de combate do Mapa). Agora também dá pra mirar
// num PERSONAGEM de verdade (outro jogador ou NPC com ficha própria): o alvoSelecionado do store
// guarda 'pj:<nome>' e este módulo monta, a partir da ficha dele, um objeto com o MESMO formato
// do Dummie (nome, hpAtual/hpMax brutos, valorDefesa, poderCalculado, posicao...) — assim o
// cálculo de acerto, a Disputa de Poder e o dano proporcional à Vida funcionam igual pros dois.
// A diferença: o personagem tem Reduções/Resistências/Domínio na ficha, aplicados em sequência
// sobre o dano (core/reducaoDano.js), e a Vida é gravada na ficha dele (services/danoAlvo.js).
// ==========================================
import { calcularCA } from './engine.js';
import { getPoderParaDisputa } from './disputaPoder.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';
import { getPassosReducaoDano, aplicarReducoesSequenciais, descreverReducoes } from './reducaoDano.js';
import { getNivelDominio, calcularReducaoDanoElemental } from './dominios.js';

export const PREFIXO_ALVO_PERSONAGEM = 'pj:';

export function idAlvoPersonagem(nome) {
    return `${PREFIXO_ALVO_PERSONAGEM}${nome}`;
}

export function ehAlvoPersonagem(id) {
    return typeof id === 'string' && id.startsWith(PREFIXO_ALVO_PERSONAGEM) && id.length > PREFIXO_ALVO_PERSONAGEM.length;
}

export function nomeAlvoPersonagem(id) {
    return ehAlvoPersonagem(id) ? id.slice(PREFIXO_ALVO_PERSONAGEM.length) : null;
}

// Alvo "Dummie-like" a partir da ficha de um personagem. Defesa = a maior entre Evasiva e Resistência
// (mesma regra da Gaveta de NPCs). Devolve null sem ficha.
export function montarAlvoPersonagem(nome, ficha, divisorPoderMesa) {
    if (!ficha) return null;
    let evasiva = 10;
    let resistencia = 10;
    try { evasiva = calcularCA(ficha, 'evasiva'); resistencia = calcularCA(ficha, 'resistencia'); } catch (e) { /* CA padrão */ }
    const usaResistencia = (Number(resistencia) || 0) > (Number(evasiva) || 0);
    const hpMax = getVidaMaxBrutaNpc(ficha) || 0;
    const atual = Number(ficha.vida && ficha.vida.atual);
    const poder = getPoderParaDisputa(ficha, divisorPoderMesa);
    const posicao = ficha.posicao || null;
    return {
        nome,
        isPersonagem: true,
        personagemNome: nome,
        ficha,
        hpMax,
        hpAtual: Number.isFinite(atual) ? atual : hpMax,
        tipoDefesa: usaResistencia ? 'resistencia' : 'evasiva',
        valorDefesa: (usaResistencia ? Number(resistencia) : Number(evasiva)) || 10,
        visibilidadeHp: 'todos',
        cenaId: (posicao && posicao.cenaId) || 'default',
        posicao,
        ...(poder !== null ? { poderCalculado: Math.round(poder * 100) / 100 } : {}),
    };
}

// Resolve o alvoSelecionado (id de Dummie ou 'pj:<nome>') no objeto do alvo, ou null. Nunca devolve
// o próprio jogador logado (não dá pra mirar em si mesmo).
export function resolverAlvoCombate(idAlvo, { dummies, personagens, meuNome, divisorPoderMesa } = {}) {
    if (!idAlvo) return null;
    if (ehAlvoPersonagem(idAlvo)) {
        const nome = nomeAlvoPersonagem(idAlvo);
        if (!nome || nome === meuNome) return null;
        return montarAlvoPersonagem(nome, personagens ? personagens[nome] : null, divisorPoderMesa);
    }
    return (dummies && dummies[idAlvo]) || null;
}

// Reduções/Resistências do PERSONAGEM atingido (ficha) + Domínio elemental, em sequência.
// Dummie (ou sem redução nenhuma) devolve o dano como veio. nivelAtacante = Domínio de quem golpeou.
export function reduzirDanoNoAlvo(alvo, dano, elemento, { nivelAtacante = 0, nivelDefensorOverride = null } = {}) {
    const inicial = Math.max(0, Number(dano) || 0);
    if (!alvo || !alvo.isPersonagem) return { final: inicial, detalhe: [], texto: '' };
    const passos = getPassosReducaoDano(alvo.ficha, elemento);
    if (elemento) {
        const nivelDefensor = nivelDefensorOverride !== null && nivelDefensorOverride !== undefined && nivelDefensorOverride !== ''
            ? Number(nivelDefensorOverride) || 0
            : getNivelDominio(alvo.ficha, elemento);
        const reducaoDominio = calcularReducaoDanoElemental(nivelDefensor, Number(nivelAtacante) || 0);
        if (reducaoDominio > 0) passos.push({ nome: `Domínio (${elemento})`, percentual: reducaoDominio * 100, origem: 'dominio' });
    }
    if (passos.length === 0) return { final: inicial, detalhe: [], texto: '' };
    const r = aplicarReducoesSequenciais(inicial, passos);
    return { final: r.final, detalhe: r.detalhe, texto: descreverReducoes(r) };
}
