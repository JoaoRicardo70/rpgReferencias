import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizarNome } from '../stores/useStore';
import {
    CHAT_PARTY_ID, LIMITE_MENSAGENS_CARREGADAS, chatPartyPadrao, chatsDoIndice, contarNaoLidas,
    montarChatGrupo, montarChatPrivado, ordenarChats
} from '../core/chats';
import {
    criarChatRemoto, enviarMensagemChat, iniciarListenerLidos, iniciarListenerMensagensChat,
    iniciarListenerMeusChats, marcarChatComoLido, sairDoChatRemoto
} from '../services/chat-sync';

// Estado global dos chats da mesa: party (todos), conversas privadas e grupos.
// "eu" é o nome sanitizado: é a identidade usada em caminhos do Firebase e como autor.
export function useChats(mesaId, meuNome) {
    const eu = sanitizarNome(meuNome);
    const [indice, setIndice] = useState({});
    const [mensagens, setMensagens] = useState({});
    const [lidosRemoto, setLidosRemoto] = useState({});
    const [lidosLocal, setLidosLocal] = useState({});
    const [lidosCarregados, setLidosCarregados] = useState(false);
    const ouvintesRef = useRef({});
    const mensagensRef = useRef({});
    mensagensRef.current = mensagens;

    const meusChats = useMemo(() => chatsDoIndice(indice), [indice]);
    const idsDosChats = useMemo(() => [CHAT_PARTY_ID, ...meusChats.map(c => c.id)], [meusChats]);
    const chaveIds = idsDosChats.join('|');

    useEffect(() => {
        setIndice({}); setMensagens({}); setLidosRemoto({}); setLidosLocal({}); setLidosCarregados(false);
        if (!mesaId || !eu) return;
        const u1 = iniciarListenerMeusChats(mesaId, eu, setIndice);
        const u2 = iniciarListenerLidos(mesaId, eu, (v) => { setLidosRemoto(v); setLidosCarregados(true); });
        return () => { u1(); u2(); };
    }, [mesaId, eu]);

    // Um ouvinte de mensagens por conversa; conversas que saem do índice são desligadas.
    useEffect(() => {
        if (!mesaId || !eu) return;
        const ouvintes = ouvintesRef.current;
        const ids = chaveIds.split('|');
        ids.forEach(id => {
            if (ouvintes[id]) return;
            ouvintes[id] = iniciarListenerMensagensChat(mesaId, id, (msg) => {
                setMensagens(prev => {
                    const atuais = prev[id] || [];
                    if (atuais.some(m => m.id === msg.id)) return prev;
                    const lista = [...atuais, msg].sort((a, b) => a.ts - b.ts).slice(-LIMITE_MENSAGENS_CARREGADAS);
                    return { ...prev, [id]: lista };
                });
            });
        });
        Object.keys(ouvintes).forEach(id => {
            if (!ids.includes(id)) {
                ouvintes[id]();
                delete ouvintes[id];
                setMensagens(prev => { const { [id]: _removida, ...resto } = prev; return resto; });
            }
        });
    }, [mesaId, eu, chaveIds]);

    useEffect(() => () => {
        Object.values(ouvintesRef.current).forEach(u => u());
        ouvintesRef.current = {};
    }, [mesaId, eu]);

    const chats = useMemo(() => {
        const ultima = {};
        Object.entries(mensagens).forEach(([id, lista]) => { if (lista.length) ultima[id] = lista[lista.length - 1].ts; });
        return ordenarChats([chatPartyPadrao(), ...meusChats], ultima);
    }, [meusChats, mensagens]);

    // Só conta depois que o marcador de leitura chegou, senão o histórico inteiro pisca como "novo".
    const naoLidas = useMemo(() => {
        const r = {};
        idsDosChats.forEach(id => {
            const marco = Math.max(Number(lidosRemoto[id]) || 0, Number(lidosLocal[id]) || 0);
            r[id] = lidosCarregados ? contarNaoLidas(mensagens[id], marco, eu) : 0;
        });
        return r;
    }, [idsDosChats, mensagens, lidosRemoto, lidosLocal, lidosCarregados, eu]);

    const totalNaoLidas = useMemo(() => Object.values(naoLidas).reduce((a, b) => a + b, 0), [naoLidas]);

    // O marcador é o ts da última mensagem vista (mesmo relógio das mensagens), nunca o relógio local.
    const marcarLido = useCallback((chatId) => {
        const lista = mensagensRef.current[chatId] || [];
        const ts = lista.length ? lista[lista.length - 1].ts : 0;
        if (!ts) return;
        setLidosLocal(prev => (prev[chatId] >= ts ? prev : { ...prev, [chatId]: ts }));
        marcarChatComoLido(mesaId, eu, chatId, ts);
    }, [mesaId, eu]);

    const enviar = useCallback((chatId, texto) => enviarMensagemChat(mesaId, chatId, eu, texto), [mesaId, eu]);

    const abrirPrivado = useCallback(async (outro) => {
        const chat = montarChatPrivado(eu, outro);
        if (!chat) return null;
        const ok = await criarChatRemoto(mesaId, chat);
        return ok ? chat.id : null;
    }, [mesaId, eu]);

    const criarGrupo = useCallback(async (nome, membros) => {
        const chat = montarChatGrupo(eu, nome, membros);
        if (!chat) return null;
        const ok = await criarChatRemoto(mesaId, chat);
        return ok ? chat.id : null;
    }, [mesaId, eu]);

    const sair = useCallback((chatId) => sairDoChatRemoto(mesaId, eu, chatId), [mesaId, eu]);

    return { eu, chats, mensagens, naoLidas, totalNaoLidas, marcarLido, enviar, abrirPrivado, criarGrupo, sair };
}
