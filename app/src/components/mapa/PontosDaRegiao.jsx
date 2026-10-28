import React, { useRef, useState } from 'react';
import { emojiDoIcone } from '../../core/pontosInteresse';

const PERCENTUAL = (n) => `${n}%`;

// Pontos de interesse de uma região, por cima do mapa aproximado (estilo mapa de missões): ícone + plaquinha com o nome.
// Fica DENTRO do mapa ampliado; os pinos se encolhem na mesma proporção do zoom (variável CSS --zoom) para manter o tamanho.
// `editando` (só Mestre): clicar no mapa vazio marca um ponto novo e os pinos podem ser arrastados.
export default function PontosDaRegiao({ pontos, editando = false, onAbrir, onEditar, onMover, onColocar }) {
    const areaRef = useRef(null);
    const [arrasto, setArrasto] = useState(null);
    const movimento = useRef(null);
    const acabouDeArrastar = useRef(null);

    const posicaoDoEvento = (e) => {
        const r = areaRef.current.getBoundingClientRect();
        if (!(r.width > 0) || !(r.height > 0)) return null;
        return {
            x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
            y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))
        };
    };

    const aoClicarNoMapa = (e) => {
        if (!editando || !onColocar || e.target !== areaRef.current) return;
        const p = posicaoDoEvento(e);
        if (p) onColocar(p.x, p.y);
    };

    const aoPressionar = (e, id) => {
        if (!editando || e.button > 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        movimento.current = { id, moveu: false };
    };
    const aoMover = (e, id) => {
        if (!movimento.current || movimento.current.id !== id) return;
        const p = posicaoDoEvento(e);
        if (!p) return;
        movimento.current.moveu = true;
        setArrasto({ id, x: p.x, y: p.y });
    };
    const aoSoltar = (e, id) => {
        const m = movimento.current;
        movimento.current = null;
        if (!m || m.id !== id) return;
        // o clique que o navegador dispara depois de soltar não pode abrir o formulário
        if (m.moveu) acabouDeArrastar.current = id;
        if (m.moveu && arrasto && onMover) onMover(id, arrasto.x, arrasto.y);
        setArrasto(null);
    };

    return (
        <div ref={areaRef} className={`pontos-area${editando ? ' pontos-area-editando' : ''}`} onClick={aoClicarNoMapa} data-testid="pontos-area">
            {pontos.map(({ id, ponto, cenas }) => {
                const pos = arrasto && arrasto.id === id ? arrasto : ponto;
                return (
                    <button
                        key={id}
                        type="button"
                        className={`ponto-pin${editando ? ' ponto-pin-editando' : ''}`}
                        style={{ left: PERCENTUAL(pos.x), top: PERCENTUAL(pos.y) }}
                        onPointerDown={(e) => aoPressionar(e, id)}
                        onPointerMove={(e) => aoMover(e, id)}
                        onPointerUp={(e) => aoSoltar(e, id)}
                        onPointerCancel={() => { movimento.current = null; setArrasto(null); }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (acabouDeArrastar.current === id) { acabouDeArrastar.current = null; return; }
                            (editando ? onEditar : onAbrir)?.(id);
                        }}
                        aria-label={`${ponto.nome}${cenas ? `, ${cenas} ${cenas === 1 ? 'cena' : 'cenas'}` : ', sem cenas'}`}
                    >
                        <span className="ponto-pin-icone">{emojiDoIcone(ponto.icone)}</span>
                        {cenas > 0 && <span className="ponto-pin-contagem">{cenas}</span>}
                        <span className="ponto-pin-nome">{ponto.nome}</span>
                    </button>
                );
            })}
        </div>
    );
}
