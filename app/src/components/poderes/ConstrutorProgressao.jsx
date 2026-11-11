import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePoderesForm } from './PoderesFormContext';
import { RECEITAS, obterReceita, paramsPadraoReceita, paramsReceita, conferirLimitesProgressao } from '../../core/receitasProgressao';

// ⚙️ "Progressão em combate": construtor genérico (qualquer Habilidade/Forma/Poder) de gatilhos + contadores a partir de uma receita.
// Só acrescenta ao RASCUNHO do poder (PoderesFormContext > adicionarProgressaoRascunho); a ficha só muda em "Gravar no Grimório".
const ETAPAS = ['Receita', 'Campos', 'Resumo'];

export default function ConstrutorProgressao() {
    const ctx = usePoderesForm();
    const [aberto, setAberto] = useState(false);
    const [etapa, setEtapa] = useState(0);
    const [receitaId, setReceitaId] = useState('');
    const [brutos, setBrutos] = useState({});
    const [resultado, setResultado] = useState(null);
    const [sujo, setSujo] = useState(false);
    const botaoRef = useRef(null);
    const painelRef = useRef(null);

    const receita = obterReceita(receitaId);
    const params = useMemo(() => (receita ? paramsReceita(receita, brutos) : null), [receita, brutos]);
    const ctxProgressao = ctx && ctx.ctxProgressao;

    const plano = useMemo(() => {
        if (!receita || !ctxProgressao) return null;
        const r = receita.construir(params, ctxProgressao);
        return { r, conf: conferirLimitesProgressao(r, ctxProgressao.existentes) };
    }, [receita, params, ctxProgressao]);

    const abrir = useCallback(() => { setEtapa(0); setReceitaId(''); setBrutos({}); setResultado(null); setSujo(false); setAberto(true); }, []);
    const fechar = useCallback(() => {
        setAberto(false);
        setTimeout(() => { if (botaoRef.current) botaoRef.current.focus(); }, 0);
    }, []);

    useEffect(() => { if (aberto && painelRef.current) painelRef.current.focus(); }, [aberto]);

    const aoTeclar = useCallback((e) => {
        if (e.key === 'Escape') { e.stopPropagation(); fechar(); return; }
        if (e.key !== 'Tab' || !painelRef.current) return;
        const focaveis = Array.from(painelRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
        if (focaveis.length === 0) { e.preventDefault(); painelRef.current.focus(); return; }
        const primeiro = focaveis[0]; const ultimo = focaveis[focaveis.length - 1];
        const ativo = document.activeElement;
        if (e.shiftKey && (ativo === primeiro || ativo === painelRef.current)) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && ativo === ultimo) { e.preventDefault(); primeiro.focus(); }
    }, [fechar]);

    const aoClicarNoFundo = useCallback((e) => { if (e.target === e.currentTarget && !sujo) fechar(); }, [sujo, fechar]);

    const escolher = useCallback((r) => { setReceitaId(r.id); setBrutos(paramsPadraoReceita(r)); setSujo(false); setEtapa(1); }, []);
    const mudar = useCallback((id, valor) => { setSujo(true); setBrutos(b => ({ ...b, [id]: valor })); }, []);

    const adicionar = useCallback(() => {
        if (!plano || !ctx || !ctx.adicionarProgressaoRascunho) return;
        const conf = ctx.adicionarProgressaoRascunho(plano.r);
        setResultado(conf.ok
            ? { ok: true, mensagem: `Adicionado ao rascunho: ${plano.r.gatilhos.length} gatilho(s) e ${plano.r.contadores.length} contador(es). Revise abaixo e use "Gravar no Grimório" para guardar.`, avisos: conf.avisos }
            : { ok: false, mensagem: conf.erro, avisos: conf.avisos });
    }, [plano, ctx]);

    if (!ctx || !ctx.adicionarProgressaoRascunho) return null;

    const painel = aberto && (
        <div className="progressao-fundo" onMouseDown={aoClicarNoFundo} onKeyDown={aoTeclar}>
            <div className="progressao-painel fade-in" role="dialog" aria-modal="true" aria-labelledby="progressao-titulo-id" tabIndex={-1} ref={painelRef}>
                <div className="progressao-topo">
                    <h3 className="progressao-titulo" id="progressao-titulo-id">⚙️ Progressão em combate</h3>
                    <button type="button" className="progressao-fechar" onClick={fechar} aria-label="Fechar">✖</button>
                </div>
                <ol className="progressao-etapas">
                    {ETAPAS.map((rotulo, i) => <li key={rotulo} className={`progressao-etapa${i === etapa ? ' ativa' : ''}${i < etapa ? ' feita' : ''}`}>{i + 1}. {rotulo}</li>)}
                </ol>

                {resultado ? (
                    <div className="progressao-corpo">
                        <div className={`progressao-resultado ${resultado.ok ? 'ok' : 'erro'}`} role="status">{resultado.ok ? '✅' : '⚠️'} {resultado.mensagem}</div>
                        {(resultado.avisos || []).length > 0 && <ul className="progressao-avisos">{resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                        <div className="progressao-acoes">
                            {!resultado.ok && <button type="button" className="btn-neon" onClick={() => setResultado(null)}>Voltar</button>}
                            <button type="button" className="btn-neon" onClick={fechar}>Fechar</button>
                        </div>
                    </div>
                ) : etapa === 0 ? (
                    <div className="progressao-corpo">
                        <p className="progressao-dica">Serve para qualquer poder: escolha uma receita e o app monta os gatilhos e contadores. Nada é gravado agora: eles entram no formulário, onde você pode editar tudo.</p>
                        <div className="progressao-lista">
                            {RECEITAS.map(r => (
                                <button key={r.id} type="button" className="progressao-cartao" onClick={() => escolher(r)}>
                                    <strong>{r.nome}</strong>
                                    <span className="progressao-resumo">{r.resumo}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : etapa === 1 && receita ? (
                    <div className="progressao-corpo">
                        <p className="progressao-dica">{receita.resumo}</p>
                        <div className="progressao-campos">
                            {receita.campos.map(c => (
                                <label key={c.id} className="progressao-campo">
                                    <span>{c.rotulo}</span>
                                    {c.tipo === 'numero' ? (
                                        <input type="number" value={brutos[c.id] ?? c.padrao} min={c.min} max={c.max} step={c.passo || 1} onChange={e => mudar(c.id, e.target.value)} />
                                    ) : (
                                        <select value={brutos[c.id] ?? c.padrao} onChange={e => mudar(c.id, e.target.value)}>
                                            {c.opcoes.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                                        </select>
                                    )}
                                </label>
                            ))}
                        </div>
                        <div className="progressao-acoes">
                            <button type="button" className="btn-neon" onClick={() => setEtapa(0)}>Voltar</button>
                            <button type="button" className="btn-neon" onClick={() => setEtapa(2)}>Ver resumo</button>
                        </div>
                    </div>
                ) : receita && plano ? (
                    <div className="progressao-corpo">
                        <div className="progressao-resumo-caixa">
                            <strong>{receita.nome}</strong>
                            <ul>
                                <li>{plano.r.gatilhos.length} gatilho(s) {params.opcionais === 'sim' ? 'opcionais e desarmados' : 'automáticos e armados'}</li>
                                <li>{plano.r.contadores.length} contador(es)</li>
                                {plano.r.gatilhos.map(g => <li key={g.id} className="progressao-item">{g.nome}</li>)}
                            </ul>
                            {plano.conf.erro && <div className="progressao-resultado erro" role="alert">⚠️ {plano.conf.erro}</div>}
                            {plano.conf.avisos.length > 0 && <ul className="progressao-avisos">{plano.conf.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                        </div>
                        <div className="progressao-acoes">
                            <button type="button" className="btn-neon" onClick={() => setEtapa(1)}>Voltar</button>
                            <button type="button" className="btn-neon" disabled={!plano.conf.ok} onClick={adicionar}>Adicionar ao poder</button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );

    return (
        <div className="progressao-barra">
            <button type="button" ref={botaoRef} className="btn-neon grimorio-btn grimorio-btn--sm" onClick={abrir} title="Monta gatilhos e contadores de um aprimoramento constante durante o combate (entram no rascunho do poder)">⚙️ Progressão em combate</button>
            {painel && (typeof document !== 'undefined' && document.body ? createPortal(painel, document.body) : painel)}
        </div>
    );
}
