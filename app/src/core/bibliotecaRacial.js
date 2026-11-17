// ==========================================
// 📚 BIBLIOTECA DE HABILIDADES DE RAÇA — lógica pura. O Mestre cria a Habilidade de Raça uma vez (no Grimório), publica-a aqui
// com as Raças que têm acesso, e ela passa a aparecer como "disponível" para todo personagem dessas Raças; o Mestre CONCEDE a cópia.
// Dado: cenario.bibliotecaRacial = [{ id, nome, icone, resumo, racasAcesso, percentualMinimo, requisito, manipulaDNA?, modelo, criadoEm, criadoPor }].
// `modelo` = snapshot do poder SEM campos de instância/estado/segurança (mesmas regras de prepararItemEnsinado em core/ensinar.js).
// LIMITES ACEITOS (documentados): (1) o cenário sincroniza para todos, então o `modelo` está no navegador de cada jogador: a interface
// nunca o mostra, mas ele não é secreto; (2) editar/remover a entrada NÃO altera as cópias já concedidas (cada ficha tem a sua cópia).
// Nada aqui fala com Firebase nem com a tela; não importa poder.js nem disputaPoder.js.
// ==========================================
import { temChaveInvalida } from './backupFicha';
import { prepararItemEnsinado } from './ensinar';
import {
    getRacas, ehHabilidadeDeRaca, normalizarNomeRaca, normalizarRacasAcesso, percentualMinimoDoPoder, racaTemAcessoPelaRaca, racaTemAcesso,
    racasQueDaoAcesso, aplicarExcecaoRaca, slugRaca, ID_CATEGORIA_HABILIDADE_RACA,
} from './racas';

export const LIMITE_BIBLIOTECA = 60;
export const LIMITE_NOME_BIBLIOTECA = 60;
export const LIMITE_RESUMO_BIBLIOTECA = 200;
export const LIMITE_REQUISITO_BIBLIOTECA = 300;
export const LIMITE_BYTES_MODELO = 20000;
export const ICONE_BIBLIOTECA_PADRAO = '📚';

const comoLista = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));
const texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const percentual = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
};
const iconeLimpo = (v) => (typeof v === 'string' && v.trim() ? [...v.trim()].slice(0, 4).join('') : ICONE_BIBLIOTECA_PADRAO);

// Campos de ESTADO/instância que nunca entram no modelo (além dos que prepararItemEnsinado já remove: id, ativa, equipado, racaExcecao, bloqueio, manipulaDNA, imagem gigante).
const CAMPOS_DE_ESTADO = ['ativa', 'equipado', 'origemBiblioteca', 'ensinadoPor', 'recargaRestante', 'estagioAtual', 'racasAcesso', 'percentualMinimo'];

// Snapshot limpo de um poder: sem instância/estado/marcas do Mestre. Idempotente.
export function sanitizarModelo(poder) {
    const copia = prepararItemEnsinado(poder);
    CAMPOS_DE_ESTADO.forEach(k => { delete copia[k]; });
    // Estado dos gatilhos (armado/desligado pelo Mestre) é da ficha de origem.
    if (Array.isArray(copia.gatilhos)) copia.gatilhos = copia.gatilhos.map((g) => { if (!g || typeof g !== 'object') return g; const { armado, mestreDesligou, ...resto } = g; return resto; });
    copia.categoria = ID_CATEGORIA_HABILIDADE_RACA;
    return copia;
}

const tamanhoDe = (o) => { try { return JSON.stringify(o).length; } catch (e) { return Infinity; } };

