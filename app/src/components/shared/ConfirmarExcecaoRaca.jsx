import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 🧬 DIÁLOGO DE EXCEÇÃO DE RAÇA (só Mestre/Co-Mestre): "Raça sem acesso" + "Conceder como exceção" / "Cancelar".
// Serviço por Promise para os fluxos assíncronos (Modelo, salvar poder, importador, ensinamento, Sexta-Feira):
//   const ok = await confirmarExcecaoRaca({ mensagem, nomePoder });   // true = conceder como exceção
// O <ConfirmarExcecaoRacaHost /> (montado uma vez no App) mostra a fila de pedidos. Sem host montado (testes isolados),
// cai no window.confirm do navegador com a mesma mensagem — nenhum fluxo fica esperando para sempre.

const PERGUNTA_FINAL = /\s*Raça sem acesso: conceder como exceção\?\s*$/;
const FOCAVEIS = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let proximoId = 0;
let pendentes = [];
const ouvintes = new Set();
const avisar = () => { ouvintes.forEach(fn => fn([...pendentes])); };

export function confirmarExcecaoRaca({ mensagem, nomePoder, titulo } = {}) {
    if (ouvintes.size === 0) {
        return Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(String(mensagem || 'Raça sem acesso: conceder como exceção?')) : false);
    }
    return new Promise((resolve) => {
        proximoId += 1;
        pendentes = [...pendentes, { id: proximoId, mensagem: String(mensagem || ''), nomePoder: nomePoder || '', titulo: titulo || 'Raça sem acesso', resolve }];
        avisar();
    });
}

// Gancho para componentes: devolve a função estável do serviço.
export function useConfirmarExcecaoRaca() {
    return useCallback((dados) => confirmarExcecaoRaca(dados), []);
}

// Janela em si (também exportada para teste): aoConceder / aoCancelar.
export function DialogoExcecaoRaca({ titulo = 'Raça sem acesso', mensagem = '', nomePoder = '', aoConceder, aoCancelar }) {
    const caixaRef = useRef(null);
    const cancelarRef = useRef(null);
    const aoCancelarRef = useRef(aoCancelar);
    aoCancelarRef.current = aoCancelar;
    const texto = String(mensagem || '').replace(PERGUNTA_FINAL, '');

    useEffect(() => {
        const anterior = document.activeElement;
        // Foco inicial no "Cancelar": a escolha segura (conceder é a exceção).
        if (cancelarRef.current) cancelarRef.current.focus();
        const aoTeclar = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (aoCancelarRef.current) aoCancelarRef.current(); return; }
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
            if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) anterior.focus();
        };
    }, []);

    return createPortal(
        <div className="excecao-raca-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget && aoCancelar) aoCancelar(); }}>
            <div ref={caixaRef} className="excecao-raca-caixa" role="dialog" aria-modal="true" aria-labelledby="excecao-raca-titulo" aria-describedby="excecao-raca-mensagem">
                <h3 id="excecao-raca-titulo" className="excecao-raca-titulo">🧬 {titulo}</h3>
                {nomePoder ? <p className="excecao-raca-poder">Habilidade de Raça: <strong>{nomePoder}</strong></p> : null}
                <p id="excecao-raca-mensagem" className="excecao-raca-mensagem">{texto}</p>
                <p className="excecao-raca-pergunta">Conceder esta Habilidade como exceção do Mestre? Ela ficará marcada com o selo &quot;Exceção do Mestre&quot;.</p>
                <div className="excecao-raca-acoes">
                    <button type="button" ref={cancelarRef} className="btn-neon excecao-raca-btn" onClick={aoCancelar}>Cancelar</button>
                    <button type="button" className="btn-neon btn-gold excecao-raca-btn" onClick={aoConceder}>Conceder como exceção</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// Montar uma vez (App). Mostra um pedido por vez; os demais esperam na fila.
export function ConfirmarExcecaoRacaHost() {
    const [fila, setFila] = useState([]);
    useEffect(() => {
        ouvintes.add(setFila);
        setFila([...pendentes]);
        return () => {
            ouvintes.delete(setFila);
            // Último host saiu: quem ainda espera conta como "Cancelar".
            if (ouvintes.size === 0 && pendentes.length > 0) {
                const soltos = pendentes; pendentes = [];
                soltos.forEach(p => p.resolve(false));
            }
        };
    }, []);
    const responder = useCallback((pedido, valor) => {
        pendentes = pendentes.filter(p => p.id !== pedido.id);
        pedido.resolve(valor);
        avisar();
    }, []);
    const atual = fila[0];
    if (!atual) return null;
    return <DialogoExcecaoRaca key={atual.id} titulo={atual.titulo} mensagem={atual.mensagem} nomePoder={atual.nomePoder}
        aoConceder={() => responder(atual, true)} aoCancelar={() => responder(atual, false)} />;
}
