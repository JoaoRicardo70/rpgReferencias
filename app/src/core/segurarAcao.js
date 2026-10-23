// ==========================================
// ⏳ SEGURAR AÇÃO (Hold Action)
//
// Em vez de gastar a Ação no próprio turno, o personagem a SEGURA para usar mais tarde, esperando um acontecimento
// (o "gatilho", anotado por quem segura: "quando o goblin sair da cobertura").
//   • Segurar custa 1 Ação do turno e a guarda em ficha.combate.acoesSeguradas = [{ id, gatilho, criadoEm }].
//   • Quantas podem ser seguradas ao mesmo tempo é decidido pelo Mestre: um padrão da mesa (cenario.segurarAcaoMax)
//     e, se quiser, um limite próprio por personagem (ficha.combate.segurarAcaoMax).
//   • Usar uma Ação segurada gera um CRÉDITO (ficha.combate.acaoSeguradaCredito): a próxima Ação gasta (um ataque, uma
//     técnica que custa Ação...) sai dele e não do contador do turno (core/acoes.js > alternarAcao).
//   • Ação segurada que não foi usada vale até o começo do próximo turno de quem a segurou (core/acoes.js > restaurarAcoes).
// ==========================================
import { ACOES_MAXIMO, CAMPO_CREDITO_SEGURADA, getAcoesExibicao, alternarAcao, getCreditoAcaoSegurada } from './acoes.js';

export const SEGURAR_PADRAO = 1;

const inteiroLimitado = (v, min, max) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
};

// Padrão da mesa (Mestre): quantas Ações cada um pode segurar. Vazio/inválido = 1; 0 desliga a regra.
export function getLimitePadraoSegurar(cenario) {
    const bruto = cenario?.segurarAcaoMax;
    if (bruto === undefined || bruto === null || bruto === '') return SEGURAR_PADRAO;
    const n = inteiroLimitado(bruto, 0, ACOES_MAXIMO);
    return n === null ? SEGURAR_PADRAO : n;
}

// Limite deste personagem: o ajuste do Mestre na ficha, senão o padrão da mesa.
export function getLimiteSegurar(ficha, cenario) {
    const bruto = ficha?.combate?.segurarAcaoMax;
    if (bruto !== undefined && bruto !== null && bruto !== '') {
        const n = inteiroLimitado(bruto, 0, ACOES_MAXIMO);
        if (n !== null) return n;
    }
    return getLimitePadraoSegurar(cenario);
}

export function getAcoesSeguradas(ficha) {
    const lista = ficha?.combate?.acoesSeguradas;
    return Array.isArray(lista) ? lista.filter(Boolean) : [];
}

// Pode segurar agora? { ok, motivo }.
export function podeSegurarAcao(ficha, limite) {
    if (!ficha) return { ok: false, motivo: 'Sem ficha.' };
    if (limite <= 0) return { ok: false, motivo: 'O Mestre não liberou segurar Ação.' };
    if (getAcoesSeguradas(ficha).length >= limite) return { ok: false, motivo: `Você já segura o máximo de Ações (${limite}).` };
    if (getAcoesExibicao(ficha).padrao.atual <= 0) return { ok: false, motivo: 'Sem Ação disponível para segurar.' };
    return { ok: true, motivo: '' };
}

// Segura uma Ação (muta o rascunho): gasta 1 Ação do turno e a guarda com o gatilho. Devolve { ok, motivo, entrada }.
export function segurarAcao(ficha, gatilho, limite, agora = Date.now()) {
    const pode = podeSegurarAcao(ficha, limite);
    if (!pode.ok) return pode;
    // Gasta direto do contador do turno (sem passar pelo crédito de Ação segurada em uso).
    const credito = getCreditoAcaoSegurada(ficha);
    if (credito > 0) ficha.combate[CAMPO_CREDITO_SEGURADA] = 0;
    alternarAcao(ficha, 'padrao', true);
    if (credito > 0) ficha.combate[CAMPO_CREDITO_SEGURADA] = credito;
    if (!ficha.combate) ficha.combate = {};
    const entrada = { id: `seg_${agora}_${getAcoesSeguradas(ficha).length}`, gatilho: String(gatilho || '').trim().slice(0, 160), criadoEm: agora };
    ficha.combate.acoesSeguradas = [...getAcoesSeguradas(ficha), entrada];
    return { ok: true, motivo: '', entrada };
}

// Usa uma Ação segurada: tira da lista e dá o crédito que paga a próxima Ação. Devolve a entrada usada (ou null).
export function usarAcaoSegurada(ficha, id) {
    const lista = getAcoesSeguradas(ficha);
    const entrada = lista.find(a => a.id === id);
    if (!entrada) return null;
    ficha.combate.acoesSeguradas = lista.filter(a => a.id !== id);
    ficha.combate[CAMPO_CREDITO_SEGURADA] = getCreditoAcaoSegurada(ficha) + 1;
    return entrada;
}

// Desiste de uma Ação segurada: devolve a Ação ao contador do turno (se ainda houver espaço). Devolve a entrada (ou null).
export function soltarAcaoSegurada(ficha, id) {
    const lista = getAcoesSeguradas(ficha);
    const entrada = lista.find(a => a.id === id);
    if (!entrada) return null;
    ficha.combate.acoesSeguradas = lista.filter(a => a.id !== id);
    alternarAcao(ficha, 'padrao', false);
    return entrada;
}
