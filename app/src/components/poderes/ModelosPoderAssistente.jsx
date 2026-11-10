import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../stores/useStore';
import { useFichaAtiva, useSalvarImediatoAtivo } from '../Ficha Def/FichaAlvoContext';
import {
    MODELOS, ORIGENS_PODER, obterModelo, selecaoPadrao, paramsPadrao, normalizarSelecao, normalizarParams, normalizarOrigem,
    acharPoderDoModelo, planejarModelo, aplicarModeloNaFicha,
} from '../../core/modelosPoder';

// 🧩 "➕ Adicionar de modelo": assistente do MESTRE que cria de uma vez o poder + contadores + gatilhos de uma mecânica pronta
// (Ego Superior, Verg Avesta). Age na ficha mostrada (a própria ou a de outro personagem, via useFichaAtiva) e só aparece para o Mestre;
// aplicarModeloNaFicha confere o Mestre de novo. Poder do mesmo modelo já na ficha vira "Editar partes" (não duplica).
const ETAPAS = ['Modelo', 'Partes', 'Resumo'];

export default function ModelosPoderAssistente() {
    const isMestre = useStore(s => s.isMestre);
    const { ficha, updateFicha, nome } = useFichaAtiva();
    const salvarImediato = useSalvarImediatoAtivo();
    const [aberto, setAberto] = useState(false);
    const [etapa, setEtapa] = useState(0);
    const [modeloId, setModeloId] = useState('');
    const [selecao, setSelecao] = useState([]);
    const [params, setParams] = useState({});
    const [origem, setOrigem] = useState({ tipo: 'herdada', fonte: '' });
    const [criarOpcionais, setCriarOpcionais] = useState(false);
    const [resultado, setResultado] = useState(null);

    const modelo = obterModelo(modeloId);
    const existente = useMemo(() => (modelo ? acharPoderDoModelo(ficha, modelo.id) : null), [ficha, modelo]);

    const [sujo, setSujo] = useState(false); // a pessoa mexeu em partes/números/origem: clique no fundo não fecha
    const botaoAbrirRef = useRef(null);
    const painelRef = useRef(null);

    const abrir = useCallback(() => { setEtapa(0); setModeloId(''); setResultado(null); setCriarOpcionais(false); setSujo(false); setAberto(true); }, []);
    const fechar = useCallback(() => {
        setAberto(false);
        // devolve o foco ao botão que abriu (depois do desmonte do modal)
        setTimeout(() => { if (botaoAbrirRef.current) botaoAbrirRef.current.focus(); }, 0);
    }, []);

    // Foco inicial no modal ao abrir.
    useEffect(() => {
        if (aberto && painelRef.current) painelRef.current.focus();
    }, [aberto]);

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

    const aoClicarNoFundo = useCallback((e) => {
        if (e.target === e.currentTarget && !sujo) fechar();
    }, [sujo, fechar]);

    const escolher = useCallback((m) => {
        const atual = acharPoderDoModelo(ficha, m.id);
        setModeloId(m.id);
        setSujo(false);
        // "Editar partes": começa pelo que o poder já tem; modelo novo começa pelas partes padrão.
        setSelecao(atual ? normalizarSelecao(m, atual.modelo.partes) : selecaoPadrao(m));
        setParams(atual ? normalizarParams(m, atual.modelo.params) : paramsPadrao(m));
        setOrigem(normalizarOrigem(atual && atual.origem));
        setEtapa(1);
    }, [ficha]);

    const alternarParte = useCallback((id) => { setSujo(true); setSelecao(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])); }, []);
    const mudarParam = useCallback((id, valor) => { setSujo(true); setParams(p => ({ ...p, [id]: valor })); }, []);

    const plano = useMemo(() => (modelo ? planejarModelo(modelo.id, selecao, params, ficha, { origem, criarOpcionais }) : null), [modelo, selecao, params, ficha, origem, criarOpcionais]);

    const aplicar = useCallback(() => {
        if (!modelo || !isMestre) return;
        let res = null;
        updateFicha((f) => {
            res = aplicarModeloNaFicha(f, { modeloId: modelo.id, selecao, params, opcoes: { origem, criarOpcionais }, isMestre, id: Date.now() });
        });
        if (res && res.ok) salvarImediato().catch(() => {});
        setResultado(res || { ok: false, mensagem: 'Não foi possível aplicar.', avisos: [] });
    }, [modelo, isMestre, updateFicha, selecao, params, origem, criarOpcionais, salvarImediato]);

    if (!isMestre) return null;

    const painel = aberto && (
        <div className="modelo-poder-fundo" onMouseDown={aoClicarNoFundo} onKeyDown={aoTeclar}>
            <div className="modelo-poder-painel fade-in" role="dialog" aria-modal="true" aria-labelledby="modelo-poder-titulo-id" tabIndex={-1} ref={painelRef}>
                <div className="modelo-poder-topo">
                    <h3 className="modelo-poder-titulo" id="modelo-poder-titulo-id">➕ Adicionar de modelo{nome ? ` · ${nome}` : ''}</h3>
                    <button type="button" className="modelo-poder-fechar" onClick={fechar} aria-label="Fechar">✖</button>
                </div>
                <ol className="modelo-poder-etapas">
                    {ETAPAS.map((rotulo, i) => <li key={rotulo} className={`modelo-poder-etapa${i === etapa ? ' ativa' : ''}${i < etapa ? ' feita' : ''}`}>{i + 1}. {rotulo}</li>)}
                </ol>

                {resultado ? (
                    <div className="modelo-poder-corpo">
                        <div className={`modelo-poder-resultado ${resultado.ok ? 'ok' : 'erro'}`} role="status">{resultado.ok ? '✅' : '⚠️'} {resultado.mensagem}</div>
                        {(resultado.avisos || []).length > 0 && <ul className="modelo-poder-avisos">{resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                        <div className="modelo-poder-acoes"><button type="button" className="btn-neon" onClick={fechar}>Fechar</button></div>
                    </div>
                ) : etapa === 0 ? (
                    <div className="modelo-poder-corpo">
                        <p className="modelo-poder-dica">Só o Mestre concede. O modelo cria o poder, os contadores e os gatilhos de uma vez na ficha de {nome || 'quem está aberto'}.</p>
                        <div className="modelo-poder-lista">
                            {MODELOS.map(m => (
                                <button key={m.id} type="button" className="modelo-poder-cartao" onClick={() => escolher(m)}>
                                    <strong>{m.nome}</strong>
                                    <span className="modelo-poder-categoria">{m.categoria === 'forma' ? 'Forma Especial' : 'Habilidade'}</span>
                                    <span className="modelo-poder-resumo">{m.resumo}</span>
                                    {acharPoderDoModelo(ficha, m.id) && <span className="modelo-poder-selo">já na ficha: editar partes</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : etapa === 1 && modelo ? (
                    <div className="modelo-poder-corpo">
                        <p className="modelo-poder-dica">{existente ? `${modelo.nome} já está na ficha: marque o que ele deve ter e só as partes mudadas serão trocadas.` : 'Marque as partes que este personagem terá. Todos os números são editáveis.'}</p>
                        {modelo.partes.map(parte => {
                            const marcada = selecao.includes(parte.id);
                            return (
                                <div key={parte.id} className={`modelo-poder-parte${marcada ? ' marcada' : ''}`}>
                                    <label className="modelo-poder-parte-rotulo">
                                        <input type="checkbox" checked={marcada} onChange={() => alternarParte(parte.id)} />
                                        <span>{parte.rotulo}</span>
                                        {parte.suportado === 'nota' && <span className="modelo-poder-nota" title="O app não tem esta regra: entra como nota na descrição do poder">vira nota</span>}
                                    </label>
                                    <div className="modelo-poder-parte-desc">{parte.descricao}</div>
                                    {marcada && parte.parametros.length > 0 && (
                                        <div className="modelo-poder-params">
                                            {parte.parametros.map(p => (
                                                <label key={p.id} className="modelo-poder-param">
                                                    <span>{p.rotulo}</span>
                                                    <input type="number" value={params[p.id] ?? p.padrao} min={p.min} max={p.max} onChange={e => mudarParam(p.id, e.target.value)} />
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {modelo.temOrigem && (
                            <div className="modelo-poder-origem">
                                <strong>Origem (só informativa; a mecânica é a mesma)</strong>
                                <div className="modelo-poder-origem-linha">
                                    <select value={origem.tipo} onChange={e => { setSujo(true); setOrigem(o => ({ ...o, tipo: e.target.value })); }} aria-label="Origem do poder">
                                        {ORIGENS_PODER.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                                    </select>
                                    <input type="text" maxLength={60} placeholder="Nome do ser (opcional)" value={origem.fonte} onChange={e => { setSujo(true); setOrigem(o => ({ ...o, fonte: e.target.value })); }} aria-label="Nome do ser de origem" />
                                </div>
                            </div>
                        )}
                        <label className="modelo-poder-opcao">
                            <input type="checkbox" checked={criarOpcionais} onChange={e => { setSujo(true); setCriarOpcionais(e.target.checked); }} />
                            <span>Criar gatilhos opcionais e desarmados (o dono arma depois). Desligado: nascem automáticos e armados, pois o Mestre concede de propósito.</span>
                        </label>
                        <div className="modelo-poder-acoes">
                            <button type="button" className="btn-neon" onClick={() => setEtapa(0)}>Voltar</button>
                            <button type="button" className="btn-neon" disabled={selecao.length === 0} onClick={() => setEtapa(2)}>Ver resumo</button>
                        </div>
                    </div>
                ) : modelo && plano ? (
                    <div className="modelo-poder-corpo">
                        <div className="modelo-poder-resumo-caixa">
                            <strong>{plano.modo === 'editar' ? `Atualizar ${modelo.nome} em ${nome || 'a ficha'}` : `Criar ${modelo.nome} em ${nome || 'a ficha'}`}</strong>
                            <ul>
                                <li>{plano.poderes} poder novo, {plano.efeitos} efeito(s) de status</li>
                                <li>{plano.contadores} contador(es) novo(s){plano.contadoresAtualizados > 0 ? `, ${plano.contadoresAtualizados} ajustado(s) (nome/limites)` : ''}{plano.contadoresRemovidos > 0 ? `, ${plano.contadoresRemovidos} removido(s)` : ''}</li>
                                <li>{plano.gatilhos} gatilho(s) {criarOpcionais ? 'opcionais e desarmados' : 'automáticos e armados'}</li>
                                {modelo.temOrigem && <li>Origem: {origem.tipo === 'independente' ? 'independente' : `herdada${origem.fonte ? ` de ${origem.fonte}` : ' de um ser'}`}</li>}
                            </ul>
                            {plano.erro && <div className="modelo-poder-resultado erro" role="alert">⚠️ {plano.erro}</div>}
                            {plano.avisos.length > 0 && <ul className="modelo-poder-avisos">{plano.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                        </div>
                        <div className="modelo-poder-acoes">
                            <button type="button" className="btn-neon" onClick={() => setEtapa(1)}>Voltar</button>
                            <button type="button" className="btn-neon" disabled={!plano.ok} onClick={aplicar}>{plano.modo === 'editar' ? 'Aplicar partes' : 'Aplicar'}</button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );

    return (
        <div className="modelo-poder-barra">
            <button type="button" ref={botaoAbrirRef} className="grimorio-importar-botao" onClick={abrir} title="Só o Mestre: cria de uma vez o poder, os contadores e os gatilhos de um modelo pronto">➕ Adicionar de modelo</button>
            {painel && (typeof document !== 'undefined' && document.body ? createPortal(painel, document.body) : painel)}
        </div>
    );
}
