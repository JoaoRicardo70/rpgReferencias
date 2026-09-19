// Volume individual de cada jogador na Sala da Party, guardado no navegador.
// Compartilhado entre o cartão do Mapa e o player global, que toca em qualquer aba.
const ouvintes = new Set();

export function lerVolumeVoz(nome) {
    try {
        const salvo = localStorage.getItem(`rpg_vol_${nome}`);
        const n = salvo !== null ? parseFloat(salvo) : 1;
        return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
    } catch (e) { return 1; }
}

export function salvarVolumeVoz(nome, volume) {
    try { localStorage.setItem(`rpg_vol_${nome}`, String(volume)); } catch (e) { /* sem storage */ }
    ouvintes.forEach(fn => fn(nome, volume));
}

export function assinarVolumesVoz(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
}

export function idDeVoz(nome) {
    return `anime-rpg-${(nome || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}
