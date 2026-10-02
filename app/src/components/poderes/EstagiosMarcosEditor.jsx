import React, { useCallback } from 'react';
import { efeitosDoEstagio, normalizarEstagios, marcoParaRascunho, getMaximoEstagio } from '../../core/estagios';

// Efeitos que valem no estágio n com a config AINDA em rascunho (pra "copiar do anterior").
function efeitosNoRascunho(efeitosBase, cfgRascunho, n) {
    const poder = { estagios: { ...normalizarEstagios(cfgRascunho), habilitado: true } };
    return efeitosDoEstagio(efeitosBase, poder, n).map(e => ({ ...e }));
}

// 🔀 "Mudanças em estágios específicos" (core/estagios.js > marcos): a partir do estágio escolhido,
// os efeitos ativos passam a ser a lista daquele marco (ex.: 7º Portão = MGeral 120 + MÚnico 1.5).
export default function EstagiosMarcosEditor({ estagiosEditor, setEstagiosEditor, efeitosBase, atributos, propriedades }) {
    const marcos = estagiosEditor.marcos || [];
    const crescimentoGeral = estagiosEditor.crescimento;
    const fadigaGeral = estagiosEditor.fadigaPorEstagio;

    const salvarMarcos = useCallback((lista) => setEstagiosEditor({ marcos: lista }), [setEstagiosEditor]);
    const alterarMarco = useCallback((chave, parcial) => {
        salvarMarcos(marcos.map(m => (m.chave === chave ? { ...m, ...parcial } : m)));
    }, [marcos, salvarMarcos]);

    const adicionarMarco = useCallback(() => {
        const ultimo = marcos.reduce((mx, m) => Math.max(mx, parseInt(m.estagio, 10) || 1), 1);
        const estagio = ultimo + 1;
        salvarMarcos([...marcos, marcoParaRascunho({
            estagio,
            efeitos: efeitosNoRascunho(efeitosBase, estagiosEditor, estagio - 1),
        })]);
    }, [marcos, efeitosBase, estagiosEditor, salvarMarcos]);

    const copiarDoAnterior = useCallback((m) => {
        const est = parseInt(m.estagio, 10);
        if (!Number.isFinite(est) || est < 2) return;
        // Copia o que valia no estágio anterior SEM contar este próprio marco.
        const semEste = { ...estagiosEditor, marcos: marcos.filter(x => x.chave !== m.chave) };
        alterarMarco(m.chave, { efeitos: efeitosNoRascunho(efeitosBase, semEste, est - 1) });
    }, [estagiosEditor, marcos, efeitosBase, alterarMarco]);

    const alterarEfeito = useCallback((m, i, parcial) => alterarMarco(m.chave, { efeitos: m.efeitos.map((e, j) => (j === i ? { ...e, ...parcial } : e)) }), [alterarMarco]);
    const removerEfeito = useCallback((m, i) => alterarMarco(m.chave, { efeitos: m.efeitos.filter((_, j) => j !== i) }), [alterarMarco]);
    const adicionarEfeito = useCallback((m) => alterarMarco(m.chave, { efeitos: [...m.efeitos, { nome: '', atributo: 'geral', propriedade: 'mgeral', valor: '' }] }), [alterarMarco]);

    // Avisos: mudança depois do último estágio (nunca vale) ou dois no mesmo estágio (só o último vale).
    const maximo = getMaximoEstagio({ estagios: normalizarEstagios(estagiosEditor) });
    const avisoDoMarco = (m) => {
        const est = parseInt(m.estagio, 10);
        if (!Number.isFinite(est) || est < 2) return 'Use o 2º estágio ou acima (o 1º são os Efeitos Ativos da técnica).';
        if (est > maximo) return `Acima do último estágio (${maximo}º): não terá efeito.`;
        const repetidos = marcos.filter(x => parseInt(x.estagio, 10) === est);
        if (repetidos.length > 1 && repetidos[repetidos.length - 1].chave !== m.chave) return `Outra mudança também está no ${est}º; só a última vale.`;
        return '';
    };

    return (
        <div className="estagios-marcos">
            <div className="estagios-marcos-titulo">🔀 Mudanças em estágios específicos <span>(opcional)</span></div>
            <p className="estagios-editor-explica">
                Use quando um estágio não segue o crescimento normal. Ex.: Portões Internos, MGeral 10x no 1º com crescimento 100% (até 60x no 6º), e uma mudança no <strong>7º</strong> com MGeral 120 + MÚnico 1.5. A partir do estágio escolhido os efeitos ativos passam a ser os da mudança, e continuam crescendo dali.
            </p>

            {marcos.map(m => (
                <div key={m.chave} className="estagio-marco">
                    <div className="estagio-marco-topo">
                        <label className="estagio-marco-campo">
                            <span>A partir do estágio</span>
                            <input type="number" min="2" value={m.estagio} onChange={e => alterarMarco(m.chave, { estagio: e.target.value })} />
                        </label>
                        <label className="estagio-marco-campo" title="Vazio = usa o crescimento geral">
                            <span>Crescimento (%)</span>
                            <input type="number" min="0" placeholder={`igual (${crescimentoGeral || 0})`} value={m.crescimento} onChange={e => alterarMarco(m.chave, { crescimento: e.target.value })} />
                        </label>
                        <label className="estagio-marco-campo" title="Vazio = usa a Fadiga por estágio geral">
                            <span>😮‍💨 Fadiga/estágio</span>
                            <input type="number" min="0" step="0.5" placeholder={`igual (${fadigaGeral || 0})`} value={m.fadigaPorEstagio} onChange={e => alterarMarco(m.chave, { fadigaPorEstagio: e.target.value })} />
                        </label>
                        <button type="button" className="estagio-marco-remover" onClick={() => salvarMarcos(marcos.filter(x => x.chave !== m.chave))} title="Remover esta mudança">✖</button>
                    </div>

                    {avisoDoMarco(m) && <p className="estagio-marco-aviso">⚠️ {avisoDoMarco(m)}</p>}
                    {m.efeitos.length === 0 && <p className="estagio-marco-vazio">Sem efeitos: a partir deste estágio a técnica não dá bônus.</p>}
                    {m.efeitos.map((ef, i) => (
                        <div key={i} className="estagio-marco-efeito">
                            <input type="text" placeholder="Nome (opc.)" value={ef.nome || ''} onChange={e => alterarEfeito(m, i, { nome: e.target.value })} />
                            <select value={ef.atributo} onChange={e => alterarEfeito(m, i, { atributo: e.target.value })}>
                                {atributos.map(grupo => (
                                    <optgroup key={grupo.label} label={grupo.label}>
                                        {grupo.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                            <select value={ef.propriedade} onChange={e => alterarEfeito(m, i, { propriedade: e.target.value })}>
                                {propriedades.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                            </select>
                            <input type="text" placeholder="Valor" className="estagio-marco-valor" value={ef.valor} onChange={e => alterarEfeito(m, i, { valor: e.target.value })} />
                            <label className="estagio-marco-fixo" title="Fixo: este efeito não cresce nos estágios seguintes">
                                <input type="checkbox" checked={!!ef.fixo} onChange={e => alterarEfeito(m, i, { fixo: e.target.checked })} /> fixo
                            </label>
                            <button type="button" onClick={() => removerEfeito(m, i)} title="Remover efeito">✖</button>
                        </div>
                    ))}
                    <div className="estagio-marco-acoes">
                        <button type="button" onClick={() => adicionarEfeito(m)}>+ Efeito</button>
                        <button type="button" onClick={() => copiarDoAnterior(m)} title="Substitui a lista pelos efeitos que valem no estágio anterior">⧉ Copiar do estágio anterior</button>
                    </div>
                </div>
            ))}

            <button type="button" className="estagios-marcos-adicionar" onClick={adicionarMarco}>+ Adicionar mudança em um estágio</button>
        </div>
    );
}
