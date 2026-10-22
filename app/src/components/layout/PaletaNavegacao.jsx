import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import useStore from '../../stores/useStore';
import { listarDestinos, filtrarDestinos, registrarVisita, recentesValidos, destinoDoAtalho } from '../../core/navegacao';

const CHAVE_RECENTES = 'rpgNavRecentes';

function lerRecentes() {
    try {
        const r = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]');
        return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
}

// ⌨️ Paleta "Ir para...": Ctrl+K (ou o 🔎 da barra) abre uma busca com todas as abas; setas + Enter navegam. Mostra as abas
// visitadas por último no topo. Alt+1..9 pulam direto pra N-ésima aba da barra. Fica sempre montada (escuta o teclado).
export default function PaletaNavegacao() {
    const abaAtiva = useStore(s => s.abaAtiva);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const isMestre = useStore(s => s.isMestre);
    const modoNavegacao = useStore(s => s.modoNavegacao);

    const [aberta, setAberta] = useState(false);
    const [busca, setBusca] = useState('');
    const [indice, setIndice] = useState(0);
    const [recentes, setRecentes] = useState(lerRecentes);
    const inputRef = useRef(null);

    const destinos = useMemo(() => listarDestinos({ isMestre, modo: modoNavegacao }), [isMestre, modoNavegacao]);

    // Registra cada aba visitada.
    useEffect(() => {
        if (!abaAtiva) return;
        setRecentes(atual => registrarVisita(atual, abaAtiva));
    }, [abaAtiva]);
    useEffect(() => {
        try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(recentes)); } catch (e) { /* sem localStorage */ }
    }, [recentes]);

    const lista = useMemo(() => {
        if (busca.trim()) return filtrarDestinos(destinos, busca);
        const rec = recentesValidos(recentes, destinos, abaAtiva);
        const idsRec = new Set(rec.map(r => r.id));
        return [...rec, ...destinos.filter(d => !idsRec.has(d.id))];
    }, [busca, destinos, recentes, abaAtiva]);

    const fechar = useCallback(() => { setAberta(false); setBusca(''); setIndice(0); }, []);
    // Tira o foco do campo em edição ANTES de trocar de aba: o blur confirma o rascunho (campos que só gravam ao sair).
    const irPara = useCallback((destino) => {
        if (!destino) return;
        if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
        setAbaAtiva(destino.id);
        fechar();
    }, [setAbaAtiva, fechar]);

    // Atalhos globais: Ctrl/Cmd+K abre/fecha; Alt+1..9 vai direto; evento do botão 🔎 da barra.
    useEffect(() => {
        const tecla = (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'k') {
                e.preventDefault();
                if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
                setAberta(a => !a);
                setBusca('');
                setIndice(0);
                return;
            }
            // e.code (Digit1..9): funciona também no Mac, onde Option+número muda o caractere de e.key.
            const tecla9 = /^Digit([1-9])$/.exec(e.code || '');
            if (e.altKey && !e.ctrlKey && !e.metaKey && tecla9) {
                const d = destinoDoAtalho(destinos, tecla9[1]);
                if (d) {
                    e.preventDefault();
                    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
                    setAbaAtiva(d.id);
                }
            }
        };
        const abrir = () => { setAberta(true); setBusca(''); setIndice(0); };
        window.addEventListener('keydown', tecla);
        window.addEventListener('abrir-paleta-navegacao', abrir);
        return () => {
            window.removeEventListener('keydown', tecla);
            window.removeEventListener('abrir-paleta-navegacao', abrir);
        };
    }, [destinos, setAbaAtiva]);

    useEffect(() => { if (aberta && inputRef.current) inputRef.current.focus(); }, [aberta]);
    useEffect(() => { setIndice(0); }, [busca]);

    const aoTeclarNaBusca = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); fechar(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setIndice(i => Math.min(i + 1, Math.max(0, lista.length - 1))); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setIndice(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); irPara(lista[indice]); }
    };

    if (!aberta) return null;

    return (
        <div className="paleta-fundo" onMouseDown={fechar}>
            <div className="paleta-caixa" role="dialog" aria-modal="true" aria-label="Ir para" onMouseDown={e => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    className="input-neon paleta-busca"
                    type="text"
                    placeholder="Ir para... (digite o nome da aba)"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    onKeyDown={aoTeclarNaBusca}
                />
                <div className="paleta-lista" role="listbox">
                    {lista.length === 0 && <div className="paleta-vazio">Nenhuma aba encontrada.</div>}
                    {lista.map((d, i) => (
                        <button
                            key={d.id}
                            type="button"
                            role="option"
                            aria-selected={i === indice}
                            className={`paleta-item${i === indice ? ' selecionado' : ''}${d.id === abaAtiva ? ' atual' : ''}`}
                            onMouseEnter={() => setIndice(i)}
                            onClick={() => irPara(d)}
                        >
                            <span className="paleta-icone">{d.icone}</span>
                            <span className="paleta-nome">{d.nome}</span>
                            <span className="paleta-grupo">{d.grupoNome}</span>
                        </button>
                    ))}
                </div>
                <div className="paleta-dica">↑↓ escolher · Enter ir · Esc fechar · Alt+1…9 pula direto</div>
            </div>
        </div>
    );
}
