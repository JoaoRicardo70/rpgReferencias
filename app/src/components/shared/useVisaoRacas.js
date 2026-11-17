import { useMemo } from 'react';
import useStore from '../../stores/useStore';
import { useFichaAtiva } from '../Ficha Def/FichaAlvoContext';
import { contextoDoViewer, racaPrincipalVisivel } from '../../core/racasVisibilidade';

// 🙈 Quem está olhando a ficha ativa (a minha ou a de outra entidade no Grimório do Mestre) e o que ele pode ver das Raças.
// viewer = { souDono, souMestre } (isMestre efetivo: o Modo Jogador do Mestre vale como jogador). principal = raça principal já filtrada.
export default function useVisaoRacas() {
    const cenario = useStore(s => s?.cenario);
    const isMestre = useStore(s => s?.isMestre) === true;
    const { ficha, nome, souEuMesmo } = useFichaAtiva();
    const viewer = useMemo(() => contextoDoViewer({ souDono: souEuMesmo, isMestre }), [souEuMesmo, isMestre]);
    const principal = useMemo(() => racaPrincipalVisivel(cenario, ficha, viewer), [cenario, ficha, viewer]);
    const entidade = useMemo(() => ({ id: nome, nome, isDummie: false }), [nome]);
    return { cenario, ficha, nome, souEuMesmo, isMestre, viewer, principal, entidade };
}
