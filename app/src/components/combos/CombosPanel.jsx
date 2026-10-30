import React, { useMemo, useState, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import {
    combosDaFicha, followUpsDaFicha, estadoDeCombo, efeitosDeCombos, proximoGolpeDoCombo, interromperCombo, zerarEstadoDeCombo,
    ajustarNivelFollowUp, nivelDoFollowUp, normalizarCombo, normalizarFollowUp, normalizarGolpe, exportarCombos, importarCombos,
    descreverBuff, rotuloAcaoGolpe, resumirCombo, golpesDoCombo, ACOES_GOLPE, LIMITES
} from '../../core/combos';
import { aplicarEscolhaCombo, acaoFaltando, definirEstadoDeCombo } from './aplicarCombo';
import EditorCombo from './EditorCombo';
import EditorFollowUp from './EditorFollowUp';

// 🥋 Combos e Follow Ups (core/combos.js): onde o jogador monta os Combos, vê em que ponto está e usa os Follow Ups.
// É opcional: sem nenhum Combo criado nada muda no resto do app. O aviso de escolha depois de um golpe que acerta é o ComboPrompt.
export default function CombosPanel() {
    // A ficha em foco: a minha, ou a do personagem que o Mestre abriu na Ficha Definitiva.
    const { ficha: minhaFicha, updateFicha, nome: meuNome } = useFichaAtiva();
    const salvarAtivo = useCallSaveAtivo();
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const [edicao, setEdicao] = useState(null);
    const [textoImportar, setTextoImportar] = useState('');
    const [avisosImportar, setAvisosImportar] = useState([]);
    const [custos, setCustos] = useState({});

    const combos = useMemo(() => combosDaFicha(minhaFicha), [minhaFicha]);
    const followUps = useMemo(() => followUpsDaFicha(minhaFicha), [minhaFicha]);
    const estado = useMemo(() => estadoDeCombo(minhaFicha), [minhaFicha]);
    const proximo = useMemo(() => proximoGolpeDoCombo(minhaFicha), [minhaFicha]);
    const buffsAtivos = useMemo(() => efeitosDeCombos(minhaFicha), [minhaFicha]);
    const comboAtivo = estado.ativo ? combos.find(c => c.id === estado.ativo.comboId) : null;

    const gravar = useCallback((fn) => { updateFicha(fn); salvarAtivo(); }, [updateFicha, salvarAtivo]);

    const salvarCombo = useCallback(() => {
        const c = normalizarCombo(edicao.dados);
        gravar((f) => {
            const lista = combosDaFicha(f);
            const i = lista.findIndex(x => x.id === c.id);
            if (i >= 0) lista[i] = c; else if (lista.length < LIMITES.combos) lista.push(c);
            f.combos = lista;
        });
        setEdicao(null);
    }, [edicao, gravar]);

    const salvarFollowUp = useCallback(() => {
        const fu = normalizarFollowUp(edicao.dados);
        gravar((f) => {
            const lista = followUpsDaFicha(f);
            const i = lista.findIndex(x => x.id === fu.id);
            if (i >= 0) lista[i] = fu; else if (lista.length < LIMITES.followUps) lista.push(fu);
            f.followUps = lista;
        });
        setEdicao(null);
    }, [edicao, gravar]);

    const excluirCombo = useCallback((c) => {
        if (!window.confirm(`Excluir o Combo "${c.nome}"?`)) return;
        gravar((f) => {
            f.combos = combosDaFicha(f).filter(x => x.id !== c.id);
            const e = estadoDeCombo(f);
            if (e.ativo && e.ativo.comboId === c.id) definirEstadoDeCombo(f, interromperCombo(e));
        });
    }, [gravar]);

    const excluirFollowUp = useCallback((fu) => {
        if (!window.confirm(`Excluir o Follow Up "${fu.nome}"?`)) return;
        gravar((f) => { f.followUps = followUpsDaFicha(f).filter(x => x.id !== fu.id); });
    }, [gravar]);

    // Aplica uma escolha (com aviso se faltar Ação), registra no feed e salva.
    const executar = useCallback((escolha) => {
        const custo = escolha.custo || escolha.golpe.acao;
        const falta = acaoFaltando(minhaFicha, custo);
        if (falta.length > 0 && !window.confirm(`Sem ${falta.join(' e ')} disponível. Usar mesmo assim?`)) return;
        let texto = '';
        gravar((f) => { texto = aplicarEscolhaCombo(f, escolha); });
        if (texto) enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto });
    }, [minhaFicha, gravar, meuNome]);

    const interromper = useCallback(() => {
        gravar((f) => { definirEstadoDeCombo(f, interromperCombo(estadoDeCombo(f))); });
        enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto: `🥋 ${meuNome} perdeu o fio do Combo (os buffs dele se perderam).` });
    }, [gravar, meuNome]);

    const encerrar = useCallback(() => {
        if (!window.confirm('Zerar os Combos e Follow Ups deste combate? Os buffs acumulados somem.')) return;
        gravar((f) => { definirEstadoDeCombo(f, zerarEstadoDeCombo()); });
        adicionarAviso('Combos zerados.', 'info');
    }, [gravar, adicionarAviso]);

    const exportar = useCallback(() => {
        const texto = JSON.stringify(exportarCombos(minhaFicha), null, 2);
        setTextoImportar(texto);
        const copiado = () => adicionarAviso('Combos copiados. Cole em outra ficha com "Importar".', 'info');
        try { navigator.clipboard?.writeText(texto).then(copiado).catch(() => { /* sem permissão: o texto fica na caixa */ }); } catch (e) { /* sem área de transferência: o texto fica na caixa */ }
    }, [minhaFicha, adicionarAviso]);

    const importar = useCallback(() => {
        const resultado = importarCombos(textoImportar, { combos, followUps });
        setAvisosImportar(resultado.avisos);
        if (resultado.combos.length === 0 && resultado.followUps.length === 0) return;
        const vagasCombos = Math.max(0, LIMITES.combos - combos.length);
        const vagasFollowUps = Math.max(0, LIMITES.followUps - followUps.length);
        const novosCombos = resultado.combos.slice(0, vagasCombos);
        const novosFollowUps = resultado.followUps.slice(0, vagasFollowUps);
        gravar((f) => {
            f.combos = [...combosDaFicha(f), ...novosCombos];
            f.followUps = [...followUpsDaFicha(f), ...novosFollowUps];
        });
        setTextoImportar('');
        const cortados = resultado.combos.length - novosCombos.length + resultado.followUps.length - novosFollowUps.length;
        adicionarAviso(`Importou ${novosCombos.length} Combo(s) e ${novosFollowUps.length} Follow Up(s)${cortados > 0 ? ` (${cortados} ficaram de fora: limite da ficha)` : ''}.`, cortados > 0 ? 'alerta' : 'info');
    }, [textoImportar, combos, followUps, gravar, adicionarAviso]);

    if (edicao && edicao.tipo === 'combo') {
        return <div className="combos-painel"><EditorCombo combo={edicao.dados} ficha={minhaFicha} onChange={(dados) => setEdicao({ ...edicao, dados })} onSalvar={salvarCombo} onCancelar={() => setEdicao(null)} /></div>;
    }
    if (edicao && edicao.tipo === 'followUp') {
        return <div className="combos-painel"><EditorFollowUp followUp={edicao.dados} combos={combos} ficha={minhaFicha} onChange={(dados) => setEdicao({ ...edicao, dados })} onSalvar={salvarFollowUp} onCancelar={() => setEdicao(null)} /></div>;
    }

    const vazio = combos.length === 0 && followUps.length === 0;

    return (
        <div className="combos-painel">
            {vazio && <p className="combo-vazio">Combos são sequências de golpes que dão buffs cada vez maiores. Crie o seu abaixo, ou importe de um texto. É opcional: sem Combos, nada muda.</p>}

            {!vazio && (
                <section className="combo-status" aria-label="Combo em andamento">
                    <h4>Em combate</h4>
                    {comboAtivo ? (
                        <>
                            <p><strong>{comboAtivo.nome}</strong> — golpe {estado.ativo.passo + 1} de {golpesDoCombo(comboAtivo).length} feito.</p>
                            {proximo && <p>Próximo: <strong>{proximo.golpe.nome || 'golpe'}</strong> ({rotuloAcaoGolpe(proximo.golpe.acao)}){proximo.ultimo ? ' — último golpe, conclui o Combo' : ''}</p>}
                            <div className="combo-acoes">
                                {proximo && <button type="button" className="btn-neon" onClick={() => executar({ tipo: 'avancar', combo: comboAtivo, golpe: proximo.golpe })}>✔ Acertou: {proximo.golpe.nome || 'próximo golpe'}</button>}
                                <button type="button" className="btn-neon combo-cancelar" onClick={interromper}>✖ Interromper Combo</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="combo-vazio">Nenhum Combo em andamento. Acerte um iniciador para começar.</p>
                            <div className="combo-acoes">
                                {combos.filter(c => c.iniciador.nome).map(c => (
                                    <button type="button" key={c.id} className="btn-neon" onClick={() => executar({ tipo: 'iniciar', combo: c, golpe: c.iniciador })}>▶ Iniciar {c.nome} ({c.iniciador.nome})</button>
                                ))}
                            </div>
                        </>
                    )}
                    <p className="combo-contagem">Combos finalizados neste combate: <strong>{estado.finalizados}</strong></p>
                    <div className="combo-buffs-ativos">
                        <span className="combo-rotulo">Buffs ativos</span>
                        {buffsAtivos.length === 0 ? <span className="combo-vazio">Nenhum.</span> : buffsAtivos.map((b, i) => <div key={i} className="combo-buff"><span>{b.nome}</span><span>{descreverBuff(b)}</span></div>)}
                    </div>
                    <button type="button" className="btn-neon combo-cancelar" onClick={encerrar}>🏁 Fim do combate (zerar Combos)</button>
                </section>
            )}

            <section aria-label="Meus Combos">
                <h4>Meus Combos</h4>
                {combos.map(c => (
                    <div key={c.id} className="combo-cartao">
                        <div><strong>{c.nome}</strong><span className="combo-resumo">{resumirCombo(c)}</span></div>
                        <div className="combo-acoes">
                            <button type="button" className="combo-mini" aria-label={`Editar o Combo ${c.nome}`} onClick={() => setEdicao({ tipo: 'combo', dados: c })}>✏️</button>
                            <button type="button" className="combo-mini" aria-label={`Excluir o Combo ${c.nome}`} onClick={() => excluirCombo(c)}>🗑</button>
                        </div>
                    </div>
                ))}
                <button type="button" className="btn-neon" disabled={combos.length >= LIMITES.combos} onClick={() => setEdicao({ tipo: 'combo', dados: normalizarCombo({ iniciador: normalizarGolpe({}), passos: [normalizarGolpe({})] }) })}>➕ Novo Combo</button>
            </section>

            <section aria-label="Follow Ups">
                <h4>Follow Ups</h4>
                {followUps.map(fu => {
                    const nivel = nivelDoFollowUp(fu, estado);
                    const custo = custos[fu.id] && fu.acoesPermitidas.includes(custos[fu.id]) ? custos[fu.id] : fu.acoesPermitidas[0];
                    return (
                        <div key={fu.id} className="combo-cartao">
                            <div>
                                <strong>{fu.nome}</strong>
                                <span className="combo-resumo">Nível {nivel + 1}/{fu.niveis.length}{estado.followUps[fu.id]?.ativo ? ' · em uso' : ''}</span>
                                <span className="combo-nivel">
                                    <button type="button" className="combo-mini" aria-label={`Diminuir o nível de ${fu.nome}`} onClick={() => gravar((f) => { definirEstadoDeCombo(f, ajustarNivelFollowUp(estadoDeCombo(f), fu.id, -1)); })}>−</button>
                                    <button type="button" className="combo-mini" aria-label={`Aumentar o nível de ${fu.nome}`} onClick={() => gravar((f) => { definirEstadoDeCombo(f, ajustarNivelFollowUp(estadoDeCombo(f), fu.id, 1)); })}>+</button>
                                </span>
                            </div>
                            <div className="combo-acoes">
                                <select className="input-neon" aria-label={`Pagar ${fu.nome} com`} value={custo} onChange={(e) => setCustos(c => ({ ...c, [fu.id]: e.target.value }))}>
                                    {fu.acoesPermitidas.map(a => <option key={a} value={a}>{ACOES_GOLPE.find(x => x.id === a).rotulo}</option>)}
                                </select>
                                <button type="button" className="btn-neon" onClick={() => executar({ tipo: 'followUp', followUp: fu, golpe: fu, custo })}>↪ Usar</button>
                                <button type="button" className="combo-mini" aria-label={`Editar o Follow Up ${fu.nome}`} onClick={() => setEdicao({ tipo: 'followUp', dados: fu })}>✏️</button>
                                <button type="button" className="combo-mini" aria-label={`Excluir o Follow Up ${fu.nome}`} onClick={() => excluirFollowUp(fu)}>🗑</button>
                            </div>
                        </div>
                    );
                })}
                <button type="button" className="btn-neon" disabled={followUps.length >= LIMITES.followUps} onClick={() => setEdicao({ tipo: 'followUp', dados: normalizarFollowUp({}) })}>➕ Novo Follow Up</button>
            </section>

            <section aria-label="Importar e exportar">
                <h4>Importar / Exportar</h4>
                <textarea className="input-neon combo-texto" aria-label="Texto dos Combos (JSON)" rows={5} placeholder="Cole aqui os Combos exportados (JSON) para importar." value={textoImportar} onChange={(e) => setTextoImportar(e.target.value)} />
                <div className="combo-acoes">
                    <button type="button" className="btn-neon" onClick={importar} disabled={!textoImportar.trim()}>📥 Importar</button>
                    <button type="button" className="btn-neon" onClick={exportar} disabled={vazio}>📤 Exportar os meus</button>
                </div>
                {avisosImportar.map((a, i) => <p key={i} className="combo-aviso">⚠️ {a}</p>)}
            </section>
        </div>
    );
}
