import { useEffect, useState } from 'react';
import {
    lerDadosMestrePrivados, gravarDadosMestrePrivados, lerAcertoOculto, gravarAcertoOculto, assinarDadosMestre
} from '../core/dadosMestre';

// [privados, definir]: o Mestre escolhe se os dados dele são privados por padrão. Todas as telas que usam isto ficam em sincronia.
export default function useDadosMestrePrivados() {
    const [privados, setPrivados] = useState(lerDadosMestrePrivados);
    useEffect(() => assinarDadosMestre(() => setPrivados(lerDadosMestrePrivados())), []);
    return [privados, gravarDadosMestrePrivados];
}

// [oculto, definir]: esconder só o valor do Dado de Acerto do Mestre (o jogador ainda vê se foi atingido).
export function useAcertoOculto() {
    const [oculto, setOculto] = useState(lerAcertoOculto);
    useEffect(() => assinarDadosMestre(() => setOculto(lerAcertoOculto())), []);
    return [oculto, gravarAcertoOculto];
}
