import { ref, push, update, set, onValue, onChildAdded, limitToLast, query, serverTimestamp } from 'firebase/database';
import { db } from './firebase-config';
import { CHAT_PARTY_ID, LIMITE_MENSAGENS_CARREGADAS, caminhosDeCriacao, limparTextoMensagem } from '../core/chats.js';

// Estrutura no Firebase (tudo dentro de mesas/{mesaId}):
//   chatsMembros/{nome}/{chatId}   cadastro da conversa (privado/grupo) só para quem participa
//   chatsMensagens/{chatId}/{id}   { autor, texto, ts }  (a Party usa o id fixo "party")
//   chatsLidos/{nome}/{chatId}     instante da última leitura, para o contador de não lidas

// Ids de conversa e de mesa entram em caminhos do Firebase: rejeita qualquer coisa fora do padrão.
const SEGURO = /^[^.#$[\]/]+$/;
// Último erro do Firebase (ex.: permission_denied), para a interface explicar o motivo em vez de só falhar.
let ultimoErro = null;
export function ultimoErroChat() { return ultimoErro; }
function registrarErro(err, operacao) {
    ultimoErro = { codigo: (err && (err.code || err.message)) || "desconhecido", operacao };
    console.error(`[CHAT] Falha em ${operacao}:`, err);
}

const ok = (...v) => v.every(x => typeof x === 'string' && SEGURO.test(x));

export function enviarMensagemChat(mesaId, chatId, autor, texto) {
    ultimoErro = null; // evita mostrar o motivo de uma falha antiga
    const limpo = limparTextoMensagem(texto);
    if (!db || !ok(mesaId, chatId, autor) || !limpo) return Promise.resolve(false);
    return push(ref(db, `mesas/${mesaId}/chatsMensagens/${chatId}`), { autor, texto: limpo, ts: serverTimestamp() })
        .then(() => true)
        .catch((err) => { registrarErro(err, 'enviar mensagem'); return false; });
}

export function iniciarListenerMensagensChat(mesaId, chatId, callback) {
    if (!db || !ok(mesaId, chatId)) return () => {};
    const consulta = query(ref(db, `mesas/${mesaId}/chatsMensagens/${chatId}`), limitToLast(LIMITE_MENSAGENS_CARREGADAS));
    return onChildAdded(consulta, (snap) => {
        const v = snap.val();
        if (v && typeof v.texto === 'string') callback({ id: snap.key, autor: v.autor || '?', texto: v.texto, ts: Number(v.ts) || 0 });
    }, (err) => registrarErro(err, 'ler mensagens'));
}

export function iniciarListenerMeusChats(mesaId, meuNome, callback) {
    if (!db || !ok(mesaId, meuNome)) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/chatsMembros/${meuNome}`), (snap) => callback(snap.val() || {}), (err) => registrarErro(err, 'ler conversas'));
}

export function iniciarListenerLidos(mesaId, meuNome, callback) {
    if (!db || !ok(mesaId, meuNome)) return () => {};
    return onValue(ref(db, `mesas/${mesaId}/chatsLidos/${meuNome}`), (snap) => callback(snap.val() || {}), (err) => registrarErro(err, 'ler marcadores de leitura'));
}

export function marcarChatComoLido(mesaId, meuNome, chatId, ts = Date.now()) {
    if (!db || !ok(mesaId, meuNome, chatId)) return Promise.resolve(false);
    return set(ref(db, `mesas/${mesaId}/chatsLidos/${meuNome}/${chatId}`), ts).then(() => true).catch((err) => { registrarErro(err, 'marcar como lido'); return false; });
}

export function criarChatRemoto(mesaId, chat) {
    if (!db || !ok(mesaId) || !chat || chat.id === CHAT_PARTY_ID || !ok(chat.id, ...chat.membros)) return Promise.resolve(false);
    const updates = {};
    Object.entries(caminhosDeCriacao(chat)).forEach(([caminho, valor]) => { updates[`mesas/${mesaId}/${caminho}`] = valor; });
    return update(ref(db), updates).then(() => true).catch((err) => { registrarErro(err, 'criar conversa'); return false; });
}

export function sairDoChatRemoto(mesaId, meuNome, chatId) {
    if (!db || !ok(mesaId, meuNome, chatId)) return Promise.resolve(false);
    return set(ref(db, `mesas/${mesaId}/chatsMembros/${meuNome}/${chatId}`), null).then(() => true).catch(() => false);
}
