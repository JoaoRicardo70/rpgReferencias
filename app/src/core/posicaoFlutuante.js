// ==========================================
// 📌 POSIÇÃO DE UM BOTÃO FLUTUANTE ARRASTÁVEL — lógica pura. O botão do Livro de Combate (Mapa) pode ser arrastado pra
// onde não atrapalhe e lembra o lugar (localStorage). Sempre fica dentro da tela e fora da faixa do topo (barra de navegação).
// ==========================================

export const MARGEM_FLUTUANTE = 8;

// Mantém {x, y} dentro da janela (considerando o tamanho do botão e uma margem), e abaixo do topo reservado.
export function limitarPosicao(pos, janela, tamanho = { largura: 60, altura: 36 }, topoReservado = 0) {
    const larguraJanela = Number(janela?.largura) || 0;
    const alturaJanela = Number(janela?.altura) || 0;
    const maxX = Math.max(MARGEM_FLUTUANTE, larguraJanela - tamanho.largura - MARGEM_FLUTUANTE);
    const maxY = Math.max(topoReservado + MARGEM_FLUTUANTE, alturaJanela - tamanho.altura - MARGEM_FLUTUANTE);
    const x = Math.min(maxX, Math.max(MARGEM_FLUTUANTE, Number(pos?.x) || 0));
    const y = Math.min(maxY, Math.max(topoReservado + MARGEM_FLUTUANTE, Number(pos?.y) || 0));
    return { x: Math.round(x), y: Math.round(y) };
}

// Lugar inicial: encostado na borda esquerda, no meio da altura (longe dos botões de baixo e da barra do topo).
export function posicaoInicial(janela, tamanho, topoReservado = 0) {
    const altura = Number(janela?.altura) || 0;
    return limitarPosicao({ x: MARGEM_FLUTUANTE, y: topoReservado + (altura - topoReservado) * 0.4 }, janela, tamanho, topoReservado);
}

export function lerPosicaoSalva(chave, storage) {
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const bruto = s ? JSON.parse(s.getItem(chave) || 'null') : null;
        if (bruto && Number.isFinite(bruto.x) && Number.isFinite(bruto.y)) return { x: bruto.x, y: bruto.y };
    } catch (e) { /* sem localStorage ou JSON ruim */ }
    return null;
}

export function salvarPosicao(chave, pos, storage) {
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (s) s.setItem(chave, JSON.stringify({ x: pos.x, y: pos.y }));
    } catch (e) { /* sem localStorage */ }
}

// O movimento só vira "arrastar" depois de passar de alguns pixels (senão o clique normal abriria/fecharia o Livro).
export function movimentoEhArrasto(inicio, atual, limite = 5) {
    return Math.hypot((atual?.x || 0) - (inicio?.x || 0), (atual?.y || 0) - (inicio?.y || 0)) > limite;
}
