import React, { useCallback } from 'react';
import useStore from '../../stores/useStore';
import { ofertasRecebidas, aceitarOferta, motivoRecusaOferta, verificarAcessoOferta, removerOferta, TIPO_PODER } from '../../core/ensinar';
import { poderEhCopiavel, MENSAGEM_SINGULARIDADE_NAO_COPIA } from '../../core/categoriasPoder';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { confirmarExcecaoRaca } from './ConfirmarExcecaoRaca';

// 🎓 Ofertas de ensinamento que outros personagens mandaram para esta ficha: aceitar copia para a ficha, recusar só descarta.
export default function EnsinamentosRecebidos({ tipo }) {
    const { ficha: minhaFicha, updateFicha, souEuMesmo } = useFichaAtiva();
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const isMestre = useStore(s => s.isMestre);
    const cenario = useStore(s => s.cenario);
    const personagens = useStore(s => s.personagens);
    const salvar = useCallSaveAtivo();
    const ofertas = ofertasRecebidas(minhaFicha, tipo);

    const aceitar = useCallback(async (oferta) => {
        let criou = false;
        const bloqueio = motivoRecusaOferta(minhaFicha, oferta);
        if (bloqueio) { adicionarAviso(bloqueio, 'alerta'); return; }
        if (oferta.tipo === TIPO_PODER && !poderEhCopiavel(oferta.item)) adicionarAviso(MENSAGEM_SINGULARIDADE_NAO_COPIA, 'alerta');
        // Habilidade de Raça (core/racas.js): jogador sem acesso é bloqueado; o Mestre pode conceder como exceção, depois de confirmar.
        // A lista de Raças com acesso vem da ficha REAL de quem ofertou (a da oferta não é confiável: qualquer jogador escreve ofertas).
        const fichaRemetente = (personagens || {})[oferta.de] || (personagens || {})[String(oferta.de || '').replace(/[.#$\[\]\/]/g, '_').trim()] || null;
        const acesso = verificarAcessoOferta(minhaFicha, oferta, { cenario, isMestre, fichaRemetente });
        let excecaoConfirmada = false;
        if (!acesso.permitido) {
            if (!acesso.precisaConfirmarExcecao) { adicionarAviso(acesso.mensagem, 'alerta'); return; }
            if (!(await confirmarExcecaoRaca({ mensagem: acesso.mensagem, nomePoder: oferta.item && oferta.item.nome }))) return;
            excecaoConfirmada = true;
        }
        updateFicha((f) => { criou = !!aceitarOferta(f, oferta, Date.now(), { cenario, isMestre, excecaoConfirmada, fichaRemetente }); });
        salvar();
        if (criou) adicionarAviso(`Você aprendeu "${oferta.item.nome}" com ${oferta.de}.`, 'info');
    }, [minhaFicha, updateFicha, salvar, adicionarAviso, cenario, isMestre, personagens]);

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
