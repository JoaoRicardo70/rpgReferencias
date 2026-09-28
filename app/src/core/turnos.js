// ==========================================
// ORDEM DE TURNO MANUAL — lógica pura (sem React/Firebase) usada pelo Mapa (MapaFormContext.jsx >
// ordemIniciativa) e pelo Controle de Turnos da aba Mestre (MestreControleTurno.jsx).
//
// Pedido do usuário: o Mestre/Co-Mestre pode ARRASTAR personagens pra dentro, pra fora e dentro
// da ordem de turno. Quem entra/sai continua sendo decidido pela iniciativa (> 0) de cada ficha,
// como sempre; a ORDEM arrumada à mão fica em cenario.ordemTurnoManual[cenaId] (lista de chaves),
// que o Firebase já sincroniza pra todo mundo junto com o turnoAtualIndex.
//   - Sem ordem manual na cena: ordem por iniciativa (maior primeiro), igual antes.
//   - Com ordem manual: quem está nela segue a ordem dela; quem entrou depois (rolou iniciativa
//     no Mapa, por ex.) é encaixado pela iniciativa — antes do primeiro que tiver iniciativa menor.
// ==========================================

export function chaveEntidadeTurno(entidade) {
    if (!entidade) return '';
    return `${entidade.isDummie ? 'd' : 'p'}:${entidade.id}`;
}

// `lista`: [{ id, isDummie, iniciativa, ... }] (qualquer ordem). `ordemManual`: [chave] ou nada.
export function ordenarOrdemTurno(lista, ordemManual) {
    const porIniciativa = [...(lista || [])].sort((a, b) => (Number(b.iniciativa) || 0) - (Number(a.iniciativa) || 0));
    if (!Array.isArray(ordemManual) || ordemManual.length === 0) return porIniciativa;

    const posicaoManual = new Map();
    ordemManual.forEach((chave, i) => { if (!posicaoManual.has(chave)) posicaoManual.set(chave, i); });

    const resultado = porIniciativa
        .filter(e => posicaoManual.has(chaveEntidadeTurno(e)))
        .sort((a, b) => posicaoManual.get(chaveEntidadeTurno(a)) - posicaoManual.get(chaveEntidadeTurno(b)));

    porIniciativa
        .filter(e => !posicaoManual.has(chaveEntidadeTurno(e)))
        .forEach((novo) => {
            const ini = Number(novo.iniciativa) || 0;
            const idx = resultado.findIndex(e => (Number(e.iniciativa) || 0) < ini);
            if (idx === -1) resultado.push(novo); else resultado.splice(idx, 0, novo);
        });
    return resultado;
}

// Move/insere `chave` na posição `novoIndice` de `chaves` (sem duplicar). Retorna uma lista nova.
export function moverChaveNaOrdem(chaves, chave, novoIndice) {
    const semEla = (chaves || []).filter(c => c !== chave);
    const idx = Math.max(0, Math.min(semEla.length, Math.floor(Number(novoIndice)) || 0));
    semEla.splice(idx, 0, chave);
    return semEla;
}

// Índice do turno depois de mudar a ordem, pra a vez continuar com QUEM já estava jogando. Se essa
// entidade saiu da ordem, a vez passa pra quem ocupar a mesma posição (o próximo da fila).
export function recalcularIndiceTurno(chavesAntes, chavesDepois, indiceAtual) {
    const depois = chavesDepois || [];
    if (depois.length === 0) return 0;
    const antes = chavesAntes || [];
    if (antes.length === 0) return 0;
    const atual = ((Math.floor(Number(indiceAtual)) || 0) % antes.length + antes.length) % antes.length;
    const chaveDaVez = antes[atual];
    const novo = depois.indexOf(chaveDaVez);
    if (novo !== -1) return novo;
    // Saiu quem estava na vez: o próximo ainda presente na ordem antiga assume.
    for (let passo = 1; passo < antes.length; passo++) {
        const idx = depois.indexOf(antes[(atual + passo) % antes.length]);
        if (idx !== -1) return idx;
    }
    return 0;
}
