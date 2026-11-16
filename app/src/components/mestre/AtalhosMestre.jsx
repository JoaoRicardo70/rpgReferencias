import React, { useCallback } from 'react';
import useStore from '../../stores/useStore';
import useSecaoMestre, { SECOES_MESTRE, domDaSecaoMestre } from './useSecaoMestre';

// 🧭 Atalhos do Mestre: botões que rolam até cada seção da aba Mestre (e abrem a seção se estiver recolhida).
// Usa o mesmo pedido do store (pedirSecaoMestre) que os links das fichas/Grimório usam.
export function SecaoMestreAncora({ id, className = '', children }) {
    useSecaoMestre(id);
    return <div id={domDaSecaoMestre(id)} className={`mestre-secao-ancora ${className}`.trim()}>{children}</div>;
}

export default function AtalhosMestre() {
    const pedir = useStore(s => s.pedirSecaoMestre);
    const ir = useCallback((id) => { if (typeof pedir === 'function') pedir(id); }, [pedir]);
    return (
        <nav className="mestre-atalhos glass-panel" aria-label="Atalhos do Mestre">
            <h3 className="mestre-atalhos-titulo">🧭 Atalhos do Mestre</h3>
            <p className="mestre-atalhos-dica">Toque num botão para ir direto à seção desta página.</p>
            <div className="mestre-atalhos-lista">
                {SECOES_MESTRE.map(s => (
                    <button key={s.id} type="button" className="btn-neon mestre-atalho-btn" onClick={() => ir(s.id)}>{s.rotulo}</button>
                ))}
            </div>
        </nav>
    );
}
