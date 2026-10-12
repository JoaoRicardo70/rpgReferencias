// ==========================================
// 📏 ALCANCE E CENA — confere se o alvo de um golpe está na mesma cena e dentro do alcance de
// quem ataca. A checagem é CAUTELOSA de propósito: só bloqueia quando as duas posições são
// conhecidas e o problema é claro. Se faltar a posição de um dos dois (dado antigo, token fora do
// mapa, ficha sem cenaId...) o golpe segue liberado ("não verificado"), pra uma falha de detecção
// nunca impedir o combate.
// ==========================================

// { x, y, z, cenaId } da entidade na cena pedida (ou na última posição conhecida), ou null.
// `entidade` pode ser ficha de personagem (posicoes[cena] / posicao) ou Dummie (posicao + cenaId).
export function getPosicaoEntidade(entidade, cenaId) {
    if (!entidade) return null;
    const cena = cenaId || null;
    if (cena && entidade.posicoes && entidade.posicoes[cena] && entidade.posicoes[cena].x !== undefined) {
        return { ...entidade.posicoes[cena], cenaId: cena };
    }
    const p = entidade.posicao;
    if (!p || p.x === undefined || p.y === undefined) return null;
    return { x: Number(p.x) || 0, y: Number(p.y) || 0, z: Number(p.z) || 0, cenaId: p.cenaId || entidade.cenaId || 'default' };
}

// Maior alcance (em quadrados) declarado nas armas equipadas, Poderes ativos e magias equipadas — a
// mesma regra da aba Ataque (AcertoFormContext). `padrao` é o que vale quando NADA declara alcance:
// 1 na aba Ataque; null quando o chamador quer PULAR a checagem de alcance nesse caso (Mapa), pra
// uma arma/poder sem alcance preenchido não virar "só corpo a corpo" de repente.
export function getAlcanceMaximo(ficha, { padrao = 1 } = {}) {
    if (!ficha) return padrao;
    const valores = [];
    (ficha.inventario || []).forEach(i => { if (i && i.equipado && i.tipo === 'arma') valores.push(Number(i.alcance)); });
    (ficha.poderes || []).forEach(p => { if (p && p.ativa) valores.push(Number(p.alcance)); });
    (ficha.ataquesElementais || []).forEach(m => { if (m && m.equipado) valores.push(Number(m.alcanceQuad)); });
    const declarados = valores.filter(v => Number.isFinite(v) && v > 0);
    return declarados.length > 0 ? Math.max(...declarados) : padrao;
}

// Distância em quadrados (a maior entre x, y e a altura convertida pela escala da cena).
export function distanciaQuadrados(a, b, escala = 1.5) {
    const dx = Math.abs((a.x || 0) - (b.x || 0));
    const dy = Math.abs((a.y || 0) - (b.y || 0));
    const dz = Math.floor(Math.abs((a.z || 0) - (b.z || 0)) / (escala || 1.5));
    return Math.max(dx, dy, dz);
}

// → { ok, verificado, motivo?, distancia? }
export function verificarAlvoNoAlcance({ posAtor, posAlvo, alcance, escala = 1.5 }) {
    if (!posAtor || !posAlvo) return { ok: true, verificado: false };
    if ((posAtor.cenaId || 'default') !== (posAlvo.cenaId || 'default')) {
        return { ok: false, verificado: true, motivo: 'O alvo está em outra cena.' };
    }
    const distancia = distanciaQuadrados(posAtor, posAlvo, escala);
    const max = Number(alcance);
    if (Number.isFinite(max) && max > 0 && distancia > max) {
        return { ok: false, verificado: true, distancia, motivo: `O alvo está fora de alcance (${distancia} quadrado(s); o seu alcance é ${max}).` };
    }
    return { ok: true, verificado: true, distancia };
}
