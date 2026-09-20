// Volume individual de cada jogador na Sala da Party, guardado no navegador.
// Compartilhado entre o cartão do Mapa e o player global, que toca em qualquer aba.
const ouvintes = new Set();

// Escala do volume: 1 = 100% (sinal como chegou). Acima de 1 a voz é amplificada por um GainNode
// (o elemento <audio> só vai até 100%). O padrão é 200% porque o sinal que chega costuma ser baixo.
export const VOLUME_MAXIMO_VOZ = 4;
export const VOLUME_PADRAO_VOZ = 2;

const limitarVolume = (n) => Math.min(VOLUME_MAXIMO_VOZ, Math.max(0, n));

// Chave nova (rpg_vol2_): os valores antigos (rpg_vol_) estavam numa escala que ia só até 100%.
export function lerVolumeVoz(nome) {
    try {
        const salvo = localStorage.getItem(`rpg_vol2_${nome}`);
        const n = salvo !== null ? parseFloat(salvo) : VOLUME_PADRAO_VOZ;
        return Number.isFinite(n) ? limitarVolume(n) : VOLUME_PADRAO_VOZ;
    } catch (e) { return VOLUME_PADRAO_VOZ; }
}

export function salvarVolumeVoz(nome, volume) {
    try { localStorage.setItem(`rpg_vol2_${nome}`, String(volume)); } catch (e) { /* sem storage */ }
    ouvintes.forEach(fn => fn(nome, volume));
}

export function assinarVolumesVoz(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
}

export function idDeVoz(nome) {
    return `anime-rpg-${(nome || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}
