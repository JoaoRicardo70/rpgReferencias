import { temEstagios, efeitosDoEstagio, fatorGeralDoEstagio, escalarPorFator } from './estagios.js';

/**
 * Resolve quais efeitos (ativos e passivos) estao realmente ativos
 * para uma entidade (poder ou item), considerando formas e o estagio atual
 * (core/estagios.js: os efeitos ATIVOS seguem o estagio -- os da tecnica, ou os da
 * "mudanca" em vigor naquele estagio, com o crescimento; passivos nao mudam). Sub-formas
 * da tecnica escalam pelo crescimento geral (nao tem lista propria por "mudanca").
 */
export function resolverEfeitosEntidade(entidade) {
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
