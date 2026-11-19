// ==========================================
// 🛡️ ALIADOS EM CAMPO — contagem de aliados do portador na CENA ATIVA, com filtro opcional (lógica pura + atalhos que leem a mesa).
//   "Em campo" = personagens (e NPCs/Dummies) POSICIONADOS na CENA ATIVA (cenario.ativa), com o mesmo critério do mapa (core/alcance.js >
//   getPosicaoEntidade: precisa de x/y), conscientes ou não: NÃO exige iniciativa nem vida > 0, e NÃO é a mesa inteira.
//   Aliado = relação 'aliada' de core/lados.js (mesma equipe ou equipes aliadas); neutros e inimigos não contam; o portador nunca conta.
//   IDENTIDADE DO PORTADOR: vem do CHAMADOR (`nomePortador`, a chave em `personagens`); nunca é deduzido de ficha.nome/bio.nome. Sem nome
//   (ou se ele não achar a ficha), a contagem FALHA FECHADA: 0 aliados. Compara-se sempre sanitizarNome() dos dois lados.
//   Filtro opcional (texto "tipo=valor"): afiliacao (ficha.bio.afiliacao, contém o texto), raca (id ou nome da Raça, igual), classe (ficha.bio.classe, igual).
//   Comparação sem acento e sem maiúsculas. Aliado sem o dado do filtro não passa (falha fechada). NPCs/Dummies só passam sem filtro ou com filtro que o
//   próprio registro responda (bio).
//   PRIVACIDADE: no filtro por RAÇA só contam os aliados cuja Raça o PORTADOR pode ver (core/racasVisibilidade.js > visivelPara; o dono de uma Raça
//   "só eu e o Mestre"/"só o Mestre" não é revelado a outros jogadores; o Mestre efetivo vê tudo), para a contagem não virar oráculo da Raça oculta.
//   Este módulo devolve só números/listas de aliados e nunca mostra a Raça de ninguém.
//   Cache de 1 entrada (por referência de personagens/dummies/cenario, cena, portador, filtro e Mestre) para não recalcular a cada leitura.
// Usado por: condição `aliados_em_campo:N[:tipo=valor]` (core/efeitosCondicionais.js), valor por aliado `escalaAliados` (core/efeitos-resolver.js)
// e efeitos `valeParaAliados` (core/efeitosDeAliados.js).
// ==========================================
import { relacaoEntre, mesmoCombatente, comoCombatente } from './lados.js';
import { resolverRaca } from './racas.js';
import { getPosicaoEntidade } from './alcance.js';
import { nivelDaRaca, visivelPara, CHAVE_PRINCIPAL } from './racasVisibilidade.js';
import useStore from '../stores/useStore.js';

