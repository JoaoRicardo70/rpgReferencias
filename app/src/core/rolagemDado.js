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
