import React from 'react';
import SeletorRaca from './SeletorRaca';
import useVisaoRacas from './useVisaoRacas';

// 🙈 SeletorRaca das fichas Ficha/Narrativa já ciente da visibilidade: se a Raça principal está oculta para quem olha, mostra "❓ Raça desconhecida" (só leitura).
export default function SeletorRacaDaFicha(props) {
    const { principal } = useVisaoRacas();
    return <SeletorRaca {...props} oculta={principal.oculta} textoOculto={principal.texto} />;
}