export function gerarIdBiblioteca(nome, existentes = []) {
    const usados = new Set(existentes);
    const base = `bib_${slugRaca(nome) || 'habilidade'}`;
    if (!usados.has(base)) return base;
    let n = 2;
    while (usados.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

// Lista saneada: só entradas com nome e modelo válido (objeto, chaves aceitas pelo Firebase, ≤ ~20 KB), ids únicos, limites. Aceita array ou mapa.
export function sanitizarBiblioteca(lista) {
    const saida = []; const usados = new Set();
    comoLista(lista).forEach((b) => {
        if (saida.length >= LIMITE_BIBLIOTECA || !b || typeof b !== 'object') return;
        const nome = texto(b.nome, LIMITE_NOME_BIBLIOTECA);
        if (!nome || !b.modelo || typeof b.modelo !== 'object' || Array.isArray(b.modelo)) return;
        if (temChaveInvalida(b.modelo)) return;
        const modelo = sanitizarModelo(b.modelo);
        if (tamanhoDe(modelo) > LIMITE_BYTES_MODELO) return;
        let id = typeof b.id === 'string' ? b.id.trim() : '';
        if (!id || /[.#$[\]/]/.test(id) || usados.has(id)) id = gerarIdBiblioteca(nome, [...usados]);
        usados.add(id);
        const entrada = {
            id, nome, icone: iconeLimpo(b.icone), resumo: texto(b.resumo, LIMITE_RESUMO_BIBLIOTECA),
            racasAcesso: normalizarRacasAcesso(b.racasAcesso), percentualMinimo: percentual(b.percentualMinimo),
            requisito: texto(b.requisito, LIMITE_REQUISITO_BIBLIOTECA), modelo,
            criadoEm: Number.isFinite(b.criadoEm) ? b.criadoEm : 0, criadoPor: texto(b.criadoPor, 60),
        };
        if (b.manipulaDNA === true) entrada.manipulaDNA = true;
        saida.push(entrada);
    });
    return saida;
}

// Biblioteca do cenário (saneada, cache por referência de cenario.bibliotecaRacial). NÃO mutar o resultado.
const CACHE = new WeakMap();
export function getBiblioteca(cenario) {
    const bruto = cenario && cenario.bibliotecaRacial;
    if (!bruto || typeof bruto !== 'object') return [];
    let r = CACHE.get(bruto);
    if (!r) { r = sanitizarBiblioteca(bruto); CACHE.set(bruto, r); }
    return r;
}

// Entrada nova a partir de um poder existente (Habilidade de Raça). meta = { nome, resumo, icone, racasAcesso, percentualMinimo, requisito, criadoPor, existentes, agora }.
// racasAcesso/percentualMinimo omitidos = os do próprio poder. Devolve { ok, entrada } ou { ok:false, mensagem }.
export function criarEntradaDePoder(poder, meta = {}) {
    if (!poder || typeof poder !== 'object' || !ehHabilidadeDeRaca(poder)) return { ok: false, mensagem: 'Só Habilidades de Raça vão para a biblioteca.' };
    if (temChaveInvalida(poder)) return { ok: false, mensagem: 'Esta habilidade tem campos com nomes que o servidor não aceita (. # $ [ ] /).' };
    const nome = texto(meta.nome != null ? meta.nome : poder.nome, LIMITE_NOME_BIBLIOTECA);
    if (!nome) return { ok: false, mensagem: 'Dê um nome à entrada da biblioteca.' };
    const modelo = sanitizarModelo(poder);
    if (tamanhoDe(modelo) > LIMITE_BYTES_MODELO) return { ok: false, mensagem: 'Esta habilidade é grande demais para a biblioteca (limite de cerca de 20 KB).' };
    const entrada = {
        id: gerarIdBiblioteca(nome, meta.existentes || []),
        nome, icone: iconeLimpo(meta.icone), resumo: texto(meta.resumo != null ? meta.resumo : poder.descricao, LIMITE_RESUMO_BIBLIOTECA),
        racasAcesso: normalizarRacasAcesso(meta.racasAcesso != null ? meta.racasAcesso : poder.racasAcesso),
        percentualMinimo: percentual(meta.percentualMinimo != null ? meta.percentualMinimo : poder.percentualMinimo),
        requisito: texto(meta.requisito, LIMITE_REQUISITO_BIBLIOTECA),
        modelo, criadoEm: Number.isFinite(meta.agora) ? meta.agora : Date.now(), criadoPor: texto(meta.criadoPor, 60),
    };
    if (meta.manipulaDNA === true || (meta.manipulaDNA == null && poder.manipulaDNA === true)) entrada.manipulaDNA = true;
    return { ok: true, entrada };
}

// O personagem já tem esta habilidade? (origemBiblioteca igual ao id da entrada, ou poder com o mesmo nome)
export function jaPossuiHabilidade(ficha, entrada) {
    const nome = normalizarNomeRaca(entrada && entrada.nome);
    return comoLista(ficha && ficha.poderes).some(p => p && typeof p === 'object'
        && ((entrada && entrada.id && p.origemBiblioteca === entrada.id) || (nome && normalizarNomeRaca(p.nome) === nome)));
}

// Situação de uma entrada para uma ficha:
// disponivel = a Raça/composição dá acesso (IGNORANDO o percentual); percentual = o maior Domínio entre as Raças que dão acesso (0 se nenhuma);
// minimo = percentual mínimo da entrada; atingeMinimo = o Domínio alcança o mínimo; jaPossui; motivo ('' quando está disponível e não possui).
export function disponivelParaFicha(cenario, ficha, entrada) {
    const alvo = { categoria: ID_CATEGORIA_HABILIDADE_RACA, racasAcesso: entrada ? entrada.racasAcesso : [], percentualMinimo: entrada ? entrada.percentualMinimo : 0 };
    const disponivel = !!entrada && racaTemAcessoPelaRaca(cenario, ficha, alvo);
    const dao = disponivel ? racasQueDaoAcesso(cenario, ficha, alvo, { ignorarPercentual: true }) : [];
    const melhor = dao.reduce((a, e) => (e.percentual > a ? e.percentual : a), 0);
    const minimo = percentualMinimoDoPoder(alvo);
    const atingeMinimo = disponivel && racaTemAcesso(cenario, ficha, alvo);
    const jaPossui = jaPossuiHabilidade(ficha, entrada);
    let motivo = '';
    if (!disponivel) motivo = 'A Raça deste personagem não tem acesso.';
    else if (jaPossui) motivo = 'Já possui esta habilidade.';
    else if (!atingeMinimo) motivo = `Domínio insuficiente: ${melhor}% de ${minimo}%.`;
    return { disponivel, percentual: melhor, minimo, atingeMinimo, jaPossui, motivo };
}

// Poder novo para a ficha. opcoes = { bloqueada, requisito, motivoBloqueio, id, racaExcecao }. Habilidade de Raça, desligada, com id novo.
export function montarPoderConcedido(entrada, opcoes = {}) {
    const poder = sanitizarModelo(entrada && entrada.modelo ? entrada.modelo : {});
    poder.id = opcoes.id != null ? opcoes.id : Date.now();
    poder.nome = poder.nome || (entrada && entrada.nome) || 'Habilidade de Raça';
    poder.categoria = ID_CATEGORIA_HABILIDADE_RACA;
    poder.racasAcesso = normalizarRacasAcesso(entrada && entrada.racasAcesso);
    const min = percentual(entrada && entrada.percentualMinimo);
    if (min > 0) poder.percentualMinimo = min;
    poder.origemBiblioteca = entrada.id;
    poder.ativa = false;
    poder.equipado = false;
    if (entrada.manipulaDNA === true) poder.manipulaDNA = true;
    aplicarExcecaoRaca(poder, opcoes.racaExcecao === true);
    if (opcoes.bloqueada === true) {
        poder.bloqueio = {
            ativo: true,
            requisito: texto(opcoes.requisito != null ? opcoes.requisito : entrada.requisito, LIMITE_REQUISITO_BIBLIOTECA),
            motivo: texto(opcoes.motivoBloqueio, 300),
        };
    }
    return poder;
}

// Todas as fichas da mesa que o Mestre enxerga: [{ chave, id, nome, isDummie, ficha }]. Dummies só os que estão na cena (resumo.ordem / foraDaOrdem).
export function entidadesDaMesa({ personagens, dummies, meuNome, minhaFicha, resumo } = {}) {
    const saida = [];
    const nomes = new Set(Object.keys(personagens || {}));
    if (meuNome) nomes.add(meuNome);
    nomes.forEach((id) => {
        const ficha = id === meuNome ? minhaFicha : (personagens || {})[id];
        if (!ficha || typeof ficha !== 'object') return;
        saida.push({ chave: `p:${id}`, id, nome: (ficha.bio && ficha.bio.nome) || id, isDummie: false, ficha });
    });
    const naCena = new Set([...((resumo && resumo.ordem) || []), ...((resumo && resumo.foraDaOrdem) || [])].filter(it => it && it.isDummie).map(it => it.id));
    Object.entries(dummies || {}).forEach(([id, d]) => {
        if (!d || typeof d !== 'object' || !naCena.has(id)) return;
        saida.push({ chave: `d:${id}`, id, nome: d.nome || id, isDummie: true, ficha: d });
    });
    return saida;
}

// Personagens para quem a entrada está disponível (a Raça/composição dá acesso): cada item = entidade + { situacao, dominioTexto }.
export function personagensCompativeis(cenario, entidades, entrada) {
    const racas = getRacas(cenario);
    return comoLista(entidades).map((e) => {
        const situacao = disponivelParaFicha(cenario, e.ficha, entrada);
        if (!situacao.disponivel) return null;
        const via = racasQueDaoAcesso(cenario, e.ficha, { categoria: ID_CATEGORIA_HABILIDADE_RACA, racasAcesso: entrada.racasAcesso, percentualMinimo: 0 }, { ignorarPercentual: true });
        const melhor = via.reduce((a, x) => (!a || x.percentual > a.percentual ? x : a), null);
        const raca = melhor ? (racas.find(r => r.id === melhor.racaId) || {}) : {};
        return { ...e, situacao, racaNome: melhor ? melhor.nome : '', racaIcone: raca.icone || '' };
    }).filter(Boolean);
}

// Texto "Domínio 30% de 50%" / "Domínio suficiente" mostrado ao jogador e ao Mestre.
export function textoDominio(situacao) {
    if (!situacao || !situacao.disponivel) return '';
    if (situacao.minimo <= 0 || situacao.atingeMinimo) return 'Domínio suficiente';
    return `Domínio ${situacao.percentual}% de ${situacao.minimo}%`;
}

// Entradas disponíveis para a ficha que ela ainda NÃO possui, SEM o modelo (visão do jogador).
export function disponiveisParaJogador(cenario, ficha) {
    return getBiblioteca(cenario).map((entrada) => {
        const situacao = disponivelParaFicha(cenario, ficha, entrada);
        if (!situacao.disponivel || situacao.jaPossui) return null;
        return { id: entrada.id, nome: entrada.nome, icone: entrada.icone, resumo: entrada.resumo, requisito: entrada.requisito, situacao };
    }).filter(Boolean);
}

// Tira a Raça `idRaca` dos racasAcesso das entradas (faxina quando a Raça sai do catálogo). Puro: devolve { biblioteca, alterados }.
export function limparRacaDaBiblioteca(idRaca, lista) {
    let alterados = 0;
    const biblioteca = comoLista(lista).map((e) => {
        if (e && Array.isArray(e.racasAcesso) && e.racasAcesso.includes(idRaca)) { alterados += 1; return { ...e, racasAcesso: e.racasAcesso.filter(i => i !== idRaca) }; }
        return e;
    });
    return { biblioteca, alterados };
}

// Normalizadores públicos (a tela compara o rascunho com o salvo SEM gerar gravação vazia; o ícone conta pontos de código, não unidades UTF-16).
export const normalizarIconeBiblioteca = iconeLimpo;
export const normalizarTextoBiblioteca = texto;
export const normalizarPercentualBiblioteca = percentual;
export const LIMITE_ICONE_INPUT = 16; // unidades UTF-16 no input; o corte real (4 caracteres) é de iconeLimpo
