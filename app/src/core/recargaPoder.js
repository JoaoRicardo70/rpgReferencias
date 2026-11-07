// ==========================================
// ⏳ RECARGA EM TURNOS (cooldown) — lógica pura. Um Poder pode exigir esperar N turnos do dono antes de ser usado de novo:
//   recargaTurnos — inteiro 0 a 99 (0 ou ausente = sem recarga)
//   recargaRestante — turnos que ainda faltam (estado; só existe na ficha enquanto > 0)
// "Usar" = LIGAR o Poder (o mesmo evento que gasta `usosMax`, em core/usosPoder.js); vale também para Poder sem usosMax.
// O contador cai 1 no início de cada turno do dono e zera ao descansar (core/vitals.js > descansarCompleto).
// ==========================================
export const LIMITE_RECARGA = 99;

export function normalizarRecarga(valor) {
    const n = Math.floor(Number(String(valor ?? '').replace(',', '.')));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(LIMITE_RECARGA, n);
}

export function recargaRestanteDe(poder) {
    return poder ? normalizarRecarga(poder.recargaRestante) : 0;
}

export function emRecarga(poder) {
    return recargaRestanteDe(poder) > 0;
}

export function mensagemRecarga(poder) {
    const n = recargaRestanteDe(poder);
    return `${poder && poder.nome ? poder.nome : 'Poder'} em recarga: faltam ${n} turno${n === 1 ? '' : 's'}`;
}

// Selo do cartão: "⏳ recarga 2" (restante) ou "⏳ recarga de 2 turnos" (só configurada). Vazio sem recarga.
export function descreverRecarga(poder) {
    if (!poder) return '';
    const restante = recargaRestanteDe(poder);
    if (restante > 0) return `⏳ recarga ${restante}`;
    const total = normalizarRecarga(poder.recargaTurnos);
    return total > 0 ? `⏳ recarga de ${total} turno${total === 1 ? '' : 's'}` : '';
}

// Ao usar: começa a contar. Muta o Poder do rascunho. Sem recarga configurada não escreve nada.
export function iniciarRecarga(poder) {
    const total = normalizarRecarga(poder && poder.recargaTurnos);
    if (total > 0) poder.recargaRestante = total;
}

// Início do turno do dono: todo Poder em recarga perde 1 turno. Devolve quantos mudaram.
export function passarTurnoDasRecargas(ficha) {
    let mudou = 0;
    (Array.isArray(ficha && ficha.poderes) ? ficha.poderes : []).forEach((p) => {
        if (!p || p.recargaRestante === undefined) return;
        const novo = recargaRestanteDe(p) - 1;
        if (novo > 0) p.recargaRestante = novo; else delete p.recargaRestante;
        mudou++;
    });
    return mudou;
}

// Descanso: zera todas as recargas em andamento.
export function zerarRecargas(ficha) {
    (Array.isArray(ficha && ficha.poderes) ? ficha.poderes : []).forEach((p) => { if (p && p.recargaRestante !== undefined) delete p.recargaRestante; });
}
