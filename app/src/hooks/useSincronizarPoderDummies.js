import { useEffect } from 'react';
import useStore from '../stores/useStore';
import { salvarDummie } from '../services/firebase-sync';
import { dummiesComPoderDesatualizado } from '../core/gavetaNpc';

// 🔗 Mantém o Poder dos tokens de NPC (dummies com fichaOrigem) igual ao Poder Atual da ficha do NPC.
// Só o aparelho de Mestre efetivo grava (Modo Jogador e jogadores não); espera um instante depois da última mudança
// pra não gravar a cada tecla enquanto o Mestre edita a ficha.
const ESPERA_MS = 600;

export default function useSincronizarPoderDummies() {
    const isMestre = useStore(s => s.isMestre);
    const dummies = useStore(s => s.dummies);
    const personagens = useStore(s => s.personagens);
    const divisorPoderMesa = useStore(s => s.divisorPoderMesa);

    useEffect(() => {
        if (!isMestre || !dummies || !personagens) return undefined;
        const t = setTimeout(() => {
            try {
                dummiesComPoderDesatualizado(dummies, personagens, divisorPoderMesa).forEach(({ id, dummie }) => salvarDummie(id, dummie));
            } catch (e) { /* a sincronização é uma conveniência: nunca derruba o app */ }
        }, ESPERA_MS);
        return () => clearTimeout(t);
    }, [isMestre, dummies, personagens, divisorPoderMesa]);
}
