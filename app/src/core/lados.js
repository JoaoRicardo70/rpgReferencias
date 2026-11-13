// ==========================================
// 🛡️ LADOS / EQUIPES — quem é aliado, neutro ou inimigo de quem (lógica pura, sem React/Firebase).
//
// MODELO
//  - `cenario.equipes`: lista [{ id, nome, cor, icone }] editável pelo Mestre/Co-Mestre (até 12).
//    Ausente/vazia = PADRÃO VIRTUAL (EQUIPES_PADRAO): aliados (🛡️), inimigos (👹) e neutros (⚪). Nada é migrado no Firebase.
//  - `cenario.relacoes`: mapa { "idA|idB": 'aliada' | 'neutra' | 'hostil' } com os dois ids em ORDEM ALFABÉTICA (chaveRelacao).
//    Mesma equipe = SEMPRE 'aliada'. Padrão virtual: aliados↔inimigos = hostil; neutros↔qualquer = neutra;
//    equipes diferentes sem relação definida = 'neutra'. O Mestre cria quantos lados quiser (todos contra todos = todas as relações 'hostil').
//  - Cada combatente tem `equipe` (id) e `ladoOculto` (bool): na ficha de jogador/NPC em `ficha.combate.equipe` / `ficha.combate.ladoOculto`;
//    num Dummie em `dummie.equipe` / `dummie.ladoOculto`. Sem equipe: jogador → 'aliados'; NPC (ehNpc) e Dummie → 'inimigos' (o comportamento de sempre).
//    Equipe que não existe mais na lista do cenário (apagada) cai no padrão automático.
//  - ALIADO/INIMIGO É RELATIVO: relacaoEntre(cenario, a, b) devolve 'aliada' | 'neutra' | 'hostil'.
//  - `ladoOculto: true` = os jogadores NÃO veem a equipe (a UI mostra "❓ Lado desconhecido"); a MECÂNICA usa SEMPRE a equipe real.
//    ATENÇÃO: como as fichas sincronizam para todos, o ocultamento é de EXIBIÇÃO (mesmo padrão de visibilidadeHp dos Dummies), não de segurança.
//  - Só Mestre/Co-Mestre alteram equipes, relações, lado de qualquer um e revelação (a checagem é de quem chama, via isMestre do store); os jogadores só leem.
//
// "Combatente": aceita ficha crua (jogador/NPC), Dummie cru com `isDummie: true`, ou um item como os da ordem de iniciativa / alvos
// ({ id, nome, ficha, isDummie }). Para passar um Dummie cru sem flag use `comoCombatente(dados, true)`.
// ==========================================
import { ehNpc } from './tipoPersonagem.js';

export const EQUIPE_ALIADOS = 'aliados';
export const EQUIPE_INIMIGOS = 'inimigos';
export const EQUIPE_NEUTROS = 'neutros';

export const EQUIPES_PADRAO = Object.freeze([
    Object.freeze({ id: EQUIPE_ALIADOS, nome: 'Aliados', cor: '#00ff88', icone: '🛡️' }),
    Object.freeze({ id: EQUIPE_INIMIGOS, nome: 'Inimigos', cor: '#ff2d55', icone: '👹' }),
    Object.freeze({ id: EQUIPE_NEUTROS, nome: 'Neutros', cor: '#9aa0a6', icone: '⚪' }),
]);

export const RELACOES = Object.freeze(['aliada', 'neutra', 'hostil']);
export const LIMITE_EQUIPES = 12;
export const LIMITE_NOME_EQUIPE = 40;
export const COR_EQUIPE_PADRAO = '#00e5ff';
export const ICONE_EQUIPE_PADRAO = '🚩';
export const ROTULO_LADO_OCULTO = '❓ Lado desconhecido';

const RE_COR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// ---------- Combatente ----------
export function comoCombatente(dados, isDummie = false) {
    return { ficha: dados || null, isDummie: !!isDummie };
}

