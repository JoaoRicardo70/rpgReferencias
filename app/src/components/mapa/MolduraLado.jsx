import React, { useCallback } from 'react';
import { useMapaForm } from './MapaFormContext';
import { rotuloDoLado, ladoVisivelParaMim, ladoEstaOculto, equipeDe, getEquipe, ROTULO_LADO_OCULTO } from '../../core/lados';

// 🛡️ Lado do personagem na moldura do Mapa. Todos veem o lado (jogador: "❓ Lado desconhecido" se oculto).
// Só Mestre/Co-Mestre (isMestre) veem o seletor de Equipe e o botão Revelar/Ocultar — a checagem também é feita em definirEquipeDe/alternarLadoOculto.
// `entidade` = { id, nome, isDummie }; `ficha` = ficha do jogador/NPC ou dados do Dummie.
export default function MolduraLado({ entidade, ficha }) {
    const ctx = useMapaForm();
    const cenario = ctx ? ctx.cenario : null;
    const isMestre = !!(ctx && ctx.isMestre);
    const definirEquipeDe = ctx && ctx.definirEquipeDe;
    const alternarLadoOculto = ctx && ctx.alternarLadoOculto;

    const aoMudarEquipe = useCallback((e) => { if (definirEquipeDe && entidade) definirEquipeDe(entidade, e.target.value); }, [definirEquipeDe, entidade]);
    const aoAlternar = useCallback(() => { if (alternarLadoOculto && entidade) alternarLadoOculto(entidade); }, [alternarLadoOculto, entidade]);

    if (!ctx || !entidade || !ficha) return null;
    const combatente = { ficha, isDummie: !!entidade.isDummie };
    const visivel = ladoVisivelParaMim(combatente, { isMestre });
    const oculto = ladoEstaOculto(combatente);
    const idEquipe = equipeDe(combatente, cenario);
    const eq = getEquipe(cenario, idEquipe);
    const equipes = ctx.equipes || [];
    const rotulo = rotuloDoLado(cenario, combatente, { isMestre });

    return (
        <div className="lado-moldura" data-testid="moldura-lado">
            <span
                className={`lado-moldura-rotulo${visivel ? '' : ' lado-moldura-rotulo--oculto'}`}
                style={visivel && eq ? { '--lado-cor': eq.cor } : undefined}
                title={visivel ? 'Lado deste personagem' : ROTULO_LADO_OCULTO}
            >
                {rotulo}
            </span>
            {isMestre && (
                <span className="lado-moldura-controles">
                    <label className="lado-moldura-campo">
                        <span className="lado-moldura-campo-rotulo">Equipe</span>
                        <select className="input-neon lado-moldura-select" value={idEquipe} onChange={aoMudarEquipe} aria-label={`Equipe de ${entidade.nome}`}>
                            {equipes.map(e => <option key={e.id} value={e.id}>{e.icone} {e.nome}</option>)}
                        </select>
                    </label>
                    <span className={`lado-estado ${oculto ? 'lado-estado--oculto' : 'lado-estado--revelado'}`}>{oculto ? '🙈 Oculto' : '👁️ Revelado'}</span>
                    <button
                        type="button"
                        className="btn-neon lado-moldura-btn"
                        onClick={aoAlternar}
                        aria-pressed={oculto}
                        title={oculto ? 'Mostrar a equipe deste personagem aos jogadores' : 'Esconder a equipe deste personagem dos jogadores'}
                    >
                        {oculto ? '👁️ Revelar lado' : '🙈 Ocultar lado'}
                    </button>
                </span>
            )}
        </div>
    );
}
