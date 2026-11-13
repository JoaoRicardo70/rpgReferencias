// ==========================================
// ⚔️ ESTADO DO COMBATE POR CENA (lógica pura).
// `cenario.combates[cenaId] = { ativo: true, rodada: n, iniciadoEm: ts }`. Ausente ou ativo !== true = SEM combate (fase de preparação:
// iniciativas e ordem montadas, mas turnos, Adaptação e gatilhos de turno NÃO contam). O Mestre/Co-Mestre inicia e encerra.
// As funções devolvem um NOVO objeto de cenário (nunca mutam o recebido).
// ==========================================

export function getCombateDaCena(cenario, cenaId) {
    const c = cenario && cenario.combates && cenario.combates[cenaId || 'default'];
    return c && typeof c === 'object' ? c : null;
}

export function combateAtivo(cenario, cenaId) {
    const c = getCombateDaCena(cenario, cenaId);
    return !!c && c.ativo === true;
}

// Rodada atual (1..n); 0 quando não há combate ativo.
export function getRodada(cenario, cenaId) {
    const c = getCombateDaCena(cenario, cenaId);
    if (!c || c.ativo !== true) return 0;
    const n = Math.floor(Number(c.rodada));
    return n >= 1 ? n : 1;
}

function clonar(cenario) {
    return JSON.parse(JSON.stringify(cenario || {}));
}

// Inicia: Rodada 1, turnoAtualIndex volta a 0 (o primeiro da ordem começa).
export function iniciarCombateNoCenario(cenario, cenaId, agora = Date.now()) {
    const novo = clonar(cenario);
    const id = cenaId || 'default';
    novo.combates = { ...(novo.combates || {}), [id]: { ativo: true, rodada: 1, iniciadoEm: agora } };
    novo.turnoAtualIndex = 0;
    return novo;
}

// Encerra: remove o registro da cena (volta a "sem combate") e, por padrão, zera o turno (`resetarTurno: false` mantém o turnoAtualIndex, como na troca de cena).
export function encerrarCombateNoCenario(cenario, cenaId, { resetarTurno = true } = {}) {
    const novo = clonar(cenario);
    const id = cenaId || 'default';
    if (novo.combates) {
        delete novo.combates[id];
        if (Object.keys(novo.combates).length === 0) delete novo.combates;
    }
    if (resetarTurno) novo.turnoAtualIndex = 0;
    return novo;
}

// A rodada sobe quando o índice do turno dá a volta (o novo índice é 0). Sem combate ativo ou ordem vazia: devolve o cenário igual (cópia).
export function avancarRodadaSeVoltou(cenario, cenaId, indiceAnterior, novoIndice, tamanho) {
    const novo = clonar(cenario);
    const id = cenaId || 'default';
    if (!(tamanho > 0) || !combateAtivo(novo, id)) return novo;
    const voltou = Number(novoIndice) === 0 && Number(indiceAnterior) >= 0;
    if (!voltou) return novo;
    novo.combates[id] = { ...novo.combates[id], rodada: getRodada(novo, id) + 1 };
    return novo;
}
