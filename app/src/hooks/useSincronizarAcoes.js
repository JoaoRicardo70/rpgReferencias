import { useEffect } from 'react';
import useStore from '../stores/useStore';
import { acoesDessincronizadas, sincronizarAcoes } from '../core/acoes';
import { salvarFichaSilencioso } from '../services/firebase-sync';

// ⚡ Mantém ficha.acoes[tipo].max/atual iguais ao que core/acoes.js calcula (base 2 + efeitos +
// ajuste manual, teto 5). Quando um Poder/Forma/item passa a dar Ações (ou deixa de dar), a ficha
// gravada acompanha sozinha, e o Mapa — que lê a ficha dos outros jogadores — enxerga o mesmo número.
// `ativo` evita mexer na ficha antes de ela ser carregada do Firebase.
export default function useSincronizarAcoes(ativo) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);

    useEffect(() => {
        if (!ativo || !minhaFicha) return;
        if (!acoesDessincronizadas(minhaFicha)) return;
        updateFicha(f => sincronizarAcoes(f));
        salvarFichaSilencioso();
    }, [ativo, minhaFicha, updateFicha]);
}
