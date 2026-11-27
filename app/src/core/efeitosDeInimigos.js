// ==========================================
// ☠️ EFEITOS QUE VALEM COMO PENALIDADE PARA OS INIMIGOS DO PORTADOR — espelho de core/efeitosDeAliados.js.
//   Um efeito de Poder (ativo/passivo) marcado `valeParaInimigos: true` (atributo evasiva, resistencia ou acerto, valor NEGATIVO) vira penalidade para
//   quem é INIMIGO do portador (core/lados.js > relacaoEntre === 'hostil') e está na CENA ATIVA, enquanto a condição do efeito valer PARA O PORTADOR
//   (ex.: `quando: 'estado_em_campo:presa'` = "há alguém com o estado Presa na cena"; sem contexto a condição falha fechada).
//   • Defensor PERSONAGEM (jogador/NPC com ficha): core/efeitosCondicionais.js > coletarEfeitos soma estes efeitos aos dele; o efeito dono NUNCA se aplica
//     ao próprio portador (coletarEfeitos descarta `valeParaInimigos` na coleta própria).
//   Regras: só valor < 0 conta (positivo seria buff para o inimigo e é ignorado); no máximo UM efeito por (nome do Poder, atributo) entre todos os portadores;
//   o acumulado por atributo não passa de -LIMITE_PENALIDADE_INIMIGOS (-20). O efeito devolvido já vem sem `quando` (a condição foi checada no portador).
//   Privacidade: só números saem; nenhum nome de portador é exposto ao defensor.
//   Não recursivo: lê só os Poderes dos portadores inimigos, nunca os efeitos "de inimigos" deles. Cache de 1 entrada pelas referências da mesa.
// ==========================================
import { relacaoEntre } from './lados.js';
import { naCena } from './aliadosEmCampo.js';
import { resolverEfeitosEntidade } from './efeitos-resolver.js';
import useStore from '../stores/useStore.js';

export const ATRIBUTOS_PARA_INIMIGOS = ['evasiva', 'resistencia', 'acerto'];
export const LIMITE_PENALIDADE_INIMIGOS = 20;

const norm = (t) => String(t ?? '').trim().toLowerCase();
export const efeitoPodeValerParaInimigos = (atributo) => ATRIBUTOS_PARA_INIMIGOS.includes(norm(atributo));

const sanitizarNome = (n) => (!n ? '' : String(n).replace(/[.#$\[\]\/]/g, '_').trim());

// Puro. `defensor` = { dados, nome }; `personagens` = { nome: ficha } (portadores possíveis); `avaliar(fichaPortador, nomePortador, efeito)` = a condição vale?
// Devolve os efeitos já filtrados, SEM `quando`, com a soma por atributo limitada a -LIMITE_PENALIDADE_INIMIGOS.
export function coletarEfeitosDeInimigos({ defensor, personagens, cenario, cenaId, avaliar }) {
    const saida = [];
    if (!defensor || !defensor.dados || !cenaId || typeof avaliar !== 'function') return saida;
    const alvo = defensor.dados;
    const nomeD = sanitizarNome(defensor.nome);
    const vistos = new Set();
    const acumulado = {};
    Object.keys(personagens || {}).forEach((nome) => {
        const portador = personagens[nome];
        if (!portador || typeof portador !== 'object' || !Array.isArray(portador.poderes)) return;
        if (portador === defensor.dados || (nomeD && sanitizarNome(nome) === nomeD)) return;
        if (!naCena(portador, cenaId)) return;
        if (relacaoEntre(cenario, alvo, portador) !== 'hostil') return;
        portador.poderes.forEach((p) => {
            if (!p) return;
            const r = resolverEfeitosEntidade(p, portador, nome);
            // Dedup só entre portadores DIFERENTES com o mesmo Poder/atributo; dentro do mesmo Poder todos os efeitos que passam valem (o teto acumulado continua).
            const vistosDoPoder = new Set();
            const juntar = (lista) => (lista || []).forEach((e) => {
                if (!e || typeof e !== 'object' || e.valeParaInimigos !== true || !efeitoPodeValerParaInimigos(e.atributo)) return;
                if (norm(e.propriedade ?? 'base') !== 'base') return;
                const valor = parseFloat(e.valor);
                if (!Number.isFinite(valor) || valor >= 0) return;
                const chave = `${norm(p.nome || p.id)}|${norm(e.atributo)}`;
                if (vistos.has(chave) && !vistosDoPoder.has(chave)) return;
                let passa = false;
                try { passa = avaliar(portador, nome, e) === true; } catch (err) { passa = false; }
                if (!passa) return;
                vistos.add(chave);
                vistosDoPoder.add(chave);
                const atr = norm(e.atributo);
                const usado = acumulado[atr] || 0;
                const permitido = Math.max(valor, -LIMITE_PENALIDADE_INIMIGOS - usado); // não passa do teto acumulado
                if (permitido >= 0) return;
                acumulado[atr] = usado + permitido;
                const { quando, valeParaInimigos, ...resto } = e;
                saida.push({ ...resto, quando: '', valor: String(permitido) });
            });
            if (p.ativa) juntar(r.efeitos);
            juntar(r.efeitosPassivos);
        });
    });
    return saida;
}

// Índice por mesa: só os portadores que têm ALGUM efeito `valeParaInimigos` (em Poderes, Formas ou Estágios). Quem nunca usa o efeito não paga nada além deste
// varrer único por mudança da mesa (personagens/cenario). O filtro por defensor/cena/relação/condição vem depois, em coletarEfeitosDeInimigos.
const temMarca = (lista) => Array.isArray(lista) && lista.some(e => e && e.valeParaInimigos === true);
const poderTemMarca = (p) => !!p && (temMarca(p.efeitos) || temMarca(p.efeitosPassivos) || !!p.estagios
    || (Array.isArray(p.formas) && p.formas.some(f => f && (temMarca(f.efeitos) || temMarca(f.efeitosPassivos)))));
let cacheIndice = null;
function portadoresComMarca(st) {
    if (cacheIndice && cacheIndice.p === st.personagens && cacheIndice.c === st.cenario) return cacheIndice.v;
    const v = {};
    Object.keys(st.personagens || {}).forEach((n) => {
        const f = st.personagens[n];
        if (f && typeof f === 'object' && Array.isArray(f.poderes) && f.poderes.some(poderTemMarca)) v[n] = f;
    });
    cacheIndice = { p: st.personagens, c: st.cenario, v };
    return v;
}

let cache = null;
// Efeitos de inimigos do defensor PERSONAGEM `ficha` na mesa ativa ([] sem mesa/nome). Compartilhado (mesma referência enquanto a mesa não muda): não mute.
export function efeitosDeInimigosDaMesa(ficha, nomeDefensor, avaliar) {
    if (!ficha || typeof ficha !== 'object' || !sanitizarNome(nomeDefensor) || typeof avaliar !== 'function') return [];
    try {
        const st = useStore.getState();
        if (cache && cache.p === st.personagens && cache.c === st.cenario && cache.f === ficha && cache.n === nomeDefensor && cache.a === avaliar) return cache.v;
        const portadores = portadoresComMarca(st);
        let v = [];
        if (Object.keys(portadores).length > 0) {
            const cenaId = (st.cenario && st.cenario.ativa) || 'default';
            v = coletarEfeitosDeInimigos({ defensor: { dados: ficha, nome: nomeDefensor }, personagens: portadores, cenario: st.cenario || null, cenaId, avaliar });
        }
        cache = { p: st.personagens, c: st.cenario, f: ficha, n: nomeDefensor, a: avaliar, v };
        return v;
    } catch (e) { return []; }
}
