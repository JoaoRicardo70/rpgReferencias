// ==========================================
// SEXTA-FEIRA — leituras/escritas no Realtime Database. Tudo que é novo fica dentro de
// mesas/{mesaId}/sextaFeira (o nó liberado nas regras do banco):
//   transcricoes/{push}   falas captadas pelo HUD do Mapa ({ timestamp, autor, texto, tipo })
//   memoria/{push}        fatos que o Mestre mandou lembrar ({ texto, soMestre, autor, em })
//   chats/{nome}          conversa de cada jogador com ela ({ mensagens, atualizadoEm })
//   sessoes/ultimoResumoEm  quando a última sessão foi resumida (ms)
// O feed de combate continua onde sempre esteve (mesas/{mesaId}/feed_combate), só lido aqui.
// ==========================================
import { ref, get, set, push, remove, query, orderByKey, startAt, limitToLast } from 'firebase/database';
import { db } from './firebase-config';
import { sanitizarNome } from '../stores/useStore';
import { chaveFirebaseDoInstante } from '../core/sextaFeiraSessao';

export const LIMITE_EVENTOS_SESSAO = 1500;
export const LIMITE_MENSAGENS_CHAT_SALVAS = 60;
// Folga no início da busca por tempo: a chave de push usa o relógio do aparelho que gravou.
const FOLGA_RELOGIO_MS = 60000;

const base = (mesaId) => `mesas/${mesaId}/sextaFeira`;

async function lerDesde(caminho, desdeMs, limite) {
    const consulta = query(ref(db, caminho), orderByKey(), startAt(chaveFirebaseDoInstante(desdeMs - FOLGA_RELOGIO_MS)), limitToLast(limite));
    const snap = await get(consulta);
    const itens = [];
    if (snap.exists()) snap.forEach((filho) => { itens.push({ chave: filho.key, valor: filho.val() }); });
    return itens;
}

export async function carregarEventosFeedDesde(mesaId, desdeMs) {
    if (!db || !mesaId) return [];
    const itens = await lerDesde(`mesas/${mesaId}/feed_combate`, desdeMs, LIMITE_EVENTOS_SESSAO);
    return itens.map(i => ({ chave: i.chave, evento: i.valor }));
}

// Falas desde `desdeMs`. Também lê o nó antigo (sexta_feira_transcricao), se as regras deixarem
// (só a falha do nó antigo é ignorada; a do nó novo aparece como erro).
export async function carregarTranscricoesDesde(mesaId, desdeMs) {
    if (!db || !mesaId) return [];
    const [novas, antigas] = await Promise.all([
        lerDesde(`${base(mesaId)}/transcricoes`, desdeMs, LIMITE_EVENTOS_SESSAO),
        lerDesde(`mesas/${mesaId}/sexta_feira_transcricao`, desdeMs, LIMITE_EVENTOS_SESSAO).catch(() => []),
    ]);
    return [...novas, ...antigas].map(i => i.valor).filter(t => t && Number(t.timestamp) >= desdeMs);
}

export function registrarTranscricao(mesaId, fala) {
    if (!db || !mesaId || !fala?.texto) return Promise.resolve();
    return push(ref(db, `${base(mesaId)}/transcricoes`), {
        timestamp: Date.now(),
        autor: String(fala.autor || '?').substring(0, 60),
        texto: String(fala.texto).substring(0, 1000),
        tipo: fala.tipo || 'narrador',
    });
}

export function memorizarFato(mesaId, { texto, soMestre, autor }) {
    if (!db || !mesaId || !texto) return Promise.resolve();
    return push(ref(db, `${base(mesaId)}/memoria`), {
        texto: String(texto).trim().substring(0, 500),
        soMestre: !!soMestre,
        autor: String(autor || '').substring(0, 60),
        em: Date.now(),
    });
}

export function apagarFato(mesaId, id) {
    if (!db || !mesaId || !id) return Promise.resolve();
    return remove(ref(db, `${base(mesaId)}/memoria/${id}`));
}

export async function lerUltimoResumoEm(mesaId) {
    if (!db || !mesaId) return null;
    const snap = await get(ref(db, `${base(mesaId)}/sessoes/ultimoResumoEm`));
    const v = Number(snap.val());
    return Number.isFinite(v) && v > 0 ? v : null;
}

export function gravarUltimoResumoEm(mesaId, ms) {
    if (!db || !mesaId) return Promise.resolve();
    return set(ref(db, `${base(mesaId)}/sessoes/ultimoResumoEm`), ms);
}

const caminhoChat = (mesaId, nome) => `${base(mesaId)}/chats/${sanitizarNome(nome)}`;

// Conversa salva do jogador: array de mensagens, ou null se ainda não houver.
export async function carregarChat(mesaId, nome) {
    if (!db || !mesaId || !sanitizarNome(nome)) return null;
    const snap = await get(ref(db, caminhoChat(mesaId, nome)));
    const val = snap.val();
    if (!val || !val.mensagens) return null;
    const lista = Array.isArray(val.mensagens) ? val.mensagens : Object.values(val.mensagens);
    return lista.filter(m => m && typeof m.texto === 'string' && m.role);
}

export function salvarChat(mesaId, nome, mensagens) {
    if (!db || !mesaId || !sanitizarNome(nome)) return Promise.resolve();
    const recorte = (mensagens || []).slice(-LIMITE_MENSAGENS_CHAT_SALVAS);
    if (recorte.length === 0) return remove(ref(db, caminhoChat(mesaId, nome)));
    // JSON.parse(JSON.stringify()) descarta campos undefined, que o banco recusa.
    return set(ref(db, caminhoChat(mesaId, nome)), { mensagens: JSON.parse(JSON.stringify(recorte)), atualizadoEm: Date.now() });
}