// { dados, isDummie } a partir de qualquer forma aceita.
function resolver(x) {
    if (!x || typeof x !== 'object') return { dados: null, isDummie: false };
    if (Object.prototype.hasOwnProperty.call(x, 'ficha') && x.ficha !== undefined) return { dados: x.ficha, isDummie: !!x.isDummie };
    return { dados: x, isDummie: x.isDummie === true };
}

function equipeGravada(x) {
    const { dados, isDummie } = resolver(x);
    if (!dados) return '';
    const v = isDummie ? dados.equipe : (dados.combate && dados.combate.equipe);
    return typeof v === 'string' ? v : '';
}

// ---------- Equipes e relações do cenário ----------
export function getEquipes(cenario) {
    const lista = cenario && Array.isArray(cenario.equipes) ? cenario.equipes.filter(e => e && typeof e.id === 'string' && e.id) : [];
    return lista.length > 0 ? lista : EQUIPES_PADRAO;
}

export function getRelacoes(cenario) {
    const r = cenario && cenario.relacoes;
    return r && typeof r === 'object' && !Array.isArray(r) ? r : {};
}

export function getEquipe(cenario, id) {
    return getEquipes(cenario).find(e => e.id === id) || null;
}

// Chave canônica de um par de equipes: ids em ordem alfabética, "a|b".
export function chaveRelacao(a, b) {
    const x = String(a ?? ''); const y = String(b ?? '');
    return x <= y ? `${x}|${y}` : `${y}|${x}`;
}

// Id da equipe de um combatente. Sem `cenario`, devolve o id gravado (se houver); com `cenario`, id que não existe mais cai no padrão automático.
export function equipeAutomatica(entidade) {
    const { dados, isDummie } = resolver(entidade);
    if (isDummie) return EQUIPE_INIMIGOS;
    return ehNpc(dados) ? EQUIPE_INIMIGOS : EQUIPE_ALIADOS;
}

export function equipeDe(entidade, cenario = null) {
    const gravada = equipeGravada(entidade);
    if (gravada && (!cenario || getEquipes(cenario).some(e => e.id === gravada))) return gravada;
    return equipeAutomatica(entidade);
}

function relacaoPadrao(a, b) {
    if ((a === EQUIPE_ALIADOS && b === EQUIPE_INIMIGOS) || (a === EQUIPE_INIMIGOS && b === EQUIPE_ALIADOS)) return 'hostil';
    return 'neutra';
}

export function relacaoEntreEquipes(cenario, idA, idB) {
    if (idA === idB) return 'aliada';
    const definida = getRelacoes(cenario)[chaveRelacao(idA, idB)];
    if (RELACOES.includes(definida)) return definida;
    return relacaoPadrao(idA, idB);
}

export function relacaoEntre(cenario, entA, entB) {
    return relacaoEntreEquipes(cenario, equipeDe(entA, cenario), equipeDe(entB, cenario));
}

export const ehAliado = (cenario, a, b) => relacaoEntre(cenario, a, b) === 'aliada';
export const ehInimigo = (cenario, a, b) => relacaoEntre(cenario, a, b) === 'hostil';
export const ehNeutro = (cenario, a, b) => relacaoEntre(cenario, a, b) === 'neutra';

// Mesmo combatente? (id + tipo; sem id, pelo nome.)
export function mesmoCombatente(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const ra = resolver(a); const rb = resolver(b);
    if (ra.isDummie !== rb.isDummie) return false;
    if (a.id !== undefined && b.id !== undefined) return a.id === b.id;
    return !!a.nome && a.nome === b.nome;
}

