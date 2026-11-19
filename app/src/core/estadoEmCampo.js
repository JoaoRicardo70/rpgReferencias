// ==========================================
// 🎯 ESTADO EM CAMPO — "há alguém com o estado X na cena ativa?" (condição `estado_em_campo:<id>`, core/efeitosCondicionais.js; ex.: `presa`).
//   Conta personagens POSICIONADOS na cena ativa (mesmo critério do mapa: core/aliadosEmCampo.js > naCena) e NPCs/Dummies dela, de qualquer lado,
//   conscientes ou não. Devolve só verdadeiro/falso: nunca quem é (privacidade: nenhum nome sai daqui).
//   Sem mesa/store a resposta é false (falha fechada). Cache de 1 entrada por (personagens, dummies, cenario, estado).
// ==========================================
import { condicoesDaFicha } from './condicoes.js';
import { naCena } from './aliadosEmCampo.js';
import useStore from '../stores/useStore.js';

// Puro: `personagens` = { nome: ficha }, `dummies` = { id: dummie }, `cenaId` = cena ativa.
export function existeEstadoEmCena({ personagens, dummies, cenaId, estadoId }) {
    if (!estadoId || !cenaId) return false;
    const tem = (dados) => !!dados && typeof dados === 'object' && condicoesDaFicha(dados).some(c => c.id === estadoId);
    const ps = personagens || {};
    if (Object.keys(ps).some(n => ps[n] && naCena(ps[n], cenaId) && tem(ps[n]))) return true;
    const ds = dummies || {};
    return Object.keys(ds).some(id => ds[id] && (ds[id].cenaId || 'default') === cenaId && tem(ds[id]));
}

let cache = null;
export function existeEstadoEmCampoDaMesa(estadoId) {
    try {
        const st = useStore.getState();
        if (cache && cache.p === st.personagens && cache.d === st.dummies && cache.c === st.cenario && cache.e === estadoId) return cache.v;
        const cenaId = (st.cenario && st.cenario.ativa) || 'default';
        const v = existeEstadoEmCena({ personagens: st.personagens, dummies: st.dummies, cenaId, estadoId });
        cache = { p: st.personagens, d: st.dummies, c: st.cenario, e: estadoId, v };
        return v;
    } catch (e) { return false; }
}
