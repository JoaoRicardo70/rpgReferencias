import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { descreverPendencias, FONTES_DECISAO } from '../../core/aprovacaoPermanente';
import { limitarPctFinalZenkai } from '../../core/zenkai';

// ✅ DIÁLOGO DO MESTRE/CO-MESTRE AO ENCERRAR O COMBATE: libera ou recusa o Poder PERMANENTE que a Adaptação, o Zenkai e os Derivados de gatilhos (Verg Avesta,
// Ego Superior...) geraram na luta (core/aprovacaoPermanente.js). Cada personagem tem SEÇÕES SEPARADAS (Adaptação / Zenkai / Derivados), CADA UMA com o seu
// Liberar/Recusar (radios nativos; Liberar já vem marcado), mais "Liberar/Recusar tudo" do personagem, os botões globais "Liberar todos" / "Recusar todos",
// "Confirmar e encerrar" e "Cancelar" (cancelar NÃO encerra o combate). Recusar uma fonte descarta SÓ ela. Quem abre é o MapaFormContext.
// 💥 ZENKAI: valor SUGERIDO (em %), detalhamento por fator e um campo numérico EDITÁVEL (0–100); Liberar aplica o valor do campo. Campo vazio/inválido = o sugerido.
// Props: itens [{ nome, pendencias }], titulo, aoConfirmar(decisoes { [nome]: { adaptacao, zenkai, derivados } cada uma 'liberar'|'recusar' },
// ajustes { [nome]: pctFinalZenkai }), aoCancelar().
const fmtPerc = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const ROTULOS = { adaptacao: 'Adaptação', zenkai: 'Zenkai', derivados: 'Derivados de gatilhos' };

// Fontes que têm pendência neste item (as seções que aparecem).
const fontesDoItem = (pendencias) => FONTES_DECISAO.filter(f => !!(pendencias && pendencias[f]));
const decisaoInicial = () => Object.fromEntries(FONTES_DECISAO.map(f => [f, 'liberar']));

// Par de radios nativos Liberar/Recusar (mesmo `name` = um grupo; setas do teclado alternam). Fora do componente principal para não remontar a cada render (foco).
function RadiosFonte({ nomeGrupo, valor, aoMudar, rotulo, classe }) {
    return (
        <div className={`aprovacao-item-controle ${classe || ''}`} role="radiogroup" aria-label={rotulo}>
            <label className={`aprovacao-opcao aprovacao-opcao--liberar${valor === 'liberar' ? ' marcada' : ''}`}>
                <input type="radio" name={nomeGrupo} value="liberar" checked={valor === 'liberar'} onChange={() => aoMudar('liberar')} /> Liberar
            </label>
            <label className={`aprovacao-opcao aprovacao-opcao--recusar${valor === 'recusar' ? ' marcada' : ''}`}>
                <input type="radio" name={nomeGrupo} value="recusar" checked={valor === 'recusar'} onChange={() => aoMudar('recusar')} /> Recusar
            </label>
        </div>
    );
}

