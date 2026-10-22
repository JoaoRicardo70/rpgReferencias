// ==========================================
// 🎨 ESTILOS VISUAIS DO APP — lógica pura. O estilo escolhido vira uma classe `theme-*` no <body>; o CSS (styles.css)
// troca cores, fontes e formas a partir dela. A escolha fica em localStorage ('rpg_tema', a mesma chave do Lobby).
// ==========================================

export const TEMA_PADRAO = 'theme-cyber';
export const CHAVE_TEMA = 'rpg_tema';

export const TEMAS_APP = [
    // Estilos pedidos pela mesa: Medieval, Moderno, Futurista e a Mescla dos três mundos da campanha.
    { id: 'theme-medieval', nome: 'Medieval', emoji: '🏰', grupo: 'estilo', descricao: 'Pergaminho, ouro envelhecido, bordas de manuscrito e letras de livro antigo.' },
    { id: 'theme-moderno', nome: 'Moderno', emoji: '🏙️', grupo: 'estilo', descricao: 'Limpo e plano: azul suave, cantos arredondados, sem brilho exagerado.' },
    { id: 'theme-futurista', nome: 'Futurista', emoji: '🚀', grupo: 'estilo', descricao: 'Ciano elétrico, painéis de holograma, letras tecnológicas e linhas de varredura.' },
    { id: 'theme-mescla', nome: 'Mescla', emoji: '⚜️', grupo: 'estilo', descricao: 'Pedra e ouro medievais com brilho de tecnologia futurista por cima.' },
    // Os temas que já existiam.
    { id: 'theme-cyber', nome: 'Cyber-Neon', emoji: '🔵', grupo: 'classico', descricao: 'O visual original: neon ciano sobre fundo escuro.' },
    { id: 'theme-blood', nome: 'Sangue', emoji: '🩸', grupo: 'classico', descricao: 'Ritual escarlate, sombrio e vermelho.' },
    { id: 'theme-glass', nome: 'Aço', emoji: '⚔️', grupo: 'classico', descricao: 'Metal frio, cinza e azulado.' },
    { id: 'theme-arcane', nome: 'Arcano', emoji: '💜', grupo: 'classico', descricao: 'Roxo místico.' }
];

export function temaValido(id) {
    return TEMAS_APP.some(t => t.id === id);
}

// Tema salvo, ou o padrão se não houver/for inválido.
export function lerTemaSalvo(storage) {
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const id = s ? s.getItem(CHAVE_TEMA) : null;
        return temaValido(id) ? id : TEMA_PADRAO;
    } catch (e) { return TEMA_PADRAO; }
}

// Troca só a classe `theme-*` do <body>, preservando as outras classes que ele tenha.
export function aplicarTemaNoBody(id, body) {
    const alvo = body || (typeof document !== 'undefined' ? document.body : null);
    if (!alvo) return;
    const escolhido = temaValido(id) ? id : TEMA_PADRAO;
    Array.from(alvo.classList).filter(c => c.startsWith('theme-')).forEach(c => alvo.classList.remove(c));
    alvo.classList.add(escolhido);
}

export function salvarTema(id, storage) {
    if (!temaValido(id)) return false;
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (s) s.setItem(CHAVE_TEMA, id);
        return true;
    } catch (e) { return false; }
}
