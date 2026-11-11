// ==========================================
// RASCUNHO DO FORMULÁRIO DO "LIVRO DOS PODERES" — lógica pura.
//
// O formulário de Habilidade/Forma/Poder tem ~40 campos. O rascunho é um objeto PLANO (JSON puro) com
// todos eles + `poderEditandoId` + `abertas` (quais seções do acordeão estão abertas). Ele vive na store
// (stores/useStore.js > rascunhosPoder, só em memória: NÃO vai pro Firebase nem pro localStorage da ficha),
// chaveado por dono da ficha + categoria, para sobreviver a trocar de página do livro e de aba.
// ==========================================
import { normalizarTipoAcao } from './acoesTecnica';
import { normalizarCustoPorTurno } from './custoPorTurno';
import { normalizarEscudoAoLigar } from './escudos';
import { normalizarGatilhos } from './gatilhos';
import { contadoresDoPoder, normalizarContadorRascunho } from './contadores';
import { ESTAGIOS_PADRAO, normalizarEstagios, temEstagios, marcoParaRascunho } from './estagios';

export const SECOES_FORM = ['basico', 'combate', 'efeitos', 'gatilhos', 'avancado'];
export const SECOES_PADRAO = Object.freeze({ basico: true, combate: false, efeitos: false, gatilhos: false, avancado: false });

const estagiosVazio = () => ({ ...ESTAGIOS_PADRAO, nomes: '' });

// Chave do rascunho: um por dono da ficha e por categoria (habilidade | forma | poder).
export const chaveRascunhoPoder = (dono, categoria) => `${dono || '_'}|${categoria || 'habilidade'}`;
// Chave que lembra qual categoria estava aberta no livro.
export const chaveAbaRascunhoPoder = (dono) => `${dono || '_'}|_aba`;

export function rascunhoVazio() {
    return {
        poderEditandoId: null,
        nome: '', descricao: '', vertente: '', elemento: '', elementosAfetados: '', imagemUrl: '',
        dadosQtd: 0, dadosFaces: 20, custoPercentual: 0, custoPercentualMax: 0,
        semComoPoder: false, danoVerdadeiro: false, tipoAcao: '',
        usosMax: '', usosPor: 'cena',
        custoTurno: { modo: 'fixo', valor: '', energia: 'mana' },
        recargaTurnos: '',
        escudo: { nome: '', valor: '', tipo: 'escudo' },
        gatilhos: [], gatilhosDescartados: [],
        contadoresRascunho: [],
        alcance: 1, area: 0, arma: '',
        maestria: 0, fadigaPorUso: 15, maestriaRequerida: 0,
        pasta: '',
        estagios: estagiosVazio(),
        efeitos: [], efeitosPassivos: [],
        nomeEfeito: '', novoAtr: 'forca', novoProp: 'base', novoVal: '', novoQuando: '', novoEscopo: '',
        nomeEfeitoPassivo: '', novoAtrPassivo: 'evasiva', novoPropPassivo: 'base', novoValPassivo: '', novoQuandoPassivo: '', novoEscopoPassivo: '',
        abertas: { ...SECOES_PADRAO },
    };
}

const clonar = (v) => JSON.parse(JSON.stringify(v));

// Campos que NÃO contam como "o jogador escreveu alguma coisa" (seletores com valor padrão e estado de UI).
const IGNORADOS_NO_CONTEUDO = ['abertas', 'novoAtr', 'novoProp', 'novoAtrPassivo', 'novoPropPassivo'];

// true se o rascunho difere do formulário vazio (ou se está reescrevendo um poder existente).
export function rascunhoTemConteudo(r) {
    if (!r || typeof r !== 'object') return false;
    const vazio = rascunhoVazio();
    return Object.keys(vazio).some(k => {
        if (IGNORADOS_NO_CONTEUDO.includes(k) || k === 'poderEditandoId') return false;
        return JSON.stringify(r[k]) !== JSON.stringify(vazio[k]);
    });
}

