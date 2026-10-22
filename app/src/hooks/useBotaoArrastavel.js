import { useState, useRef, useEffect, useCallback } from 'react';
import { limitarPosicao, posicaoInicial, lerPosicaoSalva, salvarPosicao, movimentoEhArrasto } from '../core/posicaoFlutuante';

function medirJanela() {
    return { largura: typeof window !== 'undefined' ? window.innerWidth : 1280, altura: typeof window !== 'undefined' ? window.innerHeight : 720 };
}

// 📌 Botão flutuante que o jogador arrasta pra onde não atrapalhe; lembra o lugar (localStorage[chave]) e nunca sai da tela.
// Uso: const { pos, aoPressionar, consumirArrasto } = useBotaoArrastavel(chave, { largura, altura, topoReservado });
//  - style={{ left: pos.x, top: pos.y }} no elemento fixo, onPointerDown={aoPressionar} no que se arrasta;
//  - no onClick: if (consumirArrasto()) return;  (o clique que termina um arrasto não conta como clique).
export default function useBotaoArrastavel(chave, { largura = 64, altura = 38, topoReservado = 0 } = {}) {
    const tamanho = { largura, altura };
    const [pos, setPos] = useState(() => {
        const janela = medirJanela();
        const salva = lerPosicaoSalva(chave);
        return salva ? limitarPosicao(salva, janela, tamanho, topoReservado) : posicaoInicial(janela, tamanho, topoReservado);
    });
    const posRef = useRef(pos);
    posRef.current = pos;
    const arrastouRef = useRef(false);

    // A janela mudou de tamanho: puxa o botão de volta pra dentro da tela.
    useEffect(() => {
        const aoRedimensionar = () => setPos(p => limitarPosicao(p, medirJanela(), tamanho, topoReservado));
        window.addEventListener('resize', aoRedimensionar);
        return () => window.removeEventListener('resize', aoRedimensionar);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tamanho é constante por chamada
    }, [largura, altura, topoReservado]);

    const aoPressionar = useCallback((e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const inicio = { x: e.clientX, y: e.clientY };
        const posInicial = { ...posRef.current };
        arrastouRef.current = false;

        const mover = (ev) => {
            const atual = { x: ev.clientX, y: ev.clientY };
            if (!arrastouRef.current && !movimentoEhArrasto(inicio, atual)) return;
            arrastouRef.current = true;
            setPos(limitarPosicao({ x: posInicial.x + (atual.x - inicio.x), y: posInicial.y + (atual.y - inicio.y) }, medirJanela(), tamanho, topoReservado));
        };
        const soltar = () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
            window.removeEventListener('pointercancel', soltar);
            if (arrastouRef.current) salvarPosicao(chave, posRef.current);
        };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
        window.addEventListener('pointercancel', soltar);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tamanho é constante por chamada
    }, [chave, largura, altura, topoReservado]);

    // true (uma vez) se o último gesto foi um arrasto: o clique que vem logo depois deve ser ignorado.
    const consumirArrasto = useCallback(() => {
        const foi = arrastouRef.current;
        arrastouRef.current = false;
        return foi;
    }, []);

    return { pos, aoPressionar, consumirArrasto };
}