// Dos combatentes de `lista`, os que têm a relação pedida com `portador` (o próprio portador é sempre excluído).
export function filtrarPorRelacao(cenario, portador, lista, relacao) {
    return (Array.isArray(lista) ? lista : []).filter(item => item && !mesmoCombatente(portador, item) && relacaoEntre(cenario, portador, item) === relacao);
}
export const inimigosDe = (cenario, portador, lista) => filtrarPorRelacao(cenario, portador, lista, 'hostil');
export const aliadosDe = (cenario, portador, lista) => filtrarPorRelacao(cenario, portador, lista, 'aliada');

// ---------- Exibição / revelação ----------
export function ladoEstaOculto(entidade) {
    const { dados, isDummie } = resolver(entidade);
    if (!dados) return false;
    return (isDummie ? dados.ladoOculto : (dados.combate && dados.combate.ladoOculto)) === true;
}

// Mestre vê sempre; jogador só vê se o lado não está oculto.
export function ladoVisivelParaMim(entidade, { isMestre = false } = {}) {
    return !!isMestre || !ladoEstaOculto(entidade);
}

// Texto de exibição do lado (ex.: "🛡️ Aliados"); oculto para jogador = "❓ Lado desconhecido". Para o Mestre, oculto ganha o sufixo " (oculto)".
export function rotuloDoLado(cenario, entidade, { isMestre = false } = {}) {
    if (!ladoVisivelParaMim(entidade, { isMestre })) return ROTULO_LADO_OCULTO;
    const eq = getEquipe(cenario, equipeDe(entidade, cenario));
    const base = eq ? `${eq.icone || ICONE_EQUIPE_PADRAO} ${eq.nome}` : `${ICONE_EQUIPE_PADRAO} ${equipeDe(entidade, cenario)}`;
    return ladoEstaOculto(entidade) ? `${base} (oculto)` : base;
}

