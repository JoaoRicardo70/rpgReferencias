import { useEffect, useRef, useState } from 'react';
import { imagemFalhou, verificarImagem } from '../core/imagemVerificada';

// Primeira candidata que ainda não se sabe quebrada (a resposta imediata enquanto o teste real roda).
const primeiraBoa = (lista) => lista.find(u => !imagemFalhou(u)) || '';

const listasIguais = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Recebe as imagens candidatas (da preferida para a reserva) e devolve a primeira que carrega de verdade.
// Enquanto testa, mostra a preferida (que quase sempre está boa); se ela falhar, cai para a próxima. Se
// nenhuma carregar, devolve '' (quem chama mostra a inicial do nome em vez de um quadro preto).
export function useImagemQueCarrega(candidatas) {
    const estavel = useRef(candidatas);
    if (!listasIguais(estavel.current, candidatas)) estavel.current = candidatas;
    const lista = estavel.current;

    const [escolhida, setEscolhida] = useState({ lista, url: primeiraBoa(lista) });

    useEffect(() => {
        let cancelado = false;
        (async () => {
            for (let i = 0; i < lista.length; i++) {
                if (await verificarImagem(lista[i])) {
                    if (!cancelado) setEscolhida({ lista, url: lista[i] });
                    return;
                }
            }
            if (!cancelado) setEscolhida({ lista, url: '' });
        })();
        return () => { cancelado = true; };
    }, [lista]);

    // A lista mudou e o teste novo ainda não terminou: mostra a preferida já.
    return escolhida.lista === lista ? escolhida.url : primeiraBoa(lista);
}
