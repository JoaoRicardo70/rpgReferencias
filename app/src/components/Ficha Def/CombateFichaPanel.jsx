import React, { useState, useEffect } from 'react';
import useStore from '../../stores/useStore';
import TestesPanel from '../combate/TestesPanel';
import AcertoPanel from '../combate/AcertoPanel';
import AtaquePanel from '../combate/AtaquePanel';
import DefesaPanel from '../combate/DefesaPanel';
import CombosPanel from '../combos/CombosPanel';
import FeedCombate from '../feed/FeedCombate';
import { useFichaAtiva } from './FichaAlvoContext';

// ⚔️ Página de Combate da Ficha Definitiva: Testes, Acerto, Ataque e Defesa (antes eram abas separadas), em capítulos, na ordem em
// que um golpe acontece. Cada tela age sobre a ficha em foco (a do jogador, ou a que o Mestre está vendo).
export const CAPITULOS_COMBATE = [
    { id: 'testes', label: 'Testes', icon: '🎲', Painel: TestesPanel },
    { id: 'acerto', label: 'Acerto', icon: '🎯', Painel: AcertoPanel },
    { id: 'ataque', label: 'Ataque', icon: '🗡️', Painel: AtaquePanel },
    { id: 'defesa', label: 'Defesa', icon: '🛡️', Painel: DefesaPanel },
    { id: 'combos', label: 'Combos', icon: '🥋', Painel: CombosPanel }
];

export default function CombateFichaPanel() {
    // Quem manda abrir já num capítulo (ex.: "conjurar" leva ao Ataque) deixa o pedido no store; aqui ele é consumido.
    const { ficha } = useFichaAtiva();
    const setCombateNaTela = useStore(s => s.setCombateNaTela);
    // Enquanto esta página está aberta, rolar não pula pro Feed (ele está aqui embaixo).
    useEffect(() => { setCombateNaTela(true); return () => setCombateNaTela(false); }, [setCombateNaTela]);
    const pedido = useStore(s => s.fichaPaginaPedida);
    const limparPedido = useStore(s => s.limparFichaPaginaPedida);
    const [capitulo, setCapitulo] = useState(() => {
        const pedido0 = pedido;
        return pedido0 && CAPITULOS_COMBATE.some(c => c.id === pedido0.capitulo) ? pedido0.capitulo : 'acerto';
    });

    useEffect(() => {
        if (!pedido) return;
        if (CAPITULOS_COMBATE.some(c => c.id === pedido.capitulo)) setCapitulo(pedido.capitulo);
        limparPedido();
    }, [pedido, limparPedido]);

    // Ficha de outro personagem que o Mestre abriu e ainda não chegou: espera em vez de quebrar os painéis.
    if (!ficha) return <div className="grimorio-estilo-papel combate-ficha"><p>Abrindo a ficha...</p></div>;

    const indice = Math.max(0, CAPITULOS_COMBATE.findIndex(c => c.id === capitulo));
    const atual = CAPITULOS_COMBATE[indice];
    const { Painel } = atual;
    const irPara = (i) => { if (i >= 0 && i < CAPITULOS_COMBATE.length) setCapitulo(CAPITULOS_COMBATE[i].id); };

    return (
        <div className="grimorio-estilo-papel combate-ficha">
            <div className="combate-ficha-nav">
                <button type="button" className="combate-ficha-folhear" onClick={() => irPara(indice - 1)} disabled={indice === 0}>⮜ FOLHEAR</button>
                <div className="combate-ficha-capitulos" role="tablist" aria-label="Capítulos de Combate">
                    {CAPITULOS_COMBATE.map(c => (
                        <button key={c.id} type="button" role="tab" aria-selected={c.id === capitulo} className={`combate-ficha-capitulo${c.id === capitulo ? ' ativo' : ''}`} onClick={() => setCapitulo(c.id)}>{c.icon} {c.label}</button>
                    ))}
                </div>
                <button type="button" className="combate-ficha-folhear" onClick={() => irPara(indice + 1)} disabled={indice === CAPITULOS_COMBATE.length - 1}>FOLHEAR ⮞</button>
            </div>
            <h2 className="combate-ficha-titulo">{atual.icon} {atual.label}</h2>
            <Painel />
            {/* Os resultados aparecem aqui mesmo: rolar não tira você da Ficha. */}
            <section className="combate-ficha-feed">
                <h3 className="combate-ficha-feed-titulo">📜 Feed ao vivo</h3>
                <div className="combate-ficha-feed-corpo"><FeedCombate /></div>
            </section>
        </div>
    );
}
