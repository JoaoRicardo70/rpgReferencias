// ==========================================
// 🧭 NAVEGAÇÃO — lógica pura. Uma lista só de destinos (abas) alimenta a barra lateral e a Paleta "Ir para..." (Ctrl+K),
// pra os dois nunca discordarem. Todas as abas ficam visíveis na barra (um clique), agrupadas por assunto.
// ==========================================

export const MAX_RECENTES_NAVEGACAO = 5;
// Total de páginas da Ficha Definitiva (a 8ª é o Combate: Testes, Acerto, Ataque e Defesa).
export const TOTAL_PAGINAS_FICHA = 8;

export const GRUPOS_NAVEGACAO = [
    {
        id: 'entidade', nome: 'Entidade',
        abas: [{ id: 'aba-perfil', icone: '🆔', nome: 'Perfil' }]
    },
    {
        id: 'diarios', nome: 'Diários',
        abas: [
            { id: 'aba-Ficha Def', icone: '📝', nome: 'Ficha Definitiva', curto: 'Ficha' },
            { id: 'aba-grimorio', icone: '📖', nome: 'O Grimório Místico', curto: 'Grimório' }
        ]
    },
    {
        id: 'combate', nome: 'Combate',
        abas: [
            { id: 'aba-combate', icone: '⚔️', nome: 'Combate (tudo junto)', curto: 'Combate' }
        ]
    },
    {
        id: 'mundo', nome: 'Multiverso',
        abas: [
            { id: 'aba-mapa', icone: '🗺️', nome: 'Mapa' },
            { id: 'aba-comunicacao', icone: '💬', nome: 'Comunicação (Chat, Voz e Mesa de Som)', curto: 'Comunicação' },
            { id: 'aba-log', icone: '📜', nome: 'Feed e Log', curto: 'Feed' },
            { id: 'aba-compendio', icone: '📚', nome: 'Lore do Mundo', curto: 'Lore' },
            { id: 'aba-oraculo', icone: '🤖', nome: 'Oráculo (IA)', curto: 'Oráculo' }
        ]
    }
];

export const ABA_MESTRE = { id: 'aba-mestre', icone: '👑', nome: 'Painel do Mestre' };
export const DESTINO_HUB = { id: 'aba-hub', icone: '🏠', nome: 'Mesa (tela inicial)', curto: 'Mesa', grupo: 'hub', grupoNome: 'Hub' };

// Abas que continuam montadas (escondidas) mesmo fora de uso: têm efeitos de fundo (Mapa: animação do dado e ações do Mestre;
// Comunicação: chamada de voz). As demais só existem enquanto estão na tela — navegar fica leve.
export const ABAS_SEMPRE_MONTADAS = ['aba-mapa', 'aba-comunicacao'];

export function abaPrecisaFicarMontada(id) {
    return ABAS_SEMPRE_MONTADAS.includes(id);
}

// Lista plana na ordem da barra, com o grupo de cada aba. O Painel do Mestre só entra pra quem é Mestre.
export function listarDestinos({ isMestre = false, modo = '' } = {}) {
    const lista = [];
    if (modo === 'hub') lista.push({ ...DESTINO_HUB });
    if (isMestre) lista.push({ ...ABA_MESTRE, grupo: 'mestre', grupoNome: 'Mestre' });
    GRUPOS_NAVEGACAO.forEach(g => g.abas.forEach(a => lista.push({ ...a, grupo: g.id, grupoNome: g.nome })));
    return lista;
}

function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

// Filtra pelo nome (sem acento, sem caixa) ou pelo grupo.
export function filtrarDestinos(destinos, busca) {
    const termo = semAcento(busca);
    if (!termo) return destinos;
    return destinos.filter(d => semAcento(d.nome).includes(termo) || semAcento(d.grupoNome).includes(termo));
}

// Recentes: o último visitado vai pro começo, sem repetir, limitado.
export function registrarVisita(recentes, id) {
    if (!id) return Array.isArray(recentes) ? recentes : [];
    const base = Array.isArray(recentes) ? recentes.filter(r => typeof r === 'string' && r !== id) : [];
    return [id, ...base].slice(0, MAX_RECENTES_NAVEGACAO);
}

// Recentes que ainda existem na lista de destinos e não são a aba atual, na ordem de uso.
export function recentesValidos(recentes, destinos, abaAtual) {
    const porId = new Map(destinos.map(d => [d.id, d]));
    return (Array.isArray(recentes) ? recentes : []).filter(id => id !== abaAtual && porId.has(id)).map(id => porId.get(id));
}

// Atalho Alt+1..9: o N-ésimo destino da lista (1-based), ou null.
export function destinoDoAtalho(destinos, numero) {
    const n = parseInt(numero, 10);
    if (!Number.isInteger(n) || n < 1 || n > 9) return null;
    return destinos[n - 1] || null;
}

// Posição (x, y em px, relativa ao centro) do item `i` de `n` num círculo de raio `raio`, começando no topo e girando no sentido horário.
export function posicaoNoCirculo(i, n, raio) {
    const total = Math.max(1, n);
    const angulo = (-Math.PI / 2) + (2 * Math.PI * i) / total;
    return { x: Math.round(raio * Math.cos(angulo)), y: Math.round(raio * Math.sin(angulo)) };
}