// ---------- Validação / saneamento ----------
export function slugEquipe(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

// Nome válido (1..40 caracteres, aparado) ou ''.
export function sanitizarNomeEquipe(nome) {
    return String(nome ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITE_NOME_EQUIPE);
}

export function sanitizarCor(cor) {
    return typeof cor === 'string' && RE_COR.test(cor.trim()) ? cor.trim() : COR_EQUIPE_PADRAO;
}

// Id novo e único (slug do nome; 'equipe' se vazio) que não colide com `existentes` (lista de equipes ou de ids).
export function gerarIdEquipe(nome, existentes = []) {
    const usados = new Set((existentes || []).map(e => (e && typeof e === 'object' ? e.id : e)));
    const base = slugEquipe(nome) || 'equipe';
    let id = base; let n = 2;
    while (usados.has(id)) { id = `${base}-${n}`; n += 1; }
    return id;
}

// Uma equipe: { id, nome, cor, icone } ou null se não tem nome válido. Id ausente/inválido vira slug do nome.
export function sanitizarEquipe(bruta, usados = new Set()) {
    if (!bruta || typeof bruta !== 'object') return null;
    const nome = sanitizarNomeEquipe(bruta.nome);
    if (!nome) return null;
    let id = typeof bruta.id === 'string' ? slugEquipe(bruta.id) : '';
    if (!id || usados.has(id)) id = gerarIdEquipe(nome, [...usados]);
    const icone = typeof bruta.icone === 'string' && bruta.icone.trim() ? [...bruta.icone.trim()].slice(0, 4).join('') : ICONE_EQUIPE_PADRAO;
    return { id, nome, cor: sanitizarCor(bruta.cor), icone };
}

// Lista de equipes: descarta inválidas, ids únicos, no máximo LIMITE_EQUIPES.
export function sanitizarEquipes(lista) {
    const usados = new Set();
    const saida = [];
    (Array.isArray(lista) ? lista : []).forEach((b) => {
        if (saida.length >= LIMITE_EQUIPES) return;
        const e = sanitizarEquipe(b, usados);
        if (!e) return;
        usados.add(e.id);
        saida.push(e);
    });
    return saida;
}

// Relações: só pares de ids EXISTENTES, distintos, com valor válido; chaves normalizadas (ordem alfabética). `equipes` = lista já saneada.
export function sanitizarRelacoes(relacoes, equipes) {
    const ids = new Set((Array.isArray(equipes) ? equipes : []).map(e => e.id));
    const saida = {};
    if (!relacoes || typeof relacoes !== 'object' || Array.isArray(relacoes)) return saida;
    Object.keys(relacoes).forEach((chave) => {
        const partes = String(chave).split('|');
        if (partes.length !== 2) return;
        const [a, b] = partes;
        if (!ids.has(a) || !ids.has(b) || a === b) return;
        if (!RELACOES.includes(relacoes[chave])) return;
        saida[chaveRelacao(a, b)] = relacoes[chave];
    });
    return saida;
}

// Define uma relação (devolve NOVO objeto de relações; mesma equipe ou valor inválido = sem mudança).
export function definirRelacao(relacoes, idA, idB, valor) {
    const base = relacoes && typeof relacoes === 'object' && !Array.isArray(relacoes) ? { ...relacoes } : {};
    if (idA === idB || !RELACOES.includes(valor)) return base;
    base[chaveRelacao(idA, idB)] = valor;
    return base;
}

// Remove de `relacoes` tudo que cita uma equipe apagada.
export function removerRelacoesDaEquipe(relacoes, idEquipe) {
    const saida = {};
    Object.keys(relacoes || {}).forEach((k) => { if (!k.split('|').includes(idEquipe)) saida[k] = relacoes[k]; });
    return saida;
}

export function equipeExiste(cenario, id) {
    return getEquipes(cenario).some(e => e.id === id);
}

// ---------- Patches (sem I/O): quem grava decide como ----------
// Ficha de jogador/NPC → { 'combate/equipe': id } (caminho do Firebase / do updateFicha); Dummie → { equipe: id } (campo do Dummie).
export function patchEquipe(isDummie, equipeId) {
    return isDummie ? { equipe: equipeId } : { 'combate/equipe': equipeId };
}
export function patchLadoOculto(isDummie, oculto) {
    return isDummie ? { ladoOculto: !!oculto } : { 'combate/ladoOculto': !!oculto };
}

// Patch completo de "mover para a equipe": null se a equipe não existe no cenário. Devolve { patch, de, para, anunciar } —
// `anunciar` = false quando o lado está oculto (a mudança não vai para o Feed).
export function moverParaEquipe(cenario, entidade, equipeId) {
    if (!equipeExiste(cenario, equipeId)) return null;
    const { isDummie } = resolver(entidade);
    const de = equipeDe(entidade, cenario);
    return { patch: patchEquipe(isDummie, equipeId), de, para: equipeId, mudou: de !== equipeId, anunciar: !ladoEstaOculto(entidade) };
}

// Frase do Feed ("🔀 X mudou de lado: Aliados → Inimigos") ou '' se não houve mudança.
export function textoMudancaDeLado(cenario, nome, deId, paraId) {
    if (deId === paraId) return '';
    const nomeDe = (getEquipe(cenario, deId) || { nome: deId }).nome;
    const nomePara = (getEquipe(cenario, paraId) || { nome: paraId }).nome;
    return `🔀 ${nome} mudou de lado: ${nomeDe} → ${nomePara}`;
}

// Filtro de alvos de Zonas/golpes em área: 'inimigos' = relação hostil com o conjurador; 'aliados' = relação aliada (o próprio conjurador entra);
// qualquer outro valor ('todos') = todos. `conjurador` ausente (não achado) é tratado como um jogador sem equipe configurada (aliados).
export function alvoNoFiltro(cenario, conjurador, alvo, filtro) {
    if (filtro !== 'inimigos' && filtro !== 'aliados') return true;
    const ref = conjurador || comoCombatente(null, false);
    const rel = relacaoEntre(cenario, ref, alvo);
    return filtro === 'inimigos' ? rel === 'hostil' : rel === 'aliada';
}
