import React, { useCallback } from 'react';
import { getRacas, racasComAcessoTexto } from '../../core/racas';

// 🧬 "Raças com acesso" de uma Habilidade de Raça (poder.racasAcesso = ids do catálogo de Raças da mesa, core/racas.js).
// Mestre/Co-Mestre: chips de seleção múltipla (cada clique grava na hora via aoMudar(ids)). Jogador: só leitura, com o texto das raças.
export default function RacasAcessoCampo({ poder, cenario, podeEditar, aoMudar }) {
    const racas = getRacas(cenario);
    const marcadas = (poder && Array.isArray(poder.racasAcesso) ? poder.racasAcesso : []).filter(id => racas.some(r => r.id === id));
    const alternar = useCallback((id) => {
        if (!aoMudar) return;
        aoMudar(marcadas.includes(id) ? marcadas.filter(i => i !== id) : [...marcadas, id]);
    }, [aoMudar, marcadas]);

    if (!podeEditar) {
        return <p className="habilidade-raca-acesso-texto">🧬 Raças com acesso: {racasComAcessoTexto(cenario, poder)}</p>;
    }
    if (racas.length === 0) {
        return <p className="habilidade-raca-acesso-texto" role="note">🧬 Cadastre as Raças da mesa na aba Mestre (🧬 Raças) para definir quais têm acesso a esta habilidade.</p>;
    }
    return (
        <div className="habilidade-raca-acesso" role="group" aria-label={`Raças com acesso a ${poder && poder.nome ? poder.nome : 'esta habilidade'}`}>
            <span className="habilidade-raca-acesso-rotulo">🧬 Raças com acesso:</span>
            {racas.map(r => (
                <button key={r.id} type="button" className={`habilidade-raca-chip${marcadas.includes(r.id) ? ' marcada' : ''}`}
                    aria-pressed={marcadas.includes(r.id)} onClick={() => alternar(r.id)}>
                    {r.icone} {r.nome}
                </button>
            ))}
            {marcadas.length === 0 && <span className="habilidade-raca-acesso-vazio">nenhuma: só o Mestre concede, como exceção</span>}
        </div>
    );
}
