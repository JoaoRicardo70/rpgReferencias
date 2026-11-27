import React, { useMemo } from 'react';
import useStore from '../../stores/useStore';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import { resolverAtorCombate } from '../../core/atorCombate';

// 🎭 Avisos de Reação e de Combo para o "Atuar como" do Mestre (core/atorCombate.js): enquanto o Mestre atua como um NPC,
// os avisos olham a ficha DELE e o nome que o feed mostra, em vez da ficha do Mestre.
// Sem ator ativo (e para jogadores) tudo continua exatamente como era.
export function useAtorDosAvisos() {
    const isMestre = useStore(s => s.isMestre);
    const atorCombate = useStore(s => s.atorCombate);
    const personagens = useStore(s => s.personagens);
    const meuNome = useStore(s => s.meuNome);
    const ator = useMemo(
        () => resolverAtorCombate(atorCombate, { personagens, isMestre }),
        [atorCombate, personagens, isMestre]
    );
    return {
        ator,
        nomeFicha: ator ? ator.nomeFicha : undefined,
        // Nome com que os golpes dele entram no feed (e com que os alvos dos ataques contra ele aparecem).
        nomeFeed: ator ? ator.nomeExibido : meuNome,
        ehAtor: !!ator && ator.nomeFicha !== meuNome,
    };
}

export function AvisosDoAtor({ children }) {
    const { nomeFicha } = useAtorDosAvisos();
    return <FichaAlvoProvider nome={nomeFicha}>{children}</FichaAlvoProvider>;
}

export default AvisosDoAtor;
