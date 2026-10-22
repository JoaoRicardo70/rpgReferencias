// ==========================================
// 🎨 CORES DO DADO — o jogador escolhe a cor do dado em cada tipo de resultado (comum, Crítico, Crítico Fatal, Falha Crítica).
// Preferência só deste aparelho (localStorage 'rpg_dado_cores'). Lógica pura.
// ==========================================
import { NIVEIS_ROLAGEM } from './rolagemDado.js';

export const CHAVE_CORES_DADO = 'rpg_dado_cores';
export const NIVEIS_COLORIVEIS = ['normal', 'critico', 'fatal', 'falha'];

export function coresPadraoDoDado() {
    const cores = {};
    NIVEIS_COLORIVEIS.forEach(n => { cores[n] = NIVEIS_ROLAGEM[n].cor; });
    return cores;
}

// Aceita só "#rrggbb" (o que o seletor de cor do navegador devolve); devolve minúsculo ou null.
export function normalizarCor(cor) {
    const c = String(cor || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(c) ? c : null;
}

// Clareia uma cor misturando com branco (fator 0-1): a cor do texto do rótulo sai legível sobre fundo escuro.
export function clarearCor(cor, fator = 0.4) {
    const c = normalizarCor(cor);
    if (!c) return '#ffffff';
    const f = Math.min(1, Math.max(0, Number(fator) || 0));
    const canais = [1, 3, 5].map(i => {
        const v = parseInt(c.slice(i, i + 2), 16);
        return Math.round(v + (255 - v) * f).toString(16).padStart(2, '0');
    });
    return '#' + canais.join('');
}

// Preferências guardadas, completadas com o padrão (cores inválidas viram o padrão).
export function lerCoresDado(storage) {
    const padrao = coresPadraoDoDado();
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const bruto = s ? JSON.parse(s.getItem(CHAVE_CORES_DADO) || '{}') : {};
        const cores = { ...padrao };
        NIVEIS_COLORIVEIS.forEach(n => { const ok = normalizarCor(bruto && bruto[n]); if (ok) cores[n] = ok; });
        return cores;
    } catch (e) { return padrao; }
}

export function salvarCoresDado(cores, storage) {
    const padrao = coresPadraoDoDado();
    const limpas = {};
    NIVEIS_COLORIVEIS.forEach(n => { limpas[n] = normalizarCor(cores && cores[n]) || padrao[n]; });
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (s) s.setItem(CHAVE_CORES_DADO, JSON.stringify(limpas));
    } catch (e) { /* sem localStorage */ }
    return limpas;
}

// Aplica as cores do jogador ao resultado classificado (core/rolagemDado.js > classificarRolagem).
export function aplicarCoresDado(info, cores) {
    const base = info || NIVEIS_ROLAGEM.normal;
    const escolhida = normalizarCor(cores && cores[base.nivel]);
    // Sem escolha (ou igual ao padrão): o resultado fica exatamente como era, inclusive a cor do texto.
    if (!escolhida || escolhida === base.cor) return base;
    return { ...base, cor: escolhida, corTexto: clarearCor(escolhida, 0.4) };
}