// Completa um rascunho vindo da store com os padrões (campos que não existiam) — nunca devolve algo parcial.
export function completarRascunho(r) {
    const vazio = rascunhoVazio();
    const base = r && typeof r === 'object' ? clonar(r) : {};
    const out = { ...vazio, ...base };
    out.abertas = { ...SECOES_PADRAO, ...(base.abertas || {}) };
    out.estagios = { ...vazio.estagios, ...(base.estagios || {}) };
    out.custoTurno = { ...vazio.custoTurno, ...(base.custoTurno || {}) };
    out.escudo = { ...vazio.escudo, ...(base.escudo || {}) };
    ['gatilhos', 'gatilhosDescartados', 'contadoresRascunho', 'efeitos', 'efeitosPassivos'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    return out;
}

// Rascunho preenchido a partir de um poder já gravado (✎ na lista). Não altera `p`.
// `contadoresDaFicha` (ficha.contadores): os que têm poderId = p.id entram em `contadoresRascunho` para editar junto.
export function rascunhoDoPoder(p, contadoresDaFicha) {
    const r = rascunhoVazio();
    const custoSalvo = normalizarCustoPorTurno(p.custoPorTurno);
    const normG = normalizarGatilhos(p.gatilhos);
    r.poderEditandoId = p.id;
    r.nome = p.nome || '';
    r.descricao = p.descricao || '';
    r.vertente = p.vertente || '';
    r.elemento = p.elemento || '';
    r.elementosAfetados = p.elementosAfetados || '';
    r.imagemUrl = p.imagemUrl || '';
    r.dadosQtd = p.dadosQtd || 0;
    r.dadosFaces = p.dadosFaces || 20;
    r.custoPercentual = p.custoPercentual || 0;
    r.custoPercentualMax = p.custoPercentualMax || 0;
    r.semComoPoder = !!p.semComoPoder;
    r.danoVerdadeiro = p.danoVerdadeiro === true;
    r.tipoAcao = normalizarTipoAcao(p.tipoAcao);
    r.usosMax = p.usosMax || '';
    r.usosPor = p.usosPor || 'cena';
    r.custoTurno = custoSalvo ? { modo: custoSalvo.modo, valor: custoSalvo.valor, energia: custoSalvo.energia } : r.custoTurno;
    r.recargaTurnos = p.recargaTurnos || '';
    r.escudo = normalizarEscudoAoLigar(p.escudoAoLigar) || r.escudo;
    r.gatilhos = clonar(normG.gatilhos);
    r.gatilhosDescartados = clonar(normG.descartados);
    r.contadoresRascunho = contadoresDoPoder({ contadores: contadoresDaFicha }, p.id).map(normalizarContadorRascunho).filter(Boolean);
    r.alcance = p.alcance || 1;
    r.area = p.area || 0;
    r.arma = p.armaVinculada || '';
    r.maestria = p.maestria || 0;
    r.fadigaPorUso = p.fadigaPorUso !== undefined ? p.fadigaPorUso : 15;
    r.maestriaRequerida = p.maestriaRequerida || 0;
    r.pasta = p.pasta || '';
    if (temEstagios(p)) {
        const cfg = normalizarEstagios(p.estagios);
        r.estagios = clonar({ ...cfg, nomes: cfg.nomes.join('\n'), marcos: cfg.marcos.map(marcoParaRascunho) });
    }
    r.efeitos = clonar(p.efeitos || []);
    r.efeitosPassivos = clonar(p.efeitosPassivos || []);
    // Seções com conteúdo já abrem sozinhas ao editar um poder existente.
    const sec = resumirSecoes(r);
    r.abertas = { basico: true, combate: !!sec.combate.resumo, efeitos: !!sec.efeitos.resumo, gatilhos: !!sec.gatilhos.resumo, avancado: !!sec.avancado.resumo };
    return r;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const num = (v) => parseFloat(v) || 0;

// Resumo curto (e aviso, se houver) de cada seção do formulário, para o cabeçalho do acordeão.
export function resumirSecoes(r) {
    const c = completarRascunho(r);
    const basico = [c.vertente, (c.vertente || '').toLowerCase().includes('elemental') ? c.elemento : ''].filter(Boolean).join(' · ');

    const combate = [];
    if (num(c.dadosQtd) > 0) combate.push(`${num(c.dadosQtd)}d${num(c.dadosFaces) || 20}`);
    if (num(c.custoPercentual) > 0 || num(c.custoPercentualMax) > 0) {
        combate.push(num(c.custoPercentualMax) > num(c.custoPercentual) ? `custo ${num(c.custoPercentual)}–${num(c.custoPercentualMax)}%` : `custo ${num(c.custoPercentual)}%`);
    }
    if (c.semComoPoder) combate.push('sem Como Poder');
    if (c.danoVerdadeiro) combate.push('dano verdadeiro');
    if (c.tipoAcao) combate.push('ação definida');
    if (num(c.area) > 0) combate.push(`área ${num(c.area)}Q`);
    if (num(c.alcance) > 1) combate.push(`alcance ${num(c.alcance)}Q`);
    if (c.arma) combate.push('arma vinculada');

    const efeitos = [];
    if (c.efeitos.length) efeitos.push(plural(c.efeitos.length, 'efeito', 'efeitos'));
    if (c.efeitosPassivos.length) efeitos.push(plural(c.efeitosPassivos.length, 'passivo', 'passivos'));
    const pendente = !!(String(c.nomeEfeito).trim() || String(c.novoVal).trim() || String(c.nomeEfeitoPassivo).trim() || String(c.novoValPassivo).trim());

    const avancado = [];
    if (num(c.usosMax) > 0) avancado.push(plural(num(c.usosMax), 'uso', 'usos'));
    if (num(c.custoTurno.valor) > 0) avancado.push('custo por turno');
    if (num(c.recargaTurnos) > 0) avancado.push(`recarga ${num(c.recargaTurnos)}`);
    if (num(c.escudo.valor) > 0) avancado.push('escudo');
    if (c.estagios.habilitado) avancado.push('Estágios ativos');
    if (num(c.maestria) > 0) avancado.push(`maestria ${num(c.maestria)}%`);
    if (num(c.maestriaRequerida) > 0) avancado.push(`exige ${num(c.maestriaRequerida)}%`);
    if (String(c.pasta).trim()) avancado.push(`pasta ${String(c.pasta).trim()}`);

    return {
        basico: { resumo: basico, erro: '' },
        combate: { resumo: combate.join(' · '), erro: '' },
        efeitos: { resumo: efeitos.join(' · '), erro: pendente ? 'efeito digitado e não adicionado' : '' },
        gatilhos: { resumo: [c.contadoresRascunho.length ? plural(c.contadoresRascunho.length, 'contador', 'contadores') : '', c.gatilhos.length ? plural(c.gatilhos.length, 'gatilho', 'gatilhos') : ''].filter(Boolean).join(' · '), erro: c.gatilhosDescartados.length ? plural(c.gatilhosDescartados.length, 'gatilho inválido', 'gatilhos inválidos') : '' },
        avancado: { resumo: avancado.join(' · '), erro: '' },
    };
}

// true se `atual` tem alguma diferença de CONTEÚDO em relação a `original` (ignora o estado de UI do acordeão).
export function rascunhoDifere(atual, original) {
    const a = completarRascunho(atual);
    const o = completarRascunho(original);
    return Object.keys(rascunhoVazio()).some(k => !['abertas', 'poderEditandoId'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(o[k]));
}

// true se descartar/sobrescrever o rascunho `r` perderia trabalho: reescrevendo um poder existente, só se mudou
// em relação ao gravado (em `poderes`); sem poder original, se há qualquer conteúdo.
export function rascunhoTemAlteracao(r, poderes, contadores) {
    if (!r || typeof r !== 'object') return false;
    const original = r.poderEditandoId ? (poderes || []).find(po => po && po.id === r.poderEditandoId) : null;
    return original ? rascunhoDifere(r, rascunhoDoPoder(original, contadores)) : rascunhoTemConteudo(r);
}
