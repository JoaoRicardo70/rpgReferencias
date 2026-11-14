import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { descreverPendencias } from '../../core/aprovacaoPermanente';

// ✅ DIÁLOGO DO MESTRE/CO-MESTRE AO ENCERRAR O COMBATE: libera ou recusa o Poder PERMANENTE que a Adaptação / Verg Avesta e seus derivados
// geraram na luta (core/aprovacaoPermanente.js). Um controle por personagem (Liberar já vem marcado), "Liberar todos", "Recusar todos",
// "Confirmar e encerrar" e "Cancelar" (cancelar NÃO encerra o combate). Quem abre é o MapaFormContext; aqui só há apresentação e escolha.
// Props: itens [{ nome, pendencias }], titulo, aoConfirmar(decisoes { [nome]: 'liberar'|'recusar' }), aoCancelar().
const fmtPerc = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

export default function AprovacaoGanhosPermanentes({ itens, titulo = 'Encerrar combate', aoConfirmar, aoCancelar }) {
    const lista = useMemo(() => (Array.isArray(itens) ? itens : []), [itens]);
    const [decisoes, setDecisoes] = useState(() => Object.fromEntries(lista.map(i => [i.nome, 'liberar'])));

    const caixaRef = useRef(null);
    const definir = useCallback((nome, valor) => setDecisoes(prev => ({ ...prev, [nome]: valor })), []);
    const todos = useCallback((valor) => setDecisoes(Object.fromEntries(lista.map(i => [i.nome, valor]))), [lista]);
    const confirmar = useCallback(() => { if (typeof aoConfirmar === 'function') aoConfirmar({ ...decisoes }); }, [aoConfirmar, decisoes]);
    const cancelar = useCallback(() => { if (typeof aoCancelar === 'function') aoCancelar(); }, [aoCancelar]);

    // Acessibilidade: foco inicial no diálogo, Tab circula dentro dele, Esc cancela e o foco volta a quem o tinha ao fechar.
    useEffect(() => {
        const anterior = typeof document !== 'undefined' ? document.activeElement : null;
        const caixa = caixaRef.current;
        if (caixa && typeof caixa.focus === 'function') caixa.focus();
        return () => { if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) anterior.focus(); };
    }, []);
    const aoTeclar = useCallback((e) => {
        if (e.key === 'Escape') { e.stopPropagation(); cancelar(); return; }
        if (e.key !== 'Tab' || !caixaRef.current) return;
        const foc = Array.from(caixaRef.current.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled);
        if (foc.length === 0) return;
        const primeiro = foc[0]; const ultimo = foc[foc.length - 1];
        const ativo = document.activeElement;
        if (e.shiftKey && (ativo === primeiro || ativo === caixaRef.current)) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && ativo === ultimo) { e.preventDefault(); primeiro.focus(); }
    }, [cancelar]);

    if (lista.length === 0 || typeof document === 'undefined' || !document.body) return null;

    return createPortal(
        <div className="aprovacao-fundo" role="dialog" aria-modal="true" aria-label="Liberar ganhos permanentes">
            <div className="aprovacao-caixa" ref={caixaRef} tabIndex={-1} onKeyDown={aoTeclar}>
                <h3 className="aprovacao-titulo">✅ Liberar ganhos permanentes?</h3>
                <p className="aprovacao-contexto">
                    {titulo}: a Adaptação / Verg Avesta (e derivados, como o Ego Superior) deste combate podem virar Poder PERMANENTE.
                    Se você <strong>recusar</strong>, o personagem volta ao Poder que tinha antes de o combate começar.
                </p>
                <div className="aprovacao-lista">
                    {lista.map(({ nome, pendencias }) => {
                        const valor = decisoes[nome] || 'liberar';
                        const ad = pendencias && pendencias.adaptacao;
                        const de = pendencias && pendencias.derivados;
                        return (
                            <div key={nome} className={`aprovacao-item aprovacao-item--${valor}`} data-testid={`aprovacao-item-${nome}`}>
                                <div className="aprovacao-item-info">
                                    <strong className="aprovacao-item-nome">{nome}</strong>
                                    {ad && <span className="aprovacao-item-linha">Adaptação: média de +{fmtPerc(ad.pct)}% em {ad.turnos} {ad.turnos === 1 ? 'turno' : 'turnos'}</span>}
                                    {de && <span className="aprovacao-item-linha">Derivados: {descreverPendencias({ derivados: de })}</span>}
                                </div>
                                <div className="aprovacao-item-controle" role="radiogroup" aria-label={`Decisão para ${nome}`}>
                                    <label className={`aprovacao-opcao aprovacao-opcao--liberar${valor === 'liberar' ? ' marcada' : ''}`}>
                                        <input type="radio" name={`aprovacao-${nome}`} value="liberar" checked={valor === 'liberar'} onChange={() => definir(nome, 'liberar')} /> Liberar
                                    </label>
                                    <label className={`aprovacao-opcao aprovacao-opcao--recusar${valor === 'recusar' ? ' marcada' : ''}`}>
                                        <input type="radio" name={`aprovacao-${nome}`} value="recusar" checked={valor === 'recusar'} onChange={() => definir(nome, 'recusar')} /> Recusar
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="aprovacao-lote">
                    <button type="button" className="btn-neon btn-green" onClick={() => todos('liberar')}>Liberar todos</button>
                    <button type="button" className="btn-neon btn-red" onClick={() => todos('recusar')}>Recusar todos</button>
                </div>
                <div className="aprovacao-botoes">
                    <button type="button" className="aprovacao-confirmar" onClick={confirmar}>Confirmar e encerrar</button>
                    <button type="button" className="aprovacao-cancelar" onClick={cancelar}>Cancelar</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
