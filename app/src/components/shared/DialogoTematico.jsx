import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

// 🪟 Diálogo temático genérico (confirmações e pequenos formulários): role="dialog" + aria-modal, título ligado por aria-labelledby,
// foco inicial no primeiro campo (ou no elemento marcado com data-foco-inicial), Esc e clique no fundo cancelam, Tab fica preso dentro
// e o foco volta ao elemento anterior ao fechar. Usado pelos pedidos de Raça (DNA) e pela confirmação de "Despertar" uma Habilidade de Raça.
const FOCAVEIS = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Pilha simples: só o diálogo do TOPO reage a Esc/Tab quando há dois empilhados.
const PILHA_DIALOGOS = [];

export default function DialogoTematico({ titulo, aoFechar, children, acoes = null, descricao = '' }) {
    const caixaRef = useRef(null);
    const aoFecharRef = useRef(aoFechar);
    aoFecharRef.current = aoFechar;
    const idTitulo = useId();
    const idDescricao = useId();

    useEffect(() => {
        const meuToken = {};
        PILHA_DIALOGOS.push(meuToken);
        const anterior = document.activeElement;
        const caixa = caixaRef.current;
        if (caixa) {
            const marcado = caixa.querySelector('[data-foco-inicial]');
            const primeiro = marcado || caixa.querySelector(FOCAVEIS);
            if (primeiro && typeof primeiro.focus === 'function') primeiro.focus();
        }
        const aoTeclar = (e) => {
            if (PILHA_DIALOGOS[PILHA_DIALOGOS.length - 1] !== meuToken) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (aoFecharRef.current) aoFecharRef.current(); return; }
            if (e.key !== 'Tab' || !caixaRef.current) return;
            const itens = [...caixaRef.current.querySelectorAll(FOCAVEIS)];
            if (itens.length === 0) return;
            const primeiro = itens[0]; const ultimo = itens[itens.length - 1];
            const ativo = document.activeElement;
            if (e.shiftKey && (ativo === primeiro || !caixaRef.current.contains(ativo))) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && (ativo === ultimo || !caixaRef.current.contains(ativo))) { e.preventDefault(); primeiro.focus(); }
        };
        document.addEventListener('keydown', aoTeclar, true);
        return () => {
            document.removeEventListener('keydown', aoTeclar, true);
            const ix = PILHA_DIALOGOS.indexOf(meuToken);
            if (ix >= 0) PILHA_DIALOGOS.splice(ix, 1);
            if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) anterior.focus();
        };
    }, []);

    return createPortal(
        <div className="dialogo-tematico-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget && aoFechar) aoFechar(); }}>
            <div ref={caixaRef} className="dialogo-tematico-caixa" role="dialog" aria-modal="true" aria-labelledby={idTitulo} aria-describedby={descricao ? idDescricao : undefined}>
                <h3 id={idTitulo} className="dialogo-tematico-titulo">{titulo}</h3>
                {descricao ? <p id={idDescricao} className="dialogo-tematico-descricao">{descricao}</p> : null}
                {children}
                {acoes ? <div className="dialogo-tematico-acoes">{acoes}</div> : null}
            </div>
        </div>,
        document.body
    );
}
