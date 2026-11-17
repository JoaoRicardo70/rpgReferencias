import React from 'react';
import useStore from '../../stores/useStore';

// 🧬 Atalho para o catálogo de Raças da mesa (aba Mestre → 🧬 Raças). Só aparece para Mestre/Co-Mestre (isMestre); jogador não vê nada.
export default function BotaoCatalogoRacas({ rotulo = '🧬 Abrir catálogo de Raças', className = '', forcarVisivel = false }) {
    const isMestreStore = useStore(s => s.isMestre);
    const isMestre = isMestreStore || forcarVisivel === true;
    const pedir = useStore(s => s.pedirSecaoMestre);
    if (!isMestre || typeof pedir !== 'function') return null;
    return <button type="button" className={`btn-neon racas-link-catalogo ${className}`.trim()} onClick={() => pedir('racas')}>{rotulo}</button>;
}
