// ==========================================
// 🎯 ALVO PARA AS CONDIÇÕES DE GATILHO (`alvo_com_estado`, `alvo_vida_abaixo`, `alvo_com_debuff`, `alvo_defende_com`).
// Resolve, a partir do store, o alvo "Dummie-like" que core/efeitosCondicionais.js > montarContextoDeCombate espera.
// Sem alvo encontrado devolve null: as condições de alvo continuam falhando fechado.
// ==========================================
import useStore from '../stores/useStore';
import { montarAlvoPersonagem } from '../core/alvoCombate';
import { coletarGatilhos } from '../core/gatilhos';

// Alvo pelo NOME (personagem ou Dummie). Para o evento `atingido` o "alvo" é o atacante, que só vem como nome.
export function alvoDoGatilhoPorNome(nome) {
    const n = String(nome || '').trim();
    if (!n) return null;
    try {
        const st = useStore.getState();
        const ficha = n === st.meuNome ? st.minhaFicha : (st.personagens || {})[n];
        if (ficha && typeof ficha === 'object') return montarAlvoPersonagem(n, ficha, st.divisorPoderMesa);
        const d = Object.values(st.dummies || {}).find(x => x && x.nome === n);
        return d || null;
    } catch (e) { return null; }
}

// Alvo de um item de resolverAcertoNoAlvo ({ nome, dummieId? }): 'pj:Nome' = personagem; outro id = Dummie do store.
export function alvoDoGatilhoPorItem(item) {
    if (!item) return null;
    const id = String(item.dummieId || '');
    try {
        if (id && !id.startsWith('pj:')) return (useStore.getState().dummies || {})[id] || null;
    } catch (e) { return null; }
    return alvoDoGatilhoPorNome(id ? id.slice(3) : item.nome);
}

// Algum gatilho da ficha usa condição de alvo (`alvo_*`)? Só então vale montar o alvo (evita custo em todo golpe).
export function usaCondicaoDeAlvo(ficha) {
    try {
        return coletarGatilhos(ficha).some(c => (c.gatilho.condicoes || []).some(cd => /^alvo_/.test(String(cd))));
    } catch (e) { return false; }
}
