// ==========================================
// 🎲 CLASSIFICAÇÃO DA ROLAGEM (animação do dado) — lógica pura.
// Decide o "nível" do resultado para dar destaque visual: Crítico Fatal, Crítico, Falha Crítica (1) ou comum.
//   Dano  : o texto da arma diz FATAL / CRÍTICO.
//   Acerto: 20 = Crítico Fatal, 18-19 = Crítico, 1 = Falha Crítica.
// ==========================================

export const NIVEIS_ROLAGEM = {
    fatal: { nivel: 'fatal', cor: '#ff003c', corTexto: '#ff4d6d', rotulo: 'CRÍTICO FATAL!', icone: '🔥', duracaoMs: 3200 },
    critico: { nivel: 'critico', cor: '#ffcc00', corTexto: '#ffe066', rotulo: 'CRÍTICO!', icone: '⚡', duracaoMs: 2600 },
    falha: { nivel: 'falha', cor: '#6c5b7b', corTexto: '#c9b6e4', rotulo: 'FALHA CRÍTICA', icone: '💀', duracaoMs: 2800 },
    normal: { nivel: 'normal', cor: '#0088ff', corTexto: '#7cc4ff', rotulo: 'ROLADO!', icone: '🎲', duracaoMs: 1800 }
};

// Face do d20 (0 a 19) que mostra o resultado: valores de 1 a 20 caem na própria face; fora disso (dano, d100...)
// usa a face do 20 e o número real é desenhado nela.
export function indiceFaceDoDado(valor) {
    const v = Number(valor);
    return Number.isInteger(v) && v >= 1 && v <= 20 ? v - 1 : 19;
}

// Texto impresso na face: o número real (notação exponencial se for enorme), "?" se não for número.
export function textoDaFace(valor) {
    const v = Number(valor);
    if (!Number.isFinite(v)) return '?';
    return Math.abs(v) >= 1e6 ? v.toExponential(0) : String(Math.trunc(v));
}

export function classificarRolagem({ valor, tipo, armaStr } = {}) {
    if (tipo === 'dano') {
        const texto = String(armaStr || '');
        if (texto.includes('FATAL')) return NIVEIS_ROLAGEM.fatal;
        if (texto.includes('CRÍTICO')) return NIVEIS_ROLAGEM.critico;
        return NIVEIS_ROLAGEM.normal;
    }
    const v = Number(valor);
    if (v === 20) return NIVEIS_ROLAGEM.fatal;
    if (v >= 18) return NIVEIS_ROLAGEM.critico;
    if (v === 1) return NIVEIS_ROLAGEM.falha;
    return NIVEIS_ROLAGEM.normal;
}
