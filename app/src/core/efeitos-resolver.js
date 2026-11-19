import { contarAliadosEmCampoDaMesa, normalizarFiltroAliado, nomeDoPortador } from './aliadosEmCampo.js';
import { normalizarEscalaMovimento, quadradosContados } from './movimentoNoTurno.js';
import { lerDadoDeDano, formatarDadoDeDano, ATRIBUTO_DANO_DADOS, LIMITES_DANO_DADOS } from './danoDados.js';
import { temEstagios, efeitosDoEstagio, fatorGeralDoEstagio, escalarPorFator } from './estagios.js';

/**
 * Resolve quais efeitos (ativos e passivos) estao realmente ativos
 * para uma entidade (poder ou item), considerando formas e o estagio atual
 * (core/estagios.js: os efeitos ATIVOS seguem o estagio -- os da tecnica, ou os da
 * "mudanca" em vigor naquele estagio, com o crescimento; passivos nao mudam). Sub-formas
 * da tecnica escalam pelo crescimento geral (nao tem lista propria por "mudanca").
 */
export function resolverEfeitosEntidade(entidade, fonte, nomePortador = '') {
    const r = resolverComEstagio(entidade);
    if (!fonte) return r;
    // `fonte` = a ficha do portador (usa ficha.contadores e, para "por aliado", a mesa) ou, direto, a lista de contadores.
    const contadores = Array.isArray(fonte) ? fonte : fonte.contadores;
    const ficha = Array.isArray(fonte) ? null : fonte;
    return escalarResultado(r, contadores, ficha, nomePortador);
}

// 🔢 Escala (M8/M9). SOMA, nunca multiplica: valor final = valor + fator x (valor do contador) [+ fator x aliados em campo].
//   escalaContador: { contadorId, fator }   -> contador da ficha do portador (inexistente = sem escala).
//   escalaAliados:  { fator, filtro? }      -> nº de aliados na CENA ATIVA (core/aliadosEmCampo.js); filtro = "afiliacao|raca|classe=texto".
//     O portador vem de `nomePortador` (3º argumento) ou da identidade da ficha na mesa; sem ele a contagem é 0 (falha fechada).
// Vale em efeitos ativos e passivos (da técnica e da Forma ativa; a Configuração de Forma não escala). Fator finito, diferente de 0, até
// LIMITE_FATOR_ESCALA. Sem NaN: resultado não finito, valor-base não numérico (ex.: dado "20d6") ou escala inválida mantêm o efeito como está.
// Não muta o efeito original (devolve cópias só dos efeitos escalados). Efeitos sem esses campos passam direto (custo ~zero).
export const LIMITE_FATOR_ESCALA = 1e6;
const fatorValido = (f) => { const n = Number(f); return Number.isFinite(n) && n !== 0 && Math.abs(n) <= LIMITE_FATOR_ESCALA ? n : null; };

