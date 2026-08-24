import { useState, useEffect } from 'react';
import useStore from '../stores/useStore';
import { db } from '../services/firebase-config';
import { carregarFichaDoFirebase, iniciarListenerPersonagens, iniciarListenerFeed, salvarFirebaseImediato } from '../services/firebase-sync';

export default function useFirebase() {
    const [loading, setLoading] = useState(true);
    const meuNome = useStore((s) => s.meuNome);
    const mesaId = useStore((s) => s.mesaId);
    const carregarDadosFicha = useStore((s) => s.carregarDadosFicha);
    const setPersonagens = useStore((s) => s.setPersonagens);
    const addFeedEntry = useStore((s) => s.addFeedEntry);

    useEffect(() => {
        let unsubPersonagens = () => {};
        let unsubFeed = () => {};
        let cancelled = false;

        async function init() {
            if (!mesaId) {
                setLoading(false);
                return;
            }

            if (meuNome && db) {
                try {
                    const dados = await carregarFichaDoFirebase(meuNome);
                    if (!cancelled && dados) {
                        carregarDadosFicha(dados);
                        // 🔥 Persiste imediatamente a migração de ficha.passivas -> ficha.poderes
                        // (ver migrarPassivasParaPoderes), para não repeti-la a cada recarregamento.
                        if (Array.isArray(dados.passivas) && dados.passivas.length > 0) {
                            salvarFirebaseImediato().catch(() => {});
                        }
                    }
                } catch (err) { console.error('[useFirebase] Erro:', err); }
            }

            if (!cancelled) setLoading(false);

            unsubPersonagens = iniciarListenerPersonagens((personagens) => {
                if (!cancelled) setPersonagens(personagens);
            });

            unsubFeed = iniciarListenerFeed((entry) => {
                if (!cancelled) addFeedEntry(entry);
            });
        }

        init();

        return () => {
            cancelled = true;
            unsubPersonagens();
            unsubFeed();
        };
    }, [meuNome, mesaId, carregarDadosFicha, setPersonagens, addFeedEntry]);

    return { loading };
}