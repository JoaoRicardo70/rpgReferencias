import React, { useState, useCallback } from 'react';
import TestesPanel from './TestesPanel';
import AtaquePanel from './AtaquePanel';
import AcertoPanel from './AcertoPanel';
import DefesaPanel from './DefesaPanel';
import FeedCombate from '../feed/FeedCombate';

// ⚔️ Combate (tudo junto): Acerto, Ataque, Defesa, Testes e o Feed ao vivo numa tela só, em colunas — rola o Acerto, rola o
// Dano e vê o resultado no Feed sem trocar de aba. Cada seção recolhe (lembra a escolha neste aparelho).
const CHAVE_SECOES = 'rpg_combate_secoes';

const SECOES = [
    { id: 'acerto', titulo: '🎯 Acerto', Painel: AcertoPanel },
    { id: 'ataque', titulo: '🗡️ Ataque', Painel: AtaquePanel },
    { id: 'defesa', titulo: '🛡️ Defesa', Painel: DefesaPanel },
    { id: 'testes', titulo: '🎲 Testes', Painel: TestesPanel },
    { id: 'feed', titulo: '📜 Feed ao vivo', Painel: FeedCombate }
];

function lerFechadas() {
    try {
        const r = JSON.parse(localStorage.getItem(CHAVE_SECOES) || '{}');
        return r && typeof r === 'object' ? r : {};
    } catch (e) { return {}; }
}

export default function PainelCombate() {
    const [fechadas, setFechadas] = useState(lerFechadas);

    const alternar = useCallback((id) => {
        setFechadas(atual => ({ ...atual, [id]: !atual[id] }));
    }, []);

    // Grava fora do updater (efeito colateral não pertence ao setState).
    React.useEffect(() => {
        try { localStorage.setItem(CHAVE_SECOES, JSON.stringify(fechadas)); } catch (e) { /* sem localStorage */ }
    }, [fechadas]);

    return (
        <div className="painel-combate">
            {SECOES.map(({ id, titulo, Painel }) => (
                <section key={id} className={`combate-secao combate-secao-${id}${fechadas[id] ? ' recolhida' : ''}`}>
                    <button type="button" className="combate-secao-titulo" aria-expanded={!fechadas[id]} onClick={() => alternar(id)}>
                        <span>{titulo}</span>
                        <span aria-hidden="true">{fechadas[id] ? '▸' : '▾'}</span>
                    </button>
                    {!fechadas[id] && <div className="combate-secao-corpo"><Painel /></div>}
                </section>
            ))}
        </div>
    );
}
