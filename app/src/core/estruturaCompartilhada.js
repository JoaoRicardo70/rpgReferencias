// ==========================================
// ♻️ Estrutura compartilhada — lógica pura.
// O Firebase entrega um objeto NOVO a cada snapshot da mesa. Se cada save de qualquer jogador trocasse a referência de TODOS os personagens,
// todo cache/memo/selector que olha a identidade da ficha seria invalidado sem necessidade. Aqui, personagem cujo conteúdo não mudou
// mantém a referência que já estava no store; só os que mudaram (ou são novos) usam o objeto novo.
// ==========================================

// Igualdade profunda de dados JSON (objetos, arrays, primitivos); ordem das chaves não importa.
export function iguaisProfundo(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b);
    const arrA = Array.isArray(a);
    if (arrA !== Array.isArray(b)) return false;
    if (arrA) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!iguaisProfundo(a[i], b[i])) return false;
        return true;
    }
    const chavesA = Object.keys(a);
    if (chavesA.length !== Object.keys(b).length) return false;
    for (const k of chavesA) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || !iguaisProfundo(a[k], b[k])) return false;
    }
    return true;
}

// `locais` e `novos`: { nome: ficha }. Devolve `novos` com a referência de `locais[nome]` nos personagens de conteúdo idêntico.
// Se nada mudou em nenhum personagem e o conjunto de nomes é o mesmo, devolve o próprio objeto `locais`.
export function preservarReferenciasIguais(locais, novos) {
    if (!novos || typeof novos !== 'object') return novos;
    if (!locais || typeof locais !== 'object') return novos;
    const nomesNovos = Object.keys(novos);
    const resultado = {};
    let tudoIgual = nomesNovos.length === Object.keys(locais).length;
    for (const nome of nomesNovos) {
        const local = locais[nome];
        if (local !== undefined && iguaisProfundo(local, novos[nome])) resultado[nome] = local;
        else { resultado[nome] = novos[nome]; tudoIgual = false; }
    }
    return tudoIgual ? locais : resultado;
}
