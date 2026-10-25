import { useEffect, useState } from 'react';
import { lerDadosMestrePrivados, gravarDadosMestrePrivados, assinarDadosMestre } from '../core/dadosMestre';

// [privados, definir]: o Mestre escolhe se os dados dele são privados por padrão. Todas as telas que usam isto ficam em sincronia.
export default function useDadosMestrePrivados() {
    const [privados, setPrivados] = useState(lerDadosMestrePrivados);
    useEffect(() => assinarDadosMestre(() => setPrivados(lerDadosMestrePrivados())), []);
    return [privados, gravarDadosMestrePrivados];
}
