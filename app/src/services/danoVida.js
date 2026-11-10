// ==========================================
// 🩸 Dano na Vida com o contexto do app: o mesmo core/danoVida.js > aplicarDanoNaVida, já sabendo em que CENA a mesa está
// (limites de gatilho "por cena"). Use dentro de updateFicha (rascunho) ou numa cópia da ficha.
// ==========================================
import useStore from '../stores/useStore';
import { aplicarDanoNaVida, novoEventoId, preverPerguntasDeDano } from '../core/danoVida';

export function cenaAtualDaMesa() {
    try {
        const st = typeof useStore.getState === 'function' ? useStore.getState() : null;
        return (st && st.cenario && st.cenario.ativa) || 'default';
    } catch (e) { return 'default'; }
}

export function aplicarDanoNaVidaDaFicha(ficha, danoExibido, ctx = {}) {
    return aplicarDanoNaVida(ficha, danoExibido, { cenaId: cenaAtualDaMesa(), ...ctx });
}

// 🔔 Modo opcional com `perguntar` (core/gatilhos.js): ANTES de gravar o dano na minha ficha, pergunta ao dono (window.confirm: Sim/Não; cancelar = Não)
// por cada gatilho que dispararia. Devolve { [chave]: boolean } para passar em ctx.decisoes de aplicarDanoNaVidaDaFicha. Sem nenhum gatilho que pergunte
// devolve {} sem abrir nada. Repete a previsão com as respostas já dadas (um "Não" pode mudar quais gatilhos ainda disparam), no máx. 4 rodadas.
// Só use no cliente do PRÓPRIO dono: em outros caminhos (dono offline, golpe de outro cliente) vale só `armado`.
export function perguntarGatilhosDeDano(ficha, danoExibido, ctx = {}, confirmar) {
    const decisoes = {};
    try {
        const perguntar = typeof confirmar === 'function' ? confirmar : (typeof window !== 'undefined' && typeof window.confirm === 'function' ? (t) => window.confirm(t) : () => true);
        for (let rodada = 0; rodada < 4; rodada++) {
            const novas = preverPerguntasDeDano(ficha, danoExibido, { cenaId: cenaAtualDaMesa(), ...ctx, decisoes: { ...decisoes } }).filter(p => decisoes[p.chave] === undefined);
            if (novas.length === 0) break;
            novas.forEach((p) => { decisoes[p.chave] = perguntar(`Usar ${p.nome}${p.fonte ? ` (${p.fonte})` : ''}?

OK = Sim, usar.  Cancelar = Não (o gatilho não gasta o limite de usos).`) === true; });
        }
    } catch (e) { console.error('Pergunta de gatilho falhou', e); }
    return decisoes;
}

// 🔔 Ação pedirEscolha: o DONO escolhe no próprio cliente (window.prompt numerado; síncrono como o confirm do `perguntar`).
// Devolve (pergunta, textos, chave) => índice | null. Cancelar, vazio ou número inválido = null (o motor não aplica nenhuma opção).
// A resposta fica em cache por gatilho+texto dentro da MESMA instância, para que um produtor Immer repetido não pergunte duas vezes.
// Crie uma instância por disparo e use SÓ em fichas do próprio dono (nunca em cópias de fichas de outros jogadores).
export function criarEscolhaDoDono(prompt) {
    const perguntarAoDono = typeof prompt === 'function' ? prompt : (typeof window !== 'undefined' && typeof window.prompt === 'function' ? (t) => window.prompt(t) : () => null);
    const cache = new Map();
    return (pergunta, textos, chave) => {
        const lista = Array.isArray(textos) ? textos : [];
        const id = `${chave || ''}|${pergunta}|${lista.join('/')}`;
        if (cache.has(id)) return cache.get(id);
        let idx = null;
        try {
            const resp = perguntarAoDono(pergunta + '\n\n' + lista.map((t, k) => (k + 1) + ') ' + t).join('\n') + '\n\nDigite o número (Cancelar = nenhuma opção).');
            const n = resp === null || resp === undefined ? NaN : parseInt(String(resp).trim(), 10);
            if (Number.isInteger(n) && n >= 1 && n <= lista.length) idx = n - 1;
        } catch (e) { idx = null; }
        cache.set(id, idx);
        return idx;
    };
}

// Frase única dos gatilhos/imunidade para o feed ('' se nada disparou).
export const textoDosGatilhos = (r) => (r && r.textos && r.textos.length > 0 ? `🔔 ${r.textos.join(' · ')}` : '');

export { novoEventoId };