// Mesma regra de stores/useStore.js > sanitizarNome (cópia local: o store é mockado por vários testes e importar o nome nomeado quebraria).
const sanitizarNome = (n) => (!n ? '' : String(n).replace(/[.#$\[\]\/]/g, '_').trim());

export const TIPOS_FILTRO_ALIADO = ['afiliacao', 'raca', 'classe'];
export const LIMITE_ALIADOS_CONTADOS = 200;
export const LIMITE_FATOR_POR_ALIADO = 1e6;
const LIMITE_VALOR_FILTRO = 40;

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// "afiliacao=Favonius" -> { tipo: 'afiliacao', valor: 'favonius' }; vazio/inválido -> null (sem filtro). Aceita um objeto { tipo, valor } também.
export function normalizarFiltroAliado(bruto) {
    let tipo = ''; let valor = '';
    if (bruto && typeof bruto === 'object') { tipo = semAcento(bruto.tipo); valor = bruto.valor; }
    else {
        const t = String(bruto ?? '');
        const i = t.indexOf('=');
        if (i < 0) return null;
        tipo = semAcento(t.slice(0, i)); valor = t.slice(i + 1);
    }
    valor = semAcento(valor).replace(/[:|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITE_VALOR_FILTRO);
    if (!TIPOS_FILTRO_ALIADO.includes(tipo) || !valor) return null;
    return { tipo, valor };
}

export const filtroAliadoParaTexto = (f) => (f ? `${f.tipo}=${f.valor}` : '');

// A Raça de `dados` é visível para quem olha? `viewer` = { souMestre }. O portador é outro jogador (nunca o dono da Raça do aliado).
function racaVisivelParaPortador(dados, viewer) {
    const souMestre = !!(viewer && viewer.souMestre);
    return visivelPara({ nivel: nivelDaRaca(dados, CHAVE_PRINCIPAL), souDono: false, souMestre });
}

// O aliado (ficha/registro com `bio`) passa no filtro? Sem filtro, sempre. `viewer` ({ souMestre }) vale para o filtro por Raça.
export function aliadoPassaFiltro(cenario, dados, filtro, viewer = null) {
    if (!filtro) return true;
    const bio = (dados && dados.bio) || null;
    if (!bio) return false;
    if (filtro.tipo === 'afiliacao') return semAcento(bio.afiliacao).includes(filtro.valor);
    if (filtro.tipo === 'classe') return semAcento(bio.classe) === filtro.valor;
    if (filtro.tipo === 'raca') {
        const r = resolverRaca(cenario, dados);
        // Raça oculta ao portador (nível da principal ou da própria Raça): não entra na contagem por Raça.
        if (!racaVisivelParaPortador(dados, viewer)) return false;
        if (r.id && !visivelPara({ nivel: nivelDaRaca(dados, r.id), souDono: false, souMestre: !!(viewer && viewer.souMestre) })) return false;
        return semAcento(r.id) === filtro.valor || semAcento(r.nome) === filtro.valor;
    }
    return false;
}

// Está NA cena? Mesmo critério do mapa (core/alcance.js): posição conhecida (x/y) naquela cena.
export const naCena = (f, cenaId) => {
    const pos = getPosicaoEntidade(f, cenaId);
    return !!pos && (pos.cenaId || 'default') === cenaId;
};

// Lista os aliados do portador na cena: [{ nome, ficha, dummie }]. `portador` = { ficha, nome } (nome = chave em `personagens`, obrigatório:
// sem ele a lista é VAZIA). `personagens` = { nome: ficha }, `dummies` = { id: dummie }. `viewer` = { souMestre } (filtro por Raça).
export function listarAliadosEmCampo({ portador, personagens, dummies, cenario, cenaId, filtro = null, viewer = null }) {
    const lista = [];
    const nomeP = sanitizarNome(portador && portador.nome);
    if (!portador || !portador.ficha || !cenaId || !nomeP) return lista;
    const f = typeof filtro === 'string' ? normalizarFiltroAliado(filtro) : filtro;
    Object.keys(personagens || {}).forEach((nome) => {
        const outra = personagens[nome];
        if (!outra || typeof outra !== 'object' || outra === portador.ficha) return;
        if (sanitizarNome(nome) === nomeP) return;
        if (!naCena(outra, cenaId)) return;
        if (relacaoEntre(cenario, portador.ficha, outra) !== 'aliada') return;
        if (aliadoPassaFiltro(cenario, outra, f, viewer)) lista.push({ nome, ficha: outra, dummie: false });
    });
    Object.keys(dummies || {}).forEach((id) => {
        const d = dummies[id];
        if (!d || typeof d !== 'object' || d === portador.ficha) return;
        if ((d.cenaId || 'default') !== cenaId) return;
        const comoDummie = comoCombatente(d, true);
        if (mesmoCombatente(comoCombatente(portador.ficha, false), comoDummie)) return;
        if (relacaoEntre(cenario, portador.ficha, comoDummie) !== 'aliada') return;
        if (aliadoPassaFiltro(cenario, d, f, viewer)) lista.push({ nome: String(d.nome || id), ficha: d, dummie: true });
    });
    return lista;
}

// Conta os aliados do portador na cena (ver listarAliadosEmCampo). Inteiro entre 0 e LIMITE_ALIADOS_CONTADOS.
export function contarAliadosEmCampo(params) {
    return Math.min(LIMITE_ALIADOS_CONTADOS, listarAliadosEmCampo(params).length);
}

// Cache de 1 entrada por chave de referências (a ficha do portador entra na chave: o resultado depende da equipe dela).
let cacheLista = null;
function chaveDe(st, ficha, nome, filtroTexto) {
    return { personagens: st.personagens, dummies: st.dummies, cenario: st.cenario, ficha, nome, filtroTexto, mestre: st.isMestre === true };
}
const mesmaChave = (a, b) => !!a && !!b && a.personagens === b.personagens && a.dummies === b.dummies && a.cenario === b.cenario && a.ficha === b.ficha && a.nome === b.nome && a.filtroTexto === b.filtroTexto && a.mestre === b.mestre;

// Aliados na mesa ativa (lê o store). `nomePortador` é OBRIGATÓRIO (chave do portador em `personagens`); sem ele, [] (falha fechada).
export function listarAliadosEmCampoDaMesa(ficha, filtro = null, nomePortador = '') {
    if (!ficha || typeof ficha !== 'object' || !sanitizarNome(nomePortador)) return [];
    try {
        const st = useStore.getState();
        const f = typeof filtro === 'string' ? normalizarFiltroAliado(filtro) : filtro;
        const chave = chaveDe(st, ficha, sanitizarNome(nomePortador), filtroAliadoParaTexto(f));
        if (cacheLista && mesmaChave(cacheLista.chave, chave)) return cacheLista.valor;
        const cenario = st.cenario || null;
        const valor = listarAliadosEmCampo({ portador: { ficha, nome: nomePortador }, personagens: st.personagens, dummies: st.dummies, cenario, cenaId: (cenario && cenario.ativa) || 'default', filtro: f, viewer: { souMestre: st.isMestre === true } });
        cacheLista = { chave, valor };
        return valor;
    } catch (e) { return []; }
}

export function contarAliadosEmCampoDaMesa(ficha, filtro = null, nomePortador = '') {
    return Math.min(LIMITE_ALIADOS_CONTADOS, listarAliadosEmCampoDaMesa(ficha, filtro, nomePortador).length);
}

// Nome do portador de uma ficha, SEM adivinhar por campos de texto: o que o chamador informou; senão, a chave de `personagens` (ou o jogador logado)
// cuja ficha é EXATAMENTE este mesmo objeto (identidade por referência). Rascunho do Immer ou ficha solta = '' (as condições de aliados falham fechadas).
export function nomeDoPortador(ficha, nomePortador = '') {
    if (sanitizarNome(nomePortador)) return nomePortador;
    if (!ficha || typeof ficha !== 'object') return '';
    try {
        const st = useStore.getState();
        if (st.minhaFicha === ficha && st.meuNome) return st.meuNome;
        const ps = st.personagens || {};
        const achada = Object.keys(ps).find(k => ps[k] === ficha);
        return achada || '';
    } catch (e) { return ''; }
}
