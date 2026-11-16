import React, { useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import useSecaoMestre, { SECOES_MESTRE, domDaSecaoMestre } from './useSecaoMestre';
import { listarPedidosRaca } from '../../core/racas';

// 🧭 Atalhos do Mestre: botões que rolam até cada seção da aba Mestre (e abrem a seção se estiver recolhida).
// Usa o mesmo pedido do store (pedirSecaoMestre) que os links das fichas/Grimório usam.
// O atalho "🧬 Raças" mostra um contador com os Pedidos de Raça (Manipulação de DNA) pendentes.
export function SecaoMestreAncora({ id, className = '', children }) {
    useSecaoMestre(id);
    return <div id={domDaSecaoMestre(id)} className={`mestre-secao-ancora ${className}`.trim()}>{children}</div>;
}

export default function AtalhosMestre() {
    const pedir = useStore(s => s.pedirSecaoMestre);
    const personagens = useStore(s => s.personagens);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const pedidosRaca = useMemo(() => listarPedidosRaca({ personagens, meuNome, minhaFicha }).length, [personagens, meuNome, minhaFicha]);
    const ir = useCallback((id) => { if (typeof pedir === 'function') pedir(id); }, [pedir]);
    return (
        <nav className="mestre-atalhos glass-panel ativo" aria-label="Atalhos do Mestre">
            <h3 className="mestre-atalhos-titulo">🧭 Atalhos do Mestre</h3>
            <p className="mestre-atalhos-dica">Toque num botão para ir direto à seção desta página.</p>
            <div className="mestre-atalhos-lista">
                {SECOES_MESTRE.map(s => (
                    <button key={s.id} type="button" className="btn-neon mestre-atalho-btn" onClick={() => ir(s.id)}>
                        {s.rotulo}
                        {s.id === 'racas' && pedidosRaca > 0 && <span className="pedido-raca-badge" aria-label={`, ${pedidosRaca} pedido(s) de Raça pendente(s)`}>{pedidosRaca}</span>}
                    </button>
                ))}
            </div>
        </nav>
    );
}
