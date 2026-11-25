// 📚 Registro de Capacidades (Compêndio): liberações e pedidos em mesas/<mesa>/registro. Tudo por caminho, nunca a mesa inteira.
import { ref, set, remove, onValue } from 'firebase/database';
import { db } from './firebase-config';
import useStore from '../stores/useStore';

const caminho = (mesaId, resto = '') => `mesas/${mesaId}/registro${resto ? `/${resto}` : ''}`;

// Escuta o nó inteiro (liberacoes + pedidos). Devolve a função que cancela a escuta.
export function iniciarListenerRegistro(callback, aoErro) {
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return () => {};
    return onValue(ref(db, caminho(mesaId)), (snap) => {
        const v = snap.val() || {};
        callback({ liberacoes: v.liberacoes || {}, pedidos: v.pedidos || {} });
    }, (erro) => { if (aoErro) aoErro(erro); });
}

const gravar = async (resto, valor) => {
    const { mesaId } = useStore.getState();
    if (!db || !mesaId) return false;
    try {
        if (valor === null || valor === undefined) await remove(ref(db, caminho(mesaId, resto)));
        else await set(ref(db, caminho(mesaId, resto)), valor);
        return true;
    } catch (e) { return false; }
};

// valor = { todos: true } | { para: {...} } | null (remove a liberação).
export const definirLiberacao = (chave, valor) => gravar(`liberacoes/${chave}`, valor);
export const criarPedido = (pedido) => (pedido && pedido.id ? gravar(`pedidos/${pedido.id}`, pedido) : Promise.resolve(false));
export const removerPedido = (id) => (id ? gravar(`pedidos/${id}`, null) : Promise.resolve(false));
