// ==========================================
// SEXTA-FEIRA — leituras/escritas no Realtime Database. Tudo que é novo fica dentro de
// mesas/{mesaId}/sextaFeira (o nó liberado nas regras do banco):
//   transcricoes/{push}   falas captadas pelo HUD do Mapa ({ timestamp, autor, texto, tipo })
//   memoria/{push}        fatos que o Mestre mandou lembrar ({ texto, soMestre, autor, em })
//   chats/{nome}          conversa de cada jogador com ela ({ mensagens, atualizadoEm })
//   sessoes/ultimoResumoEm  quando a última sessão foi resumida (ms)
// O feed de combate continua onde sempre esteve (mesas/{mesaId}/feed_combate), só lido aqui.
// ==========================================
import { ref, get, set, push, remove, query, orderByKey, startAt, limitToLast, runTransaction } from 'firebase/database';
import { db } from './firebase-config';
import { sanitizarNome } from '../stores/useStore';
import { chaveFirebaseDoInstante } from '../core/sextaFeiraSessao';
import { anexarNaLista } from '../core/sextaFeiraCriacao';

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

// ---------- 🕘 Versões dos arcos e ♻️ Lixeira dos Registros ----------
//   versoes/{chaveArco}/{push}  { texto, titulo, autor, motivo, em }   (últimas LIMITE_VERSOES_ARCO)
//   lixeira/{push}              { tipo: 'capitulo'|'arco', foco, capituloId, dados, autor, em }
export const LIMITE_VERSOES_ARCO = 20;
export const LIMITE_LIXEIRA = 30;

export function chaveVersaoArco(foco, capituloId, arcoId) {
    return sanitizarNome(`${foco}_${capituloId}_${arcoId}`);
}

async function podarMaisAntigos(caminho, limite) {
    const snap = await get(query(ref(db, caminho), orderByKey()));
    if (!snap.exists()) return;
    const chaves = [];
    snap.forEach((filho) => { chaves.push(filho.key); });
    const excesso = chaves.length - limite;
    if (excesso > 0) await Promise.all(chaves.slice(0, excesso).map(k => remove(ref(db, `${caminho}/${k}`))));
}

export async function salvarVersaoArco(mesaId, chaveArco, { texto, titulo, autor, motivo }) {
    if (!db || !mesaId || !chaveArco || typeof texto !== 'string') return;
    const caminho = `${base(mesaId)}/versoes/${chaveArco}`;
    await push(ref(db, caminho), {
        texto, titulo: String(titulo || ''), autor: String(autor || '').substring(0, 60), motivo: String(motivo || ''), em: Date.now(),
    });
    await podarMaisAntigos(caminho, LIMITE_VERSOES_ARCO);
}

// Versões do arco, da mais nova pra mais antiga.
export async function listarVersoesArco(mesaId, chaveArco) {
    if (!db || !mesaId || !chaveArco) return [];
    const snap = await get(ref(db, `${base(mesaId)}/versoes/${chaveArco}`));
    const itens = [];
    if (snap.exists()) snap.forEach((filho) => { itens.push({ id: filho.key, ...filho.val() }); });
    return itens.filter(v => typeof v.texto === 'string').sort((a, b) => (Number(b.em) || 0) - (Number(a.em) || 0));
}

export async function guardarNaLixeira(mesaId, { tipo, foco, capituloId, dados, autor }) {
    if (!db || !mesaId || !dados) return;
    const caminho = `${base(mesaId)}/lixeira`;
    await push(ref(db, caminho), {
        tipo, foco, capituloId: capituloId ?? null, dados: JSON.parse(JSON.stringify(dados)),
        autor: String(autor || '').substring(0, 60), em: Date.now(),
    });
    await podarMaisAntigos(caminho, LIMITE_LIXEIRA);
}

export async function listarLixeira(mesaId) {
    if (!db || !mesaId) return [];
    const snap = await get(ref(db, `${base(mesaId)}/lixeira`));
    const itens = [];
    if (snap.exists()) snap.forEach((filho) => { itens.push({ id: filho.key, ...filho.val() }); });
    return itens.filter(i => i && i.dados).sort((a, b) => (Number(b.em) || 0) - (Number(a.em) || 0));
}

export function removerDaLixeira(mesaId, id) {
    if (!db || !mesaId || !id) return Promise.resolve();
    return remove(ref(db, `${base(mesaId)}/lixeira/${id}`));
}

// ---------- 🛠️ Criações pela Sexta-Feira: aplicar, fila de aprovação e decisões ----------
//   pendentes/{push}  { tipo, alvo, objeto, avisos, solicitante, em }   (pedidos de jogadores)
//   decisoes/{push}   { solicitante, nomeCriacao, tipo, aprovado, motivo, em } (aviso pro jogador)
export const LIMITE_DECISOES = 50;

// Anexa um objeto a uma lista da ficha (poderes, ataquesElementais, inventario) com transação:
// não sobrescreve o que o dono da ficha acabou de gravar nem perde itens entre leituras.
export async function anexarNaFicha(mesaId, nome, campo, objeto) {
    if (!db || !mesaId || !sanitizarNome(nome) || !campo || !objeto) throw new Error('Dados insuficientes para gravar.');
    const limpo = JSON.parse(JSON.stringify(objeto));
    const resultado = await runTransaction(ref(db, `mesas/${mesaId}/personagens/${sanitizarNome(nome)}/${campo}`), (atual) => anexarNaLista(atual, limpo));
    if (!resultado?.committed) throw new Error('O banco não confirmou a gravação.');
}

export function enviarPendente(mesaId, { tipo, alvo, objeto, avisos, solicitante }) {
    if (!db || !mesaId || !objeto) return Promise.reject(new Error('Dados insuficientes para enviar.'));
    return push(ref(db, `${base(mesaId)}/pendentes`), JSON.parse(JSON.stringify({
        tipo, alvo: alvo || '', objeto, avisos: avisos || [], solicitante: String(solicitante || '').substring(0, 60), em: Date.now(),
    })));
}

export function removerPendente(mesaId, id) {
    if (!db || !mesaId || !id) return Promise.resolve();
    return remove(ref(db, `${base(mesaId)}/pendentes/${id}`));
}

export async function registrarDecisao(mesaId, { solicitante, nomeCriacao, tipo, aprovado, motivo }) {
    if (!db || !mesaId) return;
    const caminho = `${base(mesaId)}/decisoes`;
    await push(ref(db, caminho), {
        solicitante: String(solicitante || '').substring(0, 60), nomeCriacao: String(nomeCriacao || '').substring(0, 120),
        tipo: tipo || '', aprovado: !!aprovado, motivo: String(motivo || '').substring(0, 300), em: Date.now(),
    });
    await podarMaisAntigos(caminho, LIMITE_DECISOES);
}

// Tira o pedido da fila de forma atômica: só um Mestre/Co-Mestre consegue "pegar" cada pedido
// (evita aprovar duas vezes). Devolve o pedido, ou null se outro já pegou/não existe mais.
export async function reivindicarPendente(mesaId, id) {
    if (!db || !mesaId || !id) return null;
    let pedido = null;
    const resultado = await runTransaction(ref(db, `${base(mesaId)}/pendentes/${id}`), (atual) => {
        // null pode ser só "ainda não tenho no cache": devolver null deixa o servidor refazer a
        // transação com o valor real, se ele existir. Só quem viu o pedido de fato o remove.
        pedido = atual;
        return null;
    });
    return resultado?.committed && pedido ? pedido : null;
}
