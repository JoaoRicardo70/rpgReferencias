import React, { useRef, useState } from 'react';
import { emojiDoIcone } from '../../core/pontosInteresse';

const PERCENTUAL = (n) => `${n}%`;

// Pontos de interesse de uma região, por cima do mapa aproximado (estilo mapa de missões): ícone + plaquinha com o nome.
// Fica DENTRO do mapa ampliado; os pinos se encolhem na mesma proporção do zoom (variável CSS --zoom) para manter o tamanho.
// `editando` (só Mestre): clicar no mapa vazio marca um ponto novo e os pinos podem ser arrastados.
export default function PontosDaRegiao({ pontos, editando = false, onAbrir, onEditar, onMover, onColocar, onPanorama, janelaRef }) {
    const areaRef = useRef(null);
    const [arrasto, setArrasto] = useState(null);
    const movimento = useRef(null);
    const acabouDeArrastar = useRef(null);
    const panorama = useRef(null);
    const acabouDePanoramar = useRef(false);

    const posicaoDoEvento = (e) => {
        const r = areaRef.current.getBoundingClientRect();
        if (!(r.width > 0) || !(r.height > 0)) return null;
        return {
            x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
            y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))
        };
    };

    // Arrastar o fundo desloca o mapa ampliado (um toque sem arrastar continua sendo um clique, que marca ponto no modo edição).
    const aoPressionarFundo = (e) => {
        if (e.target !== areaRef.current || e.button > 0 || !onPanorama) return;
        areaRef.current.setPointerCapture?.(e.pointerId);
        panorama.current = { x: e.clientX, y: e.clientY, moveu: false };
    };
    const aoMoverFundo = (e) => {
        const p = panorama.current;
        if (!p) return;
        if (!p.moveu && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
        p.moveu = true;
        const r = janelaRef?.current?.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) onPanorama((e.clientX - p.x) / r.width, (e.clientY - p.y) / r.height);
        p.x = e.clientX; p.y = e.clientY;
    };
    // só o pointerup é seguido de um click; no cancelamento o flag ficaria ligado e engoliria o próximo clique
    const aoSoltarFundo = () => {
        if (panorama.current?.moveu) acabouDePanoramar.current = true;
        panorama.current = null;
    };
    const aoCancelarFundo = () => { panorama.current = null; };

    const aoClicarNoMapa = (e) => {
        if (acabouDePanoramar.current) { acabouDePanoramar.current = false; return; }
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
        <div ref={areaRef} className={`pontos-area${editando ? ' pontos-area-editando' : ''}`} onClick={aoClicarNoMapa} onPointerDown={aoPressionarFundo} onPointerMove={aoMoverFundo} onPointerUp={aoSoltarFundo} onPointerCancel={aoCancelarFundo} data-testid="pontos-area">
            {pontos.map(({ id, ponto, cenas }) => {
                const pos = arrasto && arrasto.id === id ? arrasto : ponto;
                return (
                    <button
                        key={id}
                        type="button"
                        className={`ponto-pin${editando ? ' ponto-pin-editando' : ''}${ponto.categoria === 'dungeon' ? ' ponto-pin-dungeon' : ''}`}
                        style={{ left: PERCENTUAL(pos.x), top: PERCENTUAL(pos.y) }}
                        onPointerDown={(e) => { e.stopPropagation(); aoPressionar(e, id); }}
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
