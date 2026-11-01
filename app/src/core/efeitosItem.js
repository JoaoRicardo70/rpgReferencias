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

// Efeitos PASSIVOS (sempre valem com o item equipado).
export function efeitosPassivosDoItem(item) {
    return item && Array.isArray(item.efeitosPassivos) ? item.efeitosPassivos : [];
}
