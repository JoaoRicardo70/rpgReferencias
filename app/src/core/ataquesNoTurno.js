// ==========================================
// ⚔️ ATAQUES NO TURNO — contador mínimo, puro (sem imports). Alimenta a condição "primeiro_ataque_do_turno" (core/efeitosCondicionais.js).
//   ficha.combate.ataquesNoTurno = quantos golpes (rolagens de Dano) o portador já fez no turno atual.
// Soma 1 a cada golpe de Dano real (components/combate/AtaqueFormContext.jsx; Dano usado como Reação não conta) e volta a ZERO:
//   • no início do turno do portador (components/mapa/MapaFormContext.jsx > aplicarInicioDeTurno);
//   • no evento turnoInicio e no fimDeLuta (core/gatilhosAplicar.js > dispararEventoNaFicha).
// ==========================================

export const CAMINHO_ATAQUES_NO_TURNO = 'combate/ataquesNoTurno';

export function ataquesNoTurno(ficha) {
    const n = Math.floor(Number(ficha && ficha.combate && ficha.combate.ataquesNoTurno));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

// Registra um golpe do portador no turno (muta o rascunho recebido).
export function registrarAtaqueNoTurno(ficha) {
    if (!ficha || typeof ficha !== 'object') return 0;
    if (!ficha.combate || typeof ficha.combate !== 'object') ficha.combate = {};
    ficha.combate.ataquesNoTurno = ataquesNoTurno(ficha) + 1;
    return ficha.combate.ataquesNoTurno;
}

// Zera o contador. Devolve true se havia algo a zerar (sem campo ou já 0 = nada muda).
export function zerarAtaquesNoTurno(ficha) {
    if (!ficha || !ficha.combate || typeof ficha.combate !== 'object') return false;
    if (ataquesNoTurno(ficha) === 0) return false;
    ficha.combate.ataquesNoTurno = 0;
    return true;
}
