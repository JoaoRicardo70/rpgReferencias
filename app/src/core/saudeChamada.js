// ==========================================
// 📞 SAÚDE DAS CHAMADAS DE VOZ — lógica pura. Decide quando uma ligação WebRTC deve ser derrubada para o discador refazê-la.
// Sem isso, uma ligação "morta" (o outro lado saiu e voltou, a rede caiu, a trilha acabou) ficava na lista como conectada
// e o áudio só voltava quando TODOS saíam e entravam de novo na Sala da Party.
// ==========================================

export const ESPERA_DISCONNECTED_MS = 15000;  // 'disconnected' pode ser queda passageira: dá esse tempo antes de refazer
export const ESPERA_ATENDER_MS = 15000;      // ligação que não recebe áudio nesse tempo é descartada (e refeita)
export const ESPERA_FALLBACK_DISCAR_MS = 12000; // o lado que normalmente só atende também liga, se ninguém ligou nesse tempo

// 'ok' = deixa quieta; 'refazer' = derruba e deixa o discador ligar de novo.
export function avaliarSaudeDaChamada({ estadoIce, todasTrilhasEncerradas = false, ruimHaMs = 0 } = {}) {
    if (estadoIce === 'failed' || estadoIce === 'closed') return 'refazer';
    if (todasTrilhasEncerradas) return 'refazer';
    if (estadoIce === 'disconnected' && ruimHaMs >= ESPERA_DISCONNECTED_MS) return 'refazer';
    return 'ok';
}

// Ids (anime-rpg-...) das ligações que sobraram: o amigo não está mais na Sala da Party (ou nunca esteve) e não sou eu.
export function ligacoesSemDono(idsConectados, idsNaSala, meuId) {
    const naSala = new Set(idsNaSala || []);
    return (idsConectados || []).filter(id => id !== meuId && !naSala.has(id));
}

// Quem tem o id "menor" liga; o outro só liga se continuar sem conexão por tempo demais (rede que bloqueia um sentido, ligação perdida).
export function deveDiscar({ meuId, amigoId, semConexaoHaMs = 0 }) {
    if (!meuId || !amigoId || meuId === amigoId) return false;
    if (meuId < amigoId) return true;
    return semConexaoHaMs >= ESPERA_FALLBACK_DISCAR_MS;
}
