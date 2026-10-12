import React, { useMemo, useCallback, useEffect } from 'react';
import useStore from '../../stores/useStore';
import { useMapaForm } from './MapaFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import { listarAtoresDaCena, resolverAtorCombate, valorDoAtor, atorDeValor } from '../../core/atorCombate';

// 🎭 Ator ativo do Mapa: o MESMO cálculo para o seletor, o painel de combate e o acerto rápido
// (MapaFormContext), pra nunca discordarem sobre quem está agindo.
function useAtorAtivoDoMapa() {
    const ctx = useMapaForm();
    const atorCombate = useStore(s => s.atorCombate);
    const personagens = ctx ? ctx.personagens : null;
    const dummies = ctx ? ctx.dummies : null;
    const cenaRenderId = ctx ? ctx.cenaRenderId : null;
    const isMestre = !!(ctx && ctx.isMestre);
    const ator = useMemo(
        () => resolverAtorCombate(atorCombate, { personagens, dummies, isMestre, cenaId: cenaRenderId }),
        [atorCombate, personagens, dummies, isMestre, cenaRenderId]
    );
    return { ctx, atorCombate, ator, personagens, dummies, cenaRenderId, isMestre };
}

// Envolve os módulos de combate do Mapa: com um NPC ativo eles leem e gravam a ficha DELE
// (FichaAlvoProvider, o mesmo mecanismo do Livro da entidade); sem ator, agem como o jogador logado.
export function MapaModulosDoAtor({ children }) {
    const { ator } = useAtorAtivoDoMapa();
    return <FichaAlvoProvider nome={ator ? ator.nomeFicha : undefined}>{children}</FichaAlvoProvider>;
}

// 🎭 Seletor "Atuar como": o MESTRE escolhe em qual NPC da cena está agindo. Enquanto um NPC está
// ativo, o Acerto, o Ataque (armas, Poderes, magias) e os gastos de energia do Mapa usam a ficha
// DELE — dá pra trocar de NPC num clique e conduzir vários combatentes. Só aparece pro Mestre.
export function MapaSeletorAtor() {
    const { atorCombate, ator, dummies, personagens, cenaRenderId, isMestre } = useAtorAtivoDoMapa();
    const setAtorCombate = useStore(s => s.setAtorCombate);

    const atores = useMemo(
        () => (isMestre ? listarAtoresDaCena({ personagens, dummies, cenaId: cenaRenderId }) : []),
        [isMestre, personagens, dummies, cenaRenderId]
    );

    // Ator que deixou de valer (token removido ou em outra cena): volta a agir como eu mesmo, sem ficar meio ativo.
    useEffect(() => {
        if (isMestre && atorCombate && !ator) setAtorCombate(null);
    }, [isMestre, atorCombate, ator, setAtorCombate]);

    const trocar = useCallback((e) => { setAtorCombate(atorDeValor(e.target.value, dummies)); }, [setAtorCombate, dummies]);
    const voltar = useCallback(() => { setAtorCombate(null); }, [setAtorCombate]);

    if (!isMestre) return null;
    // Sem NPC na cena e sem ator ativo, não há o que escolher: não ocupa espaço.
    if (atores.length === 0 && !ator) return null;

    return (
        <div className={`mapa-ator${ator ? ' mapa-ator-ativo' : ''}`}>
            <label className="mapa-ator-rotulo" htmlFor="mapa-ator-select">🎭 Atuar como:</label>
            <select id="mapa-ator-select" className="input-neon mapa-ator-select" value={ator ? valorDoAtor(atorCombate) : ''} onChange={trocar}>
                <option value="">Eu (Mestre)</option>
                {atores.map(a => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
            </select>
            {ator && (
                <>
                    <span className="mapa-ator-banner">⚔️ Seus golpes saem como <strong>{ator.nomeExibido}</strong> (ficha: {ator.nomeFicha})</span>
                    <button type="button" className="btn-neon mapa-ator-voltar" onClick={voltar}>↩ Voltar a mim</button>
                </>
            )}
        </div>
    );
}

export default MapaSeletorAtor;
