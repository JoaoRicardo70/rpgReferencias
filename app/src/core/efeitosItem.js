// Efeitos de item equipado: passivos valem sempre; ativos só com o toggle ligado.
// item.efeitosAtivos: undefined/true = ligado (itens antigos), false = desligado.

export function efeitosAtivosLigados(item) {
    return !!item && item.efeitosAtivos !== false;
}

// Efeitos ATIVOS que valem agora ([] quando o toggle está desligado).
export function efeitosAtivosDoItem(item) {
    if (!item || item.efeitosAtivos === false) return [];
    return Array.isArray(item.efeitos) ? item.efeitos : [];
}

// Efeitos da Configuração (modo) ativa da Forma Mística ativa de qualquer entidade (Poder, item, Ser).
// A Config é a ativa (configAtivaId) ou a primeira; sem Config devolve null (a Forma antiga guarda
// os efeitos nela mesma e o resolvedor de efeitos já cuida disso). Desativar a Forma zera tudo aqui.
export function efeitosDaConfigAtiva(entidade) {
    if (!entidade || !entidade.formaAtivaId || !Array.isArray(entidade.formas)) return null;
    const forma = entidade.formas.find(f => f && f.id === entidade.formaAtivaId);
    if (!forma) return null;
    const configs = Array.isArray(forma.configs) ? forma.configs.filter(Boolean) : [];
    const cfg = (entidade.configAtivaId && configs.find(c => c.id === entidade.configAtivaId)) || configs[0] || null;
    if (!cfg) return null;
    return {
        efeitos: Array.isArray(cfg.efeitos) ? cfg.efeitos : [],
        efeitosPassivos: Array.isArray(cfg.efeitosPassivos) ? cfg.efeitosPassivos : []
    };
}

// Efeitos PASSIVOS (sempre valem com o item equipado).
export function efeitosPassivosDoItem(item) {
    return item && Array.isArray(item.efeitosPassivos) ? item.efeitosPassivos : [];
}
