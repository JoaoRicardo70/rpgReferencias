import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { PedidosNaFicha } from './MestrePedidosSexta';
import MarcadosPanel from '../Ficha Def/Marcados';
import GrimorioPanel from '../Ficha Def/Grimorio';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import { ordenarPedidosPendentes } from '../../core/sextaFeiraCriacao';
import { ABAS_LIVRO_ENTIDADE } from '../../core/grimorioLeitura';

// 📖 LIVRO DA ENTIDADE ("ABRIR GRIMÓRIO DA ENTIDADE" no Sandbox do Mestre). Dois botões no topo:
//   📕 Ficha Definitiva  — a MESMA Ficha Definitiva que o jogador usa (Marcados.jsx);
//   📖 Grimório Místico  — o MESMO Grimório do jogador (Ficha Def/Grimorio.jsx): "O Livro dos
//                          Poderes" (Habilidades/Formas/Poderes) e "Afinidades & Elementos".
// Tudo dentro de um FichaAlvoProvider: as telas leem e gravam a ficha DESTE personagem, ao vivo.
// Pedidos da Sexta-Feira pendentes dele aparecem no topo do Grimório (PedidosNaFicha), com
// Aprovar/Recusar; "Ver a Habilidade" das notificações abre o livro já ali.
//
// Vai num portal em document.body: o painel da aba usa backdrop-filter, que prende um
// position: fixed dentro dele — sem o portal o livro abria no TOPO da aba, longe de quem clicou.
export default function LivroEntidade({ nome, pedidoFocoId, aoFechar }) {
    const pendentes = useStore(s => s.sextaFeiraPendentes);

    // Pedidos pendentes deste personagem (selo ⏳ no botão do Grimório) e se o pedido em foco é dele.
    const { qtdPedidos, focoEhDele } = useMemo(() => {
        const alvo = sanitizarNome(nome || '');
        let qtd = 0;
        let foco = false;
        ordenarPedidosPendentes(pendentes).forEach(([id, p]) => {
            if (sanitizarNome(p.alvo || p.solicitante) !== alvo) return;
            qtd += 1;
            if (id === pedidoFocoId) foco = true;
        });
        return { qtdPedidos: qtd, focoEhDele: foco };
    }, [pendentes, nome, pedidoFocoId]);

    const [aba, setAba] = useState(() => (focoEhDele ? 'grimorio' : 'ficha'));
    // Outro "Ver a Habilidade" com o livro já aberto: vai pro Grimório.
    useEffect(() => { if (focoEhDele) setAba('grimorio'); }, [pedidoFocoId, focoEhDele]);

    if (!nome) return null;

    const conteudo = (
        <div className="livro-entidade-fundo">
            <FichaAlvoProvider nome={nome}>
                <div className="livro-entidade-barra">
                    <div className="livro-entidade-abas" role="tablist" aria-label={`Livro de ${nome}`}>
                        {ABAS_LIVRO_ENTIDADE.map(a => (
                            <button
                                key={a.id}
                                type="button"
                                role="tab"
                                aria-selected={aba === a.id}
                                className={`grimorio-mestre-aba${aba === a.id ? ' ativa' : ''}`}
                                onClick={() => setAba(a.id)}
                            >
                                {a.icone} {a.nome}
                                {a.id === 'grimorio' && qtdPedidos > 0 && (
                                    <span className="grimorio-mestre-aba-pedido" title="Pedidos da Sexta-Feira aguardando aprovação">⏳{qtdPedidos}</span>
                                )}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="livro-entidade-fechar" onClick={aoFechar}>❌ FECHAR LIVRO</button>
                </div>
                <div className="livro-entidade-corpo fade-in" role="tabpanel">
                    {aba === 'ficha' ? <MarcadosPanel /> : (
                        <>
                            {/* Pedidos da Sexta-Feira deste personagem, antes das páginas do Grimório */}
                            <div className="livro-entidade-pedidos">
                                <PedidosNaFicha nome={nome} pedidoFocoId={pedidoFocoId} />
                            </div>
                            <GrimorioPanel />
                        </>
                    )}
                </div>
            </FichaAlvoProvider>
        </div>
    );

    return typeof document !== 'undefined' && document.body ? createPortal(conteudo, document.body) : conteudo;
}
