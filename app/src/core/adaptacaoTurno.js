// ==========================================
// 🧬 ADAPTAÇÃO — parte que precisa MEDIR Poder (importa core/disputaPoder.js -> core/poder.js, por isso fica fora de core/adaptacao.js,
// que poder.js importa). Regras em core/adaptacao.js.
// ==========================================
import { getPoderParaDisputa, getPoderDummie } from './disputaPoder.js';
import { escolherOponente, registrarTurnoAdaptacao } from './adaptacao.js';

// Poder do OPONENTE mais forte entre os OUTROS combatentes da ordem de iniciativa (itens { id, nome, ficha, isDummie }).
// Jogadores/NPCs com ficha: Poder Calculado (getPoderParaDisputa, com a ficha mais fresca do store; a minha vem de minhaFicha);
// Dummies: poderCalculado definido (getPoderDummie; sem Poder definido = ignorado). Exclui o próprio portador. Devolve { nome, poder } ou null.
// ctx: { personagens, dummies, meuNome, minhaFicha, divisorPoderMesa }.
export function poderDoOponenteMaisForte(ordem, nomeDono, ctx = {}) {
    const { personagens = {}, dummies = {}, meuNome, minhaFicha, divisorPoderMesa } = ctx;
    const candidatos = [];
    (Array.isArray(ordem) ? ordem : []).forEach((item) => {
        if (!item || !item.nome) return;
        try {
            if (item.isDummie) {
                const d = (dummies && dummies[item.id]) || item.ficha;
                candidatos.push({ nome: item.nome, poder: getPoderDummie(d) });
                return;
            }
            if (item.nome === nomeDono) return;
            const ficha = item.nome === meuNome && minhaFicha ? minhaFicha : ((personagens && personagens[item.nome]) || item.ficha);
            candidatos.push({ nome: item.nome, poder: ficha ? getPoderParaDisputa(ficha, divisorPoderMesa) : null });
        } catch (e) { /* um candidato que falha é ignorado */ }
    });
    return escolherOponente(candidatos);
}

// Passo completo do início do turno, NO RASCUNHO do portador: mede o Poder dele e registra o turno contra o oponente.
// contexto = { oponente: { nome, poder } | null, divisorPoderMesa }. Devolve { gain, texto } ou null. NUNCA lança.
export function aplicarAdaptacaoNoTurno(ficha, contexto) {
    try {
        if (!ficha || !ficha.combate || ficha.combate.adaptacaoLigada !== true || !contexto || !contexto.oponente) return null;
        const poderPortador = getPoderParaDisputa(ficha, contexto.divisorPoderMesa);
        return registrarTurnoAdaptacao(ficha, { poderPortador, poderOponente: contexto.oponente.poder, nomeOponente: contexto.oponente.nome });
    } catch (e) { console.error('Adaptação falhou', e); return null; }
}

// Monta o contexto que aplicarInicioDeTurno recebe (só se a Adaptação do portador estiver ligada; senão null e nada é medido).
// `estado` = useStore.getState() (personagens, dummies, meuNome, minhaFicha, divisorPoderMesa). Nunca lança.
export function montarContextoAdaptacao(ficha, nomeDono, ordem, estado = {}) {
    try {
        if (!ficha || !ficha.combate || ficha.combate.adaptacaoLigada !== true) return null;
        const oponente = poderDoOponenteMaisForte(ordem, nomeDono, estado);
        return { oponente, divisorPoderMesa: estado.divisorPoderMesa };
    } catch (e) { console.error('Contexto da Adaptação falhou', e); return null; }
}
