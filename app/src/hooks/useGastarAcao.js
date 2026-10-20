import { useCallback } from 'react';
import { useFichaAtiva, useCallSaveAtivo } from '../components/Ficha Def/FichaAlvoContext';
import useStore from '../stores/useStore';
import { tiposRastreadosDe, acoesEmFalta, gastarAcoes, avisosDoGasto } from '../core/acoesTecnica';

// ⏱️ Cobra a Ação (Ação / Ação Bônus / Reação) de uma ou mais técnicas na ficha ativa (a do jogador, ou a do NPC que
// o Mestre está conduzindo). Devolve `true` se pode seguir: sem Ação controlada, com a Ação disponível, ou se a pessoa
// confirmou usar mesmo sem ela (core/acoesTecnica.js). `false` = cancelou, nada foi gasto.
export default function useGastarAcao() {
    const { ficha, updateFicha } = useFichaAtiva();
    const salvar = useCallSaveAtivo();

    return useCallback((tecnicas) => {
        const lista = Array.isArray(tecnicas) ? tecnicas : [tecnicas];
        const tipos = tiposRastreadosDe(lista);
        if (tipos.length === 0) return true;
        const faltando = acoesEmFalta(ficha, tipos);
        if (faltando.length > 0 && !window.confirm(`Sem ${faltando.join(' e ')} disponível. Usar mesmo assim?`)) return false;
        avisosDoGasto(ficha, tipos).forEach(a => useStore.getState().adicionarAviso?.(a.texto, a.tipo));
        updateFicha(f => gastarAcoes(f, tipos));
        salvar();
        return true;
    }, [ficha, updateFicha, salvar]);
}