export default function AprovacaoGanhosPermanentes({ itens, titulo = 'Encerrar combate', aoConfirmar, aoCancelar }) {
    const lista = useMemo(() => (Array.isArray(itens) ? itens : []), [itens]);
    const [decisoes, setDecisoes] = useState(() => Object.fromEntries(lista.map(i => [i.nome, decisaoInicial()])));

    const [zenkaiValores, setZenkaiValores] = useState(() => Object.fromEntries(lista.filter(i => i.pendencias && i.pendencias.zenkai).map(i => [i.nome, String(i.pendencias.zenkai.pct)])));
    const definirZenkai = useCallback((nome, texto) => setZenkaiValores(prev => ({ ...prev, [nome]: texto })), []);
    const caixaRef = useRef(null);
    const definirFonte = useCallback((nome, fonte, valor) => setDecisoes(prev => ({ ...prev, [nome]: { ...(prev[nome] || {}), [fonte]: valor } })), []);
    const tudoDoItem = useCallback((nome, valor) => setDecisoes(prev => ({ ...prev, [nome]: Object.fromEntries(FONTES_DECISAO.map(f => [f, valor])) })), []);
    const todos = useCallback((valor) => setDecisoes(Object.fromEntries(lista.map(i => [i.nome, Object.fromEntries(FONTES_DECISAO.map(f => [f, valor]))]))), [lista]);
    const confirmar = useCallback(() => {
        if (typeof aoConfirmar !== 'function') return;
        const ajustes = {};
        lista.forEach((i) => { const z = i.pendencias && i.pendencias.zenkai; if (z) ajustes[i.nome] = limitarPctFinalZenkai(zenkaiValores[i.nome], z.pct); });
        const saida = {};
        lista.forEach((i) => { saida[i.nome] = Object.fromEntries(FONTES_DECISAO.map(f => [f, (decisoes[i.nome] && decisoes[i.nome][f]) || 'liberar'])); });
        aoConfirmar(saida, ajustes);
    }, [aoConfirmar, decisoes, lista, zenkaiValores]);
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
                    {titulo}: a Adaptação, o Zenkai e os derivados de gatilhos (Verg Avesta, Ego Superior...) deste combate podem virar Poder PERMANENTE.
                    Cada fonte é decidida separadamente: se você <strong>recusar</strong> uma, só ela é descartada (a Adaptação e o Zenkai somem; os derivados voltam ao Poder de antes do combate).
                </p>
                <div className="aprovacao-lista">
                    {lista.map(({ nome, pendencias }) => {
                        const dec = decisoes[nome] || decisaoInicial();
                        const fontes = fontesDoItem(pendencias);
                        const valores = fontes.map(f => dec[f] || 'liberar');
                        const geral = valores.every(v => v === 'liberar') ? 'liberar' : (valores.every(v => v === 'recusar') ? 'recusar' : 'misto');
                        const ad = pendencias && pendencias.adaptacao;
                        const de = pendencias && pendencias.derivados;
                        const zk = pendencias && pendencias.zenkai;
                        return (
                            <div key={nome} className={`aprovacao-item aprovacao-item--${geral}`} data-testid={`aprovacao-item-${nome}`}>
                                <div className="aprovacao-item-cabeca">
                                    <strong className="aprovacao-item-nome">{nome}</strong>
                                    <RadiosFonte nomeGrupo={`aprovacao-${nome}`} valor={geral} aoMudar={(v) => tudoDoItem(nome, v)} rotulo={`Tudo de ${nome}`} classe="aprovacao-item-tudo" />
                                </div>
                                {ad && (
                                    <div className="aprovacao-secao" data-testid={`aprovacao-secao-${nome}-adaptacao`}>
                                        <div className="aprovacao-item-info">
                                            <span className="aprovacao-secao-titulo">🧬 {ROTULOS.adaptacao}</span>
                                            <span className="aprovacao-item-linha">Adaptação: média de +{fmtPerc(ad.pct)}% em {ad.turnos} {ad.turnos === 1 ? 'turno' : 'turnos'}</span>
                                        </div>
                                        <RadiosFonte nomeGrupo={`aprovacao-${nome}-adaptacao`} valor={dec.adaptacao || 'liberar'} aoMudar={(v) => definirFonte(nome, 'adaptacao', v)} rotulo={`${ROTULOS.adaptacao} de ${nome}`} />
                                    </div>
                                )}
                                {zk && (
                                    <div className="aprovacao-secao aprovacao-zenkai" data-testid={`aprovacao-zenkai-${nome}`}>
                                        <div className="aprovacao-item-info">
                                            <span className="aprovacao-secao-titulo">💥 {ROTULOS.zenkai}</span>
                                            <span className="aprovacao-item-linha">💥 Zenkai sugerido: +{fmtPerc(zk.pct)}% (teto {fmtPerc(zk.teto)}%; {zk.turnos} {zk.turnos === 1 ? 'turno' : 'turnos'}; pontuação {fmtPerc(zk.score)})</span>
                                            <ul className="aprovacao-zenkai-fatores">
                                                {zk.componentes.filter(c => c.valor > 0).map(c => <li key={c.id}>{c.rotulo}: {c.detalhe} (peso {fmtPerc(c.peso)}, +{fmtPerc(c.contribuicao)})</li>)}
                                                <li>{zk.semOponente ? 'Oponente: sem dados (fator ×0,1)' : `Oponente: fator ×${fmtPerc(zk.fatorOponente)}`}</li>
                                                {zk.fatorDuracao < 1 && <li>Combate curto: fator ×{fmtPerc(zk.fatorDuracao)} ({zk.turnos} de {fmtPerc(zk.turnosMinimos)} turnos)</li>}
                                            </ul>
                                            <label className="aprovacao-zenkai-campo">Zenkai final (%) <span className="aprovacao-zenkai-dica">(vazio = sugerido; digite 0 para não conceder)</span>
                                                <input type="number" min="0" max="100" step="0.01" value={zenkaiValores[nome] ?? ''} onChange={e => definirZenkai(nome, e.target.value)} aria-label={`Zenkai de ${nome} (%)`} />
                                            </label>
                                        </div>
                                        <RadiosFonte nomeGrupo={`aprovacao-${nome}-zenkai`} valor={dec.zenkai || 'liberar'} aoMudar={(v) => definirFonte(nome, 'zenkai', v)} rotulo={`${ROTULOS.zenkai} de ${nome}`} />
                                    </div>
                                )}
                                {de && (
                                    <div className="aprovacao-secao" data-testid={`aprovacao-secao-${nome}-derivados`}>
                                        <div className="aprovacao-item-info">
                                            <span className="aprovacao-secao-titulo">🔔 {ROTULOS.derivados}</span>
                                            <span className="aprovacao-item-linha">Derivados: {descreverPendencias({ derivados: de })}</span>
                                        </div>
                                        <RadiosFonte nomeGrupo={`aprovacao-${nome}-derivados`} valor={dec.derivados || 'liberar'} aoMudar={(v) => definirFonte(nome, 'derivados', v)} rotulo={`${ROTULOS.derivados} de ${nome}`} />
                                    </div>
                                )}
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
