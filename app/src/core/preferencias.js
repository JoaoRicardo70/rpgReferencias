// ==========================================
// 💾 PREFERÊNCIAS DA CONTA — lógica pura. As configurações (estilo, teclas de atalho, volumes, cores do dado, layout da Sala da
// Party...) ficam no localStorage do aparelho; este módulo escolhe QUAIS delas acompanham a conta do jogador e compara/mescla
// com a cópia guardada no Firebase, para que entrar de outro navegador/aparelho traga tudo de volta.
// ==========================================

// Chaves exatas e prefixos (volume individual de cada jogador). Nada específico de uma mesa ou de uma posição de tela.
export const CHAVES_PREFERENCIAS = [
    'rpg_tema', 'rpg_atalhos', 'rpg_config', 'rpg_volume_musica', 'rpg_navegacao', 'rpg_mesa_gaveta',
    'rpg_sensibilidade_voz_v2', 'rpg_dado_cores', 'rpg_fonte', 'rpg_brilho', 'rpg_desempenho', 'rpg_volume', 'rpg_sfx',
    'rpg_clipe_buffer_auto', 'rpg_clipe_duracao',
    'rpg_sala_party_feed', 'rpg_sala_party_midia', 'rpg_sala_party_lados', 'rpg_sala_party_junto',
    'rpg_dados_mestre_privados', 'rpg_acerto_mestre_oculto'
];
export const PREFIXOS_PREFERENCIAS = ['rpg_vol2_'];

export const TAMANHO_MAX_VALOR = 6000;   // um valor maior que isso não é preferência: é lixo
export const MAX_PREFERENCIAS = 120;

export function ehChaveDePreferencia(chave) {
    if (typeof chave !== 'string' || chave.length > 80) return false;
    if (CHAVES_PREFERENCIAS.includes(chave)) return true;
    return PREFIXOS_PREFERENCIAS.some(p => chave.startsWith(p) && chave.length > p.length && /^[A-Za-z0-9_\-]+$/.test(chave));
}

// O Firebase não aceita . # $ [ ] / em chaves: as nossas só têm letras, números e _ - (conferido acima), então passam direto.
export function coletarPreferencias(storage) {
    const saida = {};
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!s) return saida;
        const chaves = [];
        for (let i = 0; i < s.length; i++) chaves.push(s.key(i));
        chaves.sort().forEach(k => {
            if (!ehChaveDePreferencia(k) || Object.keys(saida).length >= MAX_PREFERENCIAS) return;
            const v = s.getItem(k);
            if (typeof v === 'string' && v.length <= TAMANHO_MAX_VALOR) saida[k] = v;
        });
    } catch (e) { /* sem localStorage */ }
    return saida;
}

// Só o que é preferência de verdade e tem formato válido entra: o banco é gravável por qualquer um da mesa.
export function limparPreferenciasRemotas(bruto) {
    const saida = {};
    if (!bruto || typeof bruto !== 'object') return saida;
    Object.keys(bruto).forEach(k => {
        const v = bruto[k];
        if (ehChaveDePreferencia(k) && typeof v === 'string' && v.length <= TAMANHO_MAX_VALOR && Object.keys(saida).length < MAX_PREFERENCIAS) saida[k] = v;
    });
    return saida;
}

// O que mudou entre a última cópia conhecida da conta e o aparelho agora: chaves novas/alteradas e chaves apagadas.
export function diferencaDePreferencias(ultimas, atuais) {
    const antes = ultimas || {};
    const agora = atuais || {};
    const mudadas = {};
    Object.keys(agora).forEach(k => { if (antes[k] !== agora[k]) mudadas[k] = agora[k]; });
    const removidas = Object.keys(antes).filter(k => !(k in agora));
    return { mudadas, removidas };
}

// Texto estável (chaves em ordem) para saber se algo mudou.
export function assinaturaDePreferencias(prefs) {
    const p = prefs || {};
    return JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]));
}

// A conta manda: grava no aparelho o que a conta tem e é diferente. Chaves que só existem aqui ficam como estão.
// Devolve quantas chaves foram alteradas.
export function aplicarPreferenciasRemotas(remoto, storage) {
    const limpas = limparPreferenciasRemotas(remoto);
    let alteradas = 0;
    try {
        const s = storage || localStorage;
        Object.keys(limpas).forEach(k => {
            if (s.getItem(k) !== limpas[k]) { s.setItem(k, limpas[k]); alteradas += 1; }
        });
    } catch (e) { /* sem localStorage */ }
    return alteradas;
}
