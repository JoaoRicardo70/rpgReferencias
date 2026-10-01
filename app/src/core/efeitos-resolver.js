import { escalarEfeitosPorEstagio } from './estagios.js';

/**
 * Resolve quais efeitos (ativos e passivos) estao realmente ativos
 * para uma entidade (poder ou item), considerando formas e o estagio atual
 * (core/estagios.js: os efeitos ATIVOS escalam com o estagio; passivos nao).
 */
export function resolverEfeitosEntidade(entidade) {
    const resolvido = resolverSemEstagio(entidade);
    return { ...resolvido, efeitos: escalarEfeitosPorEstagio(resolvido.efeitos, entidade) };
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
