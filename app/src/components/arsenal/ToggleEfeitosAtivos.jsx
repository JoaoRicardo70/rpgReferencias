import React, { useCallback } from 'react';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { efeitosAtivosLigados } from '../../core/efeitosItem';

// ⚡ Liga/desliga os Efeitos ATIVOS do item. Os passivos valem sempre que o item está equipado.
// Grava item.efeitosAtivos na ficha em foco (undefined/true = ligado, false = desligado).
export default function ToggleEfeitosAtivos({ itemId }) {
    const { ficha, updateFicha } = useFichaAtiva();
    const callSave = useCallSaveAtivo();

    const item = ((ficha && ficha.inventario) || []).find(i => i && String(i.id) === String(itemId));
    const ligado = efeitosAtivosLigados(item);

    const alternar = useCallback(() => {
        updateFicha((f) => {
            const alvo = (f.inventario || []).find(i => i && String(i.id) === String(itemId));
            if (!alvo) return;
            alvo.efeitosAtivos = alvo.efeitosAtivos === false;
        });
        callSave();
    }, [updateFicha, callSave, itemId]);

    if (!item || !Array.isArray(item.efeitos) || item.efeitos.length === 0) return null;

    return (
        <button
            type="button"
            className={`btn-neon ${ligado ? 'btn-green' : 'btn-red'}`}
            aria-pressed={ligado}
            title="Efeitos ativos só valem com o toggle ligado. Efeitos passivos valem sempre que o item está equipado."
            style={{ marginTop: 8, padding: '5px 12px', fontSize: '0.9em' }}
            onClick={alternar}
        >
            ⚡ Efeitos ativos: {ligado ? 'LIGADOS' : 'DESLIGADOS'}
        </button>
    );
}
