// ==========================================
// 🧭 MODOS DE NAVEGAÇÃO — lógica pura. O jogador escolhe (Perfil > Aparência) como quer se mover pelo app:
//   barra  — faixa de abas no topo (o jeito clássico);
//   orbe   — tela limpa + um botão-orbe arrastável que abre um menu em círculo;
//   mesa   — o Mapa é a "mesa" fixa e as demais áreas abrem como painel lateral ao lado dele (dá pra ver Mapa + Ficha juntos);
//   hub    — uma tela "Mesa" com cartões por modo (Ficha, Combate, Mapa, Social, Lore) e um Combate com tudo numa tela só.
// A escolha fica em localStorage ('rpg_navegacao'), só neste aparelho.
// ==========================================

export const CHAVE_NAVEGACAO = 'rpg_navegacao';
export const MODO_NAVEGACAO_PADRAO = 'orbe';
export const ABA_HUB = 'aba-hub';
export const ABA_COMBATE = 'aba-combate';

export const MODOS_NAVEGACAO = [
    { id: 'orbe', nome: 'Orbe radial', emoji: '🔮', descricao: 'Tela limpa. Um botão-orbe arrastável abre um menu em círculo com todas as áreas.' },
    { id: 'mesa', nome: 'Mesa com painéis', emoji: '🗺️', descricao: 'O Mapa fica sempre ao fundo e as outras áreas abrem como painel ao lado: veja Mapa e Ficha juntos.' },
    { id: 'hub', nome: 'Hub por modos', emoji: '🏠', descricao: 'Uma tela inicial com cartões (Ficha, Combate, Mapa, Social, Lore) e um Combate com tudo lado a lado.' },
    { id: 'barra', nome: 'Barra no topo', emoji: '➖', descricao: 'A faixa de abas no topo da tela, o jeito clássico.' }
];

export function modoNavegacaoValido(id) {
    return MODOS_NAVEGACAO.some(m => m.id === id);
}

export function lerModoNavegacao(storage) {
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const id = s ? s.getItem(CHAVE_NAVEGACAO) : null;
        return modoNavegacaoValido(id) ? id : MODO_NAVEGACAO_PADRAO;
    } catch (e) { return MODO_NAVEGACAO_PADRAO; }
}

export function salvarModoNavegacao(id, storage) {
    if (!modoNavegacaoValido(id)) return false;
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (s) s.setItem(CHAVE_NAVEGACAO, id);
        return true;
    } catch (e) { return false; }
}

// Larguras do painel lateral do modo Mesa.
export const LARGURAS_GAVETA = [
    { id: 'estreita', rotulo: 'Estreita', css: '380px' },
    { id: 'media', rotulo: 'Média', css: '52vw' },
    { id: 'larga', rotulo: 'Larga', css: '66vw' }
];
export const CHAVE_LARGURA_GAVETA = 'rpg_mesa_gaveta';

export function lerLarguraGaveta(storage) {
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const id = s ? s.getItem(CHAVE_LARGURA_GAVETA) : null;
        return LARGURAS_GAVETA.some(l => l.id === id) ? id : 'media';
    } catch (e) { return 'media'; }
}

export function proximaLarguraGaveta(atual) {
    const i = LARGURAS_GAVETA.findIndex(l => l.id === atual);
    return LARGURAS_GAVETA[(i + 1) % LARGURAS_GAVETA.length].id;
}

export function cssLarguraGaveta(id) {
    return (LARGURAS_GAVETA.find(l => l.id === id) || LARGURAS_GAVETA[1]).css;
}

// ----- Hub: os "modos" agrupam as abas -----
export const MODOS_HUB = [
    { id: 'ficha', nome: 'Ficha', icone: '📝', cor: 'diarios', descricao: 'Ficha Definitiva e Grimório', abas: ['aba-Ficha Def', 'aba-grimorio'] },
    { id: 'combate', nome: 'Combate', icone: '⚔️', cor: 'combate', descricao: 'Acerto, Ataque, Defesa e Testes numa tela só', abas: [ABA_COMBATE] },
    { id: 'mapa', nome: 'Mapa', icone: '🗺️', cor: 'mundo', descricao: 'A mesa de jogo', abas: ['aba-mapa'] },
    { id: 'social', nome: 'Social', icone: '💬', cor: 'mundo', descricao: 'Comunicação e Feed', abas: ['aba-comunicacao', 'aba-log'] },
    { id: 'lore', nome: 'Lore', icone: '📚', cor: 'mundo', descricao: 'Lore do Mundo e Oráculo', abas: ['aba-compendio', 'aba-oraculo'] },
    { id: 'perfil', nome: 'Perfil', icone: '🆔', cor: 'entidade', descricao: 'Personagem e Configurações (volume, atalhos, estilo)', abas: ['aba-perfil', 'aba-config'] }
];

export function modoHubDaAba(abaId) {
    return MODOS_HUB.find(m => m.abas.includes(abaId)) || null;
}
