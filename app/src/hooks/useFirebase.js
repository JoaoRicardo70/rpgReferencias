import { useState, useEffect } from 'react';
import useStore from '../stores/useStore';
import { entradaVisivel } from '../core/dadosMestre';
import { db } from '../services/firebase-config';
import { iniciarListenerFichaPropria, iniciarListenerPersonagens, iniciarListenerFeed, salvarFirebaseImediato, resetSincronizacaoFicha, mesclarPersonagensRemotos } from '../services/firebase-sync';

export default function useFirebase() {
    const [loading, setLoading] = useState(true);
    const meuNome = useStore((s) => s.meuNome);
    const mesaId = useStore((s) => s.mesaId);
    const carregarDadosFicha = useStore((s) => s.carregarDadosFicha);
    const setPersonagens = useStore((s) => s.setPersonagens);
    const addFeedEntry = useStore((s) => s.addFeedEntry);
    const atualizarFeedEntry = useStore((s) => s.atualizarFeedEntry);
    const limparFeedStore = useStore((s) => s.limparFeedStore);
    const ehMestreAgora = useStore((s) => s.isMestre);

    useEffect(() => {
        let unsubFichaPropria = () => {};
        let unsubPersonagens = () => {};
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

        return () => {
            cancelled = true;
            unsubFichaPropria();
            unsubPersonagens();
        };
    }, [meuNome, mesaId, carregarDadosFicha, setPersonagens]);

    // O listener do feed reenvia as últimas 50 entradas ao (re)conectar: limpa antes, senão trocar de personagem duplicava
    // o feed inteiro na tela. Rolagens privadas do Mestre nunca entram no feed de quem não é Mestre (nem animam o dado dele);
    // quando o Mestre revela uma, o Firebase avisa que a entrada mudou e ela passa a valer pra todos. Entrar ou sair do Modo
    // Jogador refaz a assinatura, então nada privado fica no store de quem deixou de ser Mestre.
    useEffect(() => {
        if (!mesaId) return undefined;
        let cancelado = false;
        limparFeedStore();
        const unsubFeed = iniciarListenerFeed(
            (entry) => { if (!cancelado && entradaVisivel(entry, ehMestreAgora)) addFeedEntry(entry); },
            (entry) => { if (!cancelado && entradaVisivel(entry, ehMestreAgora)) atualizarFeedEntry(entry); }
        );
        return () => { cancelado = true; unsubFeed(); };
    }, [meuNome, mesaId, ehMestreAgora, addFeedEntry, atualizarFeedEntry, limparFeedStore]);

    return { loading };
}