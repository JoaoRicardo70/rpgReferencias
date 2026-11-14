// ==========================================
// 🧬 ADAPTAÇÃO — parte que precisa MEDIR Poder (importa core/disputaPoder.js -> core/poder.js, por isso fica fora de core/adaptacao.js,
// que poder.js importa). Regras em core/adaptacao.js.
// ==========================================
import { getPoderParaDisputa, getPoderDummie } from './disputaPoder.js';
import { escolherOponente, registrarTurnoAdaptacao } from './adaptacao.js';
import { relacaoEntre } from './lados.js';
import { combateAtivo } from './combateEstado.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';
import { zenkaiLigado } from './zenkai.js';
import { medirTurnoZenkai } from './zenkaiMedicao.js';

// Poder do OPONENTE mais forte entre os combatentes da ordem de iniciativa (itens { id, nome, ficha, isDummie }) que têm relação HOSTIL com o portador
// (core/lados.js > relacaoEntre, pelo cenário: aliados e neutros NÃO contam; sem hostil válido = null e nada é registrado).
// Jogadores/NPCs com ficha: Poder Calculado (getPoderParaDisputa, com a ficha mais fresca do store; a minha vem de minhaFicha);
// Dummies: poderCalculado definido (getPoderDummie; sem Poder definido = ignorado). Exclui o próprio portador. Devolve { nome, poder } ou null.
// ctx: { personagens, dummies, meuNome, minhaFicha, divisorPoderMesa, cenario, fichaPortador? }.
export function poderDoOponenteMaisForte(ordem, nomeDono, ctx = {}) {
    const { personagens = {}, dummies = {}, meuNome, minhaFicha, divisorPoderMesa, cenario } = ctx;
    const fichaDono = ctx.fichaPortador || (nomeDono === meuNome && minhaFicha ? minhaFicha : (personagens && personagens[nomeDono])) || null;
    const portador = { id: nomeDono, nome: nomeDono, ficha: fichaDono, isDummie: false };
    const candidatos = [];
    (Array.isArray(ordem) ? ordem : []).forEach((item) => {
        if (!item || !item.nome) return;
        try {
            if (item.isDummie) {
                const d = (dummies && dummies[item.id]) || item.ficha;
                if (relacaoEntre(cenario, portador, { id: item.id, nome: item.nome, ficha: d, isDummie: true }) !== 'hostil') return;
                candidatos.push({ nome: item.nome, poder: getPoderDummie(d) });
                return;
            }
            if (item.nome === nomeDono) return;
            const ficha = item.nome === meuNome && minhaFicha ? minhaFicha : ((personagens && personagens[item.nome]) || item.ficha);
            if (relacaoEntre(cenario, portador, { id: item.nome, nome: item.nome, ficha, isDummie: false }) !== 'hostil') return;
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

// 💥 Zenkai (core/zenkai.js): no início do turno mede Fadiga, Forma, Vida e a razão Poder do oponente ÷ Poder do portador (mesmo oponente da Adaptação).
// Só faz algo com Zenkai ligado. `contexto` = o de montarContextoAdaptacao. Devolve true se registrou. NUNCA lança.
export function aplicarZenkaiNoTurno(ficha, contexto) {
    try {
        if (!zenkaiLigado(ficha) || !contexto) return false;
        let razao = null;
        if (contexto.oponente) {
            const pp = Number(getPoderParaDisputa(ficha, contexto.divisorPoderMesa));
            const po = contexto.oponente.poder === null || contexto.oponente.poder === undefined || contexto.oponente.poder === '' ? NaN : Number(contexto.oponente.poder);
            if (Number.isFinite(pp) && pp > 0 && Number.isFinite(po) && po >= 0) razao = po / pp;
        }
        return medirTurnoZenkai(ficha, { razao, vidaMaxBruta: getVidaMaxBrutaNpc(ficha) });
    } catch (e) { console.error('Zenkai falhou', e); return false; }
}

// Monta o contexto que aplicarInicioDeTurno recebe (só se a Adaptação OU o Zenkai do portador estiverem ligados; senão null e nada é medido: o custo de medir
// o oponente só existe quando alguma das duas está ligada). `estado.inicioDeCombate` = primeiro turno do combate (o Zenkai reinicia a telemetria).
// `estado` = useStore.getState() (personagens, dummies, meuNome, minhaFicha, divisorPoderMesa, cenario) + cenaIdCombate opcional. Nunca lança.
export function montarContextoAdaptacao(ficha, nomeDono, ordem, estado = {}) {
    try {
        if (!ficha || !ficha.combate || (ficha.combate.adaptacaoLigada !== true && ficha.combate.zenkaiLigado !== true)) return null;
        // Com `estado.cenaIdCombate` a Adaptação só registra turno se a cena tem combate ATIVO (fase de preparação não conta).
        if (estado.cenaIdCombate && !combateAtivo(estado.cenario, estado.cenaIdCombate)) return null;
        const oponente = poderDoOponenteMaisForte(ordem, nomeDono, { ...estado, fichaPortador: ficha });
        return { oponente, divisorPoderMesa: estado.divisorPoderMesa, ...(estado.inicioDeCombate ? { zenkaiReiniciar: true } : {}) };
    } catch (e) { console.error('Contexto da Adaptação falhou', e); return null; }
}