export function escalarEfeitosPorContador(efeitos, contadores, ficha = null, nomePortador = '') {
    if (!Array.isArray(efeitos)) return efeitos;
    // Caminho rápido: sem nenhum efeito escalável não aloca nada.
    if (!efeitos.some(e => e && typeof e === 'object' && (e.escalaContador || e.escalaAliados || e.escalaMovimento))) return efeitos;
    let mudou = false;
    const lista = Array.isArray(contadores) ? contadores : [];
    const saida = efeitos.map((e) => {
        if (!e || typeof e !== 'object') return e;
        const ec = e.escalaContador && typeof e.escalaContador === 'object' ? e.escalaContador : null;
        const ea = e.escalaAliados && typeof e.escalaAliados === 'object' ? e.escalaAliados : null;
        const em = e.escalaMovimento && typeof e.escalaMovimento === 'object' ? e.escalaMovimento : null;
        if (!ec && !ea && !em) return e;
        // 👣 Escala por movimento (core/movimentoNoTurno.js): fator x quadrados percorridos no turno, com teto `max` obrigatório (sem ele não escala).
        if (em && String(e.atributo ?? '').trim().toLowerCase() === ATRIBUTO_DANO_DADOS) {
            // Dado de dano: o valor "NdM" é o dado POR quadrado; dados = N x fator x quadrados (inteiro, limitado ao teto de dados do golpe).
            // Sem escala válida, sem ficha ou sem quadrados = 0 dados (o efeito não soma nada).
            const d = lerDadoDeDano(e.valor);
            if (!d) return e;
            const esc = normalizarEscalaMovimento(em);
            const q = esc && esc.fator > 0 && ficha ? quadradosContados(ficha, esc.max) : 0;
            const qtd = esc ? Math.min(LIMITES_DANO_DADOS.qtdMax, Math.floor(d.qtd * esc.fator * q)) : 0;
            mudou = true;
            return { ...e, valor: qtd >= 1 ? formatarDadoDeDano({ qtd, faces: d.faces }) : `0d${d.faces}` };
        }
        const textoBase = String(e.valor ?? '').trim().replace(',', '.');
        const base = textoBase === '' ? 0 : Number(textoBase);
        if (!Number.isFinite(base)) return e;
        let total = base;
        if (ec) {
            const f = fatorValido(ec.fator);
            const ct = f === null ? null : lista.find(c => c && String(c.id) === String(ec.contadorId));
            const n = ct ? Number(ct.valor) : NaN;
            if (Number.isFinite(n)) total += f * n;
        }
        if (ea && ficha) {
            const f = fatorValido(ea.fator);
            if (f !== null) total += f * contarAliadosEmCampoDaMesa(ficha, normalizarFiltroAliado(ea.filtro), nomeDoPortador(ficha, nomePortador));
        }
        if (em && ficha) {
            const esc = normalizarEscalaMovimento(em);
            if (esc) total += esc.fator * quadradosContados(ficha, esc.max);
        }
        if (!Number.isFinite(total) || total === base) return e;
        mudou = true;
        return { ...e, valor: String(Math.round(total * 1e6) / 1e6) };
    });
    return mudou ? saida : efeitos;
}

function escalarResultado(r, contadores, ficha, nomePortador) {
    const efeitos = escalarEfeitosPorContador(r.efeitos, contadores, ficha, nomePortador);
    const efeitosPassivos = escalarEfeitosPorContador(r.efeitosPassivos, contadores, ficha, nomePortador);
    return efeitos === r.efeitos && efeitosPassivos === r.efeitosPassivos ? r : { ...r, efeitos, efeitosPassivos };
}



function resolverComEstagio(entidade) {
    if (!temEstagios(entidade)) return resolverSemEstagio(entidade);
    const fator = fatorGeralDoEstagio(entidade);
    const formas = (fator !== 1 && Array.isArray(entidade.formas))
        ? entidade.formas.map(f => (f ? { ...f, efeitos: escalarPorFator(f.efeitos, fator) } : f))
        : entidade.formas;
    return resolverSemEstagio({ ...entidade, efeitos: efeitosDoEstagio(entidade.efeitos, entidade), formas });
}

function resolverSemEstagio(entidade) {
    if (!entidade) return { efeitos: [], efeitosPassivos: [] };

    const baseEfeitos = entidade.efeitos || [];
    const basePassivos = entidade.efeitosPassivos || [];
    const formas = entidade.formas || [];
    const formaAtivaId = entidade.formaAtivaId;

    if (!formaAtivaId || formas.length === 0) {
        return { efeitos: baseEfeitos, efeitosPassivos: basePassivos };
    }

    const formaAtiva = formas.find(f => f.id === formaAtivaId);
    if (!formaAtiva) {
        return { efeitos: baseEfeitos, efeitosPassivos: basePassivos };
    }

    const formaEfeitos = formaAtiva.efeitos || [];
    const formaPassivos = formaAtiva.efeitosPassivos || [];

    if (formaAtiva.acumulaFormaBase !== false) {
        return {
            efeitos: [...baseEfeitos, ...formaEfeitos],
            efeitosPassivos: [...basePassivos, ...formaPassivos]
        };
    }

    return { efeitos: formaEfeitos, efeitosPassivos: formaPassivos };
}
