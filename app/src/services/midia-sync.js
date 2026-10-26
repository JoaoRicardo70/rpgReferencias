import { ref, push, set, update, remove, get, onValue, limitToLast, query } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase-config';
import useStore, { sanitizarNome } from '../stores/useStore';
import { LIMITE_MIDIA, LIMITE_STORAGE, LADO_MAX_PADRAO, MENSAGEM_IMAGEM_INVALIDA, ehImagemValida, listarMidia, tamanhoReduzido, urlDeMidiaSegura } from '../core/midia';

// ==========================================
// 🖼️ CHAT DE MÍDIA — envio e leitura. Metadados em `mesas/{mesaId}/midia/{id}` ({ autor, url, ts, nome }) e o arquivo no
// Firebase Storage em `mesas/{mesaId}/midia/...`. Imagens são reduzidas antes de subir (menos custo de armazenamento/banda).
// ==========================================

const caminhoMidia = (mesaId) => `mesas/${mesaId}/midia`;

// Reduz e recomprime a imagem no navegador. Se algo falhar (ou se já é pequena), devolve o arquivo original.
export async function reduzirImagem(arquivo, { ladoMax = LADO_MAX_PADRAO, qualidade = 0.82 } = {}) {
    try {
        if (!arquivo || arquivo.type === 'image/gif') return arquivo; // GIF: mantém (a animação se perderia)
        const bitmap = await createImageBitmap(arquivo);
        const { largura, altura } = tamanhoReduzido(bitmap.width, bitmap.height, ladoMax);
        if (!largura) return arquivo;
        const tela = document.createElement('canvas');
        tela.width = largura;
        tela.height = altura;
        tela.getContext('2d').drawImage(bitmap, 0, 0, largura, altura);
        if (bitmap.close) bitmap.close();
        const blob = await new Promise((resolve) => tela.toBlob(resolve, 'image/webp', qualidade));
        if (!blob || blob.size >= arquivo.size) return arquivo;
        return new File([blob], `${(arquivo.name || 'imagem').replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
    } catch (e) {
        return arquivo;
    }
}

// Escuta as imagens mais novas. `callback` recebe a lista em ordem cronológica. Devolve a função que cancela.
export function iniciarListenerMidia(callback, aoErro) {
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    const consulta = query(ref(db, caminhoMidia(mesaId)), limitToLast(LIMITE_MIDIA));
    return onValue(consulta, (snap) => callback(listarMidia(snap.val(), LIMITE_MIDIA, mesaId)), (erro) => { if (aoErro) aoErro(erro); });
}

// Sobe a imagem e registra no chat. Devolve { ok: true, id } ou { ok: false, erro }.
export async function enviarImagemMidia(arquivo, autor) {
    const { mesaId } = useStore.getState();
    if (!db || !storage || !mesaId) return { ok: false, erro: { motivo: 'Sem conexão com a mesa.' } };
    if (!ehImagemValida(arquivo)) return { ok: false, erro: { motivo: MENSAGEM_IMAGEM_INVALIDA } };
    try {
        const pronta = await reduzirImagem(arquivo);
        // O Storage recusa 5 MB ou mais: melhor avisar antes de gastar o envio.
        if (pronta.size >= LIMITE_STORAGE) return { ok: false, erro: { motivo: MENSAGEM_IMAGEM_INVALIDA } };
        const ext = ({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' })[pronta.type] || 'img';
        const nomeUnico = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
        const destino = storageRef(storage, `${caminhoMidia(mesaId)}/${nomeUnico}`);
        await uploadBytes(destino, pronta);
        const url = await getDownloadURL(destino);
        const nova = push(ref(db, caminhoMidia(mesaId)));
        await set(nova, { autor: String(autor || '').slice(0, 50), url, ts: Date.now(), nome: String(arquivo.name || '').slice(0, 60) });
        return { ok: true, id: nova.key };
    } catch (erro) {
        return { ok: false, erro };
    }
}

// Só apaga arquivo da pasta de mídia desta mesa (a URL vem do banco e qualquer usuário escreve lá).
async function apagarArquivo(url, mesaId) {
    if (!urlDeMidiaSegura(url, mesaId)) return;
    try { await deleteObject(storageRef(storage, url)); } catch (e) { /* já apagado ou fora do alcance: segue */ }
}

// Apaga uma imagem do chat (e o arquivo, a não ser que ela já virou avatar de um NPC).
export async function apagarImagemMidia(entrada) {
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !entrada || !entrada.id) return false;
    try {
        await remove(ref(db, `${caminhoMidia(mesaId)}/${entrada.id}`));
        if (!entrada.usadaEmFicha && entrada.url) await apagarArquivo(entrada.url, mesaId);
        return true;
    } catch (e) {
        return false;
    }
}

// Mestre: esvazia o chat de mídia inteiro (e libera o espaço no Storage). Imagens usadas como avatar de NPC mantêm o arquivo.
export async function limparMidia() {
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return { ok: false, apagadas: 0 };
    try {
        const snap = await get(ref(db, caminhoMidia(mesaId)));
        const todas = snap.exists() ? Object.values(snap.val() || {}) : [];
        const dosArquivos = todas.filter(e => e && e.url && !e.usadaEmFicha);
        // Primeiro o banco (se as regras recusarem, nada fica pela metade); depois os arquivos, pra liberar o espaço.
        await remove(ref(db, caminhoMidia(mesaId)));
        await Promise.all(dosArquivos.map(e => apagarArquivo(e.url, mesaId)));
        return { ok: true, apagadas: dosArquivos.length, mantidas: todas.length - dosArquivos.length };
    } catch (e) {
        return { ok: false, apagadas: 0 };
    }
}

export async function marcarImagemUsada(id) {
    const { mesaId } = useStore.getState();
    if (!db || !mesaId || !id) return false;
    try { await update(ref(db, `${caminhoMidia(mesaId)}/${id}`), { usadaEmFicha: true }); return true; } catch (e) { return false; }
}

// Grava uma ficha nova de personagem/NPC na mesa. Devolve true/false.
// Nunca sobrescreve: se já existe um personagem com essa chave, não grava.
export async function personagemExiste(nome) {
    const { mesaId } = useStore.getState();
    const chave = sanitizarNome(nome);
    if (!db || !mesaId || !chave) return false;
    try { return (await get(ref(db, `mesas/${mesaId}/personagens/${chave}`))).exists(); } catch (e) { return false; }
}

export async function criarPersonagemNaMesa(nome, ficha) {
    const { mesaId } = useStore.getState();
    const chave = sanitizarNome(nome);
    if (!db || !mesaId || !chave || !ficha) return false;
    try {
        if (await personagemExiste(nome)) return false;
        await set(ref(db, `mesas/${mesaId}/personagens/${chave}`), ficha);
        return true;
    } catch (e) { return false; }
}
