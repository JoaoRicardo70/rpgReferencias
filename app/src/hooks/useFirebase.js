import { useState, useEffect } from 'react';
import useStore from '../stores/useStore';
import { db } from '../services/firebase-config';
import { iniciarListenerFichaPropria, iniciarListenerPersonagens, iniciarListenerFeed, salvarFirebaseImediato, resetSincronizacaoFicha, mesclarPersonagensRemotos } from '../services/firebase-sync';

export default function useFirebase() {
    const [loading, setLoading] = useState(true);
    const meuNome = useStore((s) => s.meuNome);
    const mesaId = useStore((s) => s.mesaId);
    const carregarDadosFicha = useStore((s) => s.carregarDadosFicha);
    const setPersonagens = useStore((s) => s.setPersonagens);
    const addFeedEntry = useStore((s) => s.addFeedEntry);

    useEffect(() => {
        let unsubFichaPropria = () => {};
        let unsubPersonagens = () => {};
        let unsubFeed = () => {};
        let cancelled = false;

        resetSincronizacaoFicha();

        if (!mesaId) {
            setLoading(false);
            return () => { cancelled = true; };
        }

        if (meuNome && db) {
            // 🔥 ESCUTA ATIVA: substitui o antigo get() único por um onValue, para
            // que a própria ficha atualize sozinha (Mestre editando pelo Painel,
            // outra aba/dispositivo do mesmo jogador, etc.) sem precisar de F5.
            unsubFichaPropria = iniciarListenerFichaPropria(meuNome, (dados, primeiraCarga) => {
                if (cancelled || !primeiraCarga) return;
                if (dados) {
                    carregarDadosFicha(dados);
                    // 🔥 Persiste imediatamente a migração de ficha.passivas -> ficha.poderes
                    // (ver migrarPassivasParaPoderes), para não repeti-la a cada recarregamento.
                    if (Array.isArray(dados.passivas) && dados.passivas.length > 0) {
                        salvarFirebaseImediato().catch(() => {});
                    }
                }
                setLoading(false);
            });
        } else {
            setLoading(false);
        }

        unsubPersonagens = iniciarListenerPersonagens((personagens) => {
            if (cancelled) return;
            // 🔥 GRIMÓRIO DA ENTIDADE: se o Mestre está editando alguma entidade alheia ao vivo
            // (FichaAlvoContext.jsx), mescla o snapshot remoto com o merge 3 vias em vez de
            // sobrescrever -- senão uma digitação dele "voltava" sempre que QUALQUER personagem
            // da mesa mudasse algo (é esta árvore inteira que dispara este listener). Sem
            // ninguém editando por este caminho, mesclarPersonagensRemotos devolve o snapshot
            // como está, idêntico ao comportamento de sempre.
            setPersonagens(mesclarPersonagensRemotos(useStore.getState().personagens, personagens));
        });

        unsubFeed = iniciarListenerFeed((entry) => {
            if (!cancelled) addFeedEntry(entry);
        });

        return () => {
            cancelled = true;
            unsubFichaPropria();
            unsubPersonagens();
            unsubFeed();
        };
    }, [meuNome, mesaId, carregarDadosFicha, setPersonagens, addFeedEntry]);

    return { loading };
}