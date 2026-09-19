// Lógica pura dos chats da mesa (party, privados e grupos). Sem Firebase, sem React.

export const CHAT_PARTY_ID = 'party';
export const LIMITE_TEXTO_MENSAGEM = 500;
export const LIMITE_NOME_GRUPO = 40;
export const LIMITE_MENSAGENS_CARREGADAS = 100;

// Chave segura para o Firebase (mesmas regras de sanitizarNome, sem depender da store).
function chaveSegura(nome) {
    return typeof nome === 'string' ? nome.replace(/[.#$[\]/]/g, '_').trim() : '';
}

export function limparTextoMensagem(texto) {
    if (typeof texto !== 'string') return '';
    return texto.replace(/\s+/g, ' ').trim().slice(0, LIMITE_TEXTO_MENSAGEM);
}

export function limparNomeGrupo(nome) {
    if (typeof nome !== 'string') return '';
    return nome.replace(/\s+/g, ' ').trim().slice(0, LIMITE_NOME_GRUPO);
}

// O mesmo par de pessoas sempre gera o mesmo id, independente de quem abriu a conversa.
export function idChatPrivado(a, b) {
    const [x, y] = [chaveSegura(a), chaveSegura(b)].sort((p, q) => p.localeCompare(q));
    return `dm__${x}__${y}`;
}

export function montarChatPrivado(eu, outro, agora = Date.now()) {
    const membros = [chaveSegura(eu), chaveSegura(outro)];
    if (!membros[0] || !membros[1] || membros[0] === membros[1]) return null;
    return { id: idChatPrivado(eu, outro), tipo: 'privado', nome: '', membros, criadoPor: membros[0], criadoEm: agora };
}

// Retorna null quando o grupo é inválido (sem nome ou com menos de 2 pessoas no total).
export function montarChatGrupo(eu, nome, outrosMembros, agora = Date.now(), sufixo = Math.random().toString(36).slice(2, 8)) {
    const nomeLimpo = limparNomeGrupo(nome);
    const criador = chaveSegura(eu);
    const membros = [...new Set([criador, ...(outrosMembros || []).map(chaveSegura)].filter(Boolean))];
    if (!nomeLimpo || !criador || membros.length < 2) return null;
    return { id: `grp__${agora.toString(36)}${sufixo}`, tipo: 'grupo', nome: nomeLimpo, membros, criadoPor: criador, criadoEm: agora };
}

export function chatPartyPadrao() {
    return { id: CHAT_PARTY_ID, tipo: 'party', nome: 'Party', membros: [], criadoPor: '', criadoEm: 0 };
}

export function nomeDoChat(chat, meuNome) {
    if (!chat) return '';
    if (chat.tipo === 'party') return 'Party';
    if (chat.tipo === 'privado') return (chat.membros || []).find(m => m !== chaveSegura(meuNome)) || 'Conversa';
    return chat.nome || 'Grupo';
}

export function iconeDoChat(chat) {
    if (!chat) return '💬';
    if (chat.tipo === 'party') return '🍻';
    if (chat.tipo === 'privado') return '👤';
    return '👥';
}

// Mensagens de outras pessoas posteriores ao último instante lido.
export function contarNaoLidas(mensagens, lidoEm, meuNome) {
    if (!Array.isArray(mensagens)) return 0;
    const eu = chaveSegura(meuNome);
    const marco = Number(lidoEm) || 0;
    return mensagens.filter(m => m && m.autor !== eu && (Number(m.ts) || 0) > marco).length;
}

// Party sempre primeiro; depois por atividade mais recente.
export function ordenarChats(chats, ultimaAtividade = {}) {
    return [...chats].sort((a, b) => {
        if (a.tipo === 'party') return -1;
        if (b.tipo === 'party') return 1;
        const ta = ultimaAtividade[a.id] || a.criadoEm || 0;
        const tb = ultimaAtividade[b.id] || b.criadoEm || 0;
        return tb - ta;
    });
}

// Converte o objeto salvo em chatsMembros/{eu} numa lista de chats válidos.
export function chatsDoIndice(indice) {
    if (!indice || typeof indice !== 'object') return [];
    return Object.entries(indice)
        .filter(([, v]) => v && typeof v === 'object' && ['privado', 'grupo'].includes(v.tipo))
        .map(([id, v]) => ({
            id,
            tipo: v.tipo,
            nome: typeof v.nome === 'string' ? v.nome : '',
            membros: Array.isArray(v.membros) ? v.membros : Object.values(v.membros || {}),
            criadoPor: v.criadoPor || '',
            criadoEm: Number(v.criadoEm) || 0,
        }));
}

// Caminhos (relativos a mesas/{mesaId}) gravados de uma vez ao criar uma conversa:
// cada membro recebe uma cópia do cadastro, e só lê as conversas do próprio índice.
export function caminhosDeCriacao(chat) {
    const cadastro = { tipo: chat.tipo, nome: chat.nome || '', membros: chat.membros, criadoPor: chat.criadoPor, criadoEm: chat.criadoEm };
    const updates = {};
    chat.membros.forEach(m => { updates[`chatsMembros/${m}/${chat.id}`] = cadastro; });
    return updates;
}

export function formatarHoraMensagem(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Voz: alterna a presença de um jogador na Sala da Party (mesma regra usada no Mapa).
export function alternarPresencaNaTaverna(cenario, meuNome) {
    const novo = JSON.parse(JSON.stringify(cenario || {}));
    if (!Array.isArray(novo.tavernaAtivos)) novo.tavernaAtivos = [];
    if (novo.tavernaAtivos.includes(meuNome)) novo.tavernaAtivos = novo.tavernaAtivos.filter(n => n !== meuNome);
    else novo.tavernaAtivos.push(meuNome);
    return novo;
}
