import React, { useCallback } from 'react';
import useStore from '../../stores/useStore';
import { ofertasRecebidas, aceitarOferta, removerOferta, TIPO_PODER } from '../../core/ensinar';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';

// 🎓 Ofertas de ensinamento que outros personagens mandaram para esta ficha: aceitar copia para a ficha, recusar só descarta.
export default function EnsinamentosRecebidos({ tipo }) {
    const { ficha: minhaFicha, updateFicha, souEuMesmo } = useFichaAtiva();
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const salvar = useCallSaveAtivo();
    const ofertas = ofertasRecebidas(minhaFicha, tipo);

    const aceitar = useCallback((oferta) => {
        let criou = false;
        updateFicha((f) => { criou = !!aceitarOferta(f, oferta, Date.now()); });
        salvar();
        if (criou) adicionarAviso(`Você aprendeu "${oferta.item.nome}" com ${oferta.de}.`, 'info');
    }, [updateFicha, salvar, adicionarAviso]);

    const recusar = useCallback((oferta) => {
        updateFicha((f) => { removerOferta(f, oferta.id); });
        salvar();
    }, [updateFicha, salvar]);

    if (!souEuMesmo || ofertas.length === 0) return null;
    return (
        <div className="ensinamentos-recebidos">
            {ofertas.map(o => (
                <div key={o.id} className="ensinamento-oferta">
                    <span>🎓 <strong>{o.de}</strong> quer te ensinar <strong>{o.item.nome}</strong>{o.tipo === TIPO_PODER ? ` (Maestria inicial ${o.nivel}%)` : ` (nível ${o.nivel}%)`}</span>
                    <span className="ensinamento-botoes">
                        <button type="button" className="btn-neon btn-gold btn-small" onClick={() => aceitar(o)}>Aceitar</button>
                        <button type="button" className="btn-neon btn-small" onClick={() => recusar(o)}>Recusar</button>
                    </span>
                </div>
            ))}
        </div>
    );
}
