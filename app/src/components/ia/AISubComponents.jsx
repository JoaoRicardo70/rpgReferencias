import React, { useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../stores/useStore';
import { useAIForm, TODOS_RANKS, PERIODOS_RESUMO } from './AIFormContext';
import {
    MODELO_GEMINI_PADRAO, ATALHOS_JOGADOR, ATALHOS_MESTRE, detectarMencaoAtiva, aplicarMencao, filtrarAlvosMencao,
    buscarNosRegistros,
} from '../../core/sextaFeira';
import { ModalSexta } from './DialogosSexta';
import { resumoFichaDetalhado } from '../../core/sextaFeiraFerramentas';
import { markdownParaTextoFalado } from '../../core/markdownSexta';
import { configurarFalaSexta, juntarTextoFalado, mensagemErroMicrofone } from '../../core/vozSexta';
import MarkdownSexta from './MarkdownSexta';
import { ROTULO_TIPO } from '../../core/sextaFeiraCriacao';
import DetalhesCriacao from './DetalhesCriacao';
import { listarModelosGemini } from '../../services/sextaFeiraIA';
import GravadorPanel from './GravadorPanel';
import AIArvoreGenealogica from './AIArvoreGenealogica'; // <-- ADIÇÃO: Importando o novo componente

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>AI provider não encontrado</div>;

export function AIHeader() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { subAba, setSubAba, isMestre, iaConfigurada } = ctx;
    const emCodex = ['lore', 'tierlist', 'arvore'].includes(subAba);

    return (
        <div className="sexta-header">
            <h2 className="sexta-header-titulo">
                Sexta-Feira (IA Central)
                <span className={`sexta-status ${iaConfigurada ? 'online' : 'offline'}`}>{iaConfigurada ? '● online' : '● sem chave'}</span>
            </h2>
            {/* 📚 Codex = Registros + Tier List + Árvore (sub-abas dentro dele) */}
            <nav className="sexta-nav" role="tablist" aria-label="Seções da Sexta-Feira">
                {[
                    { id: 'chat', rotulo: '💬 Chat', ativo: subAba === 'chat', ir: () => setSubAba('chat') },
                    { id: 'codex', rotulo: '📚 Codex', ativo: emCodex, ir: () => { if (!emCodex) setSubAba('lore'); } },
                    { id: 'gravador', rotulo: '🎙️ Gravador', ativo: subAba === 'gravador', ir: () => setSubAba('gravador') },
                    ...(isMestre ? [{ id: 'config', rotulo: '⚙️ Config', ativo: subAba === 'config', ir: () => setSubAba('config') }] : []),
                ].map(item => (
                    <button key={item.id} type="button" role="tab" aria-selected={item.ativo} className={`sexta-nav-item${item.ativo ? ' ativo' : ''}`} onClick={item.ir}>{item.rotulo}</button>
                ))}
            </nav>
        </div>
    );
}

export function AICapituladorHeader() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { 
        subAba, loreFoco, setLoreFoco, 
        capituloAtivoId, setCapituloAtivoId, capFuturoAtivoId, setCapFuturoAtivoId, 
        arcoAtivoIdPresente, setArcoAtivoIdPresente, arcoAtivoIdFuturo, setArcoAtivoIdFuturo,
        capitulosPresente, capitulosFuturo, capituloAtivoObj,
        editarTituloCapitulo, apagarCapitulo, adicionarCapitulo,
        adicionarArco, editarTituloArco, apagarArco,
        podeEditarRegistros, podeVerFuturo, registrosCompartilhados
    } = ctx;

    return (
        <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                <div>
                    <h3 style={{ color: loreFoco === 'presente' ? '#00ffcc' : '#ffcc00', marginTop: 0, margin: 0, transition: 'color 0.3s' }}>
                        {subAba === 'lore' ? '📜 Registros Akáshicos' : '📊 Níveis de Ameaça (Tier List Interativa)'}
                    </h3>
                    <p style={{ color: '#aaa', fontSize: '0.9em', margin: 0 }}>
                        {loreFoco === 'presente' ? 'Visualizando: Linha do Tempo Atual' : 'Visualizando: Ecos do Futuro'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className={`btn-neon ${loreFoco === 'presente' ? 'btn-green' : ''}`} onClick={() => setLoreFoco('presente')} style={{ padding: '8px 15px', fontSize: '0.9em', margin: 0, opacity: loreFoco === 'presente' ? 1 : 0.5 }}>⏳ Presente</button>
                    {podeVerFuturo && (
                        <button className={`btn-neon ${loreFoco === 'futuro' ? 'btn-gold' : ''}`} onClick={() => setLoreFoco('futuro')} style={{ padding: '8px 15px', fontSize: '0.9em', margin: 0, opacity: loreFoco === 'futuro' ? 1 : 0.5 }}>🚀 Futuro</button>
                    )}
                </div>
            </div>
            {registrosCompartilhados && (
                <p className="sexta-registros-aviso">
                    {podeEditarRegistros ? '🌐 Registros da mesa: o que você edita aqui aparece para todos os jogadores.' : '🔒 Registros da mesa: somente o Mestre edita.'}
                </p>
            )}

            {/* LINHA 1: GESTÃO DE CAPÍTULOS */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #333', flexWrap: 'wrap' }}>
                <span style={{ color: loreFoco === 'presente' ? '#00ffcc' : '#ffcc00', fontWeight: 'bold' }}>📖 Capítulo:</span>
                <select className="input-neon" value={loreFoco === 'presente' ? capituloAtivoId : capFuturoAtivoId} onChange={(e) => loreFoco === 'presente' ? setCapituloAtivoId(Number(e.target.value)) : setCapFuturoAtivoId(Number(e.target.value))} style={{ flex: 1, minWidth: '150px', borderColor: loreFoco === 'presente' ? '#00ffcc' : '#ffcc00', color: '#fff', padding: '8px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    {(loreFoco === 'presente' ? capitulosPresente : capitulosFuturo).map(cap => <option key={cap.id} value={cap.id} style={{ color: '#000' }}>{cap.titulo}</option>)}
                </select>
                {podeEditarRegistros && (
                    <div style={{ display: 'flex', gap: '5px' }}>
                        <button className="btn-neon btn-gold" onClick={editarTituloCapitulo} style={{ padding: '8px 15px', margin: 0 }} title="Editar Nome do Capítulo">✏️</button>
                        <button className="btn-neon btn-red" onClick={apagarCapitulo} style={{ padding: '8px 15px', margin: 0 }} title="Apagar Capítulo Inteiro">🗑️</button>
                        <button className="btn-neon btn-green" onClick={adicionarCapitulo} style={{ padding: '8px 15px', margin: 0 }}>➕ Novo Capítulo</button>
                    </div>
                )}
            </div>

            {/* LINHA 2: GESTÃO DE ARCOS DENTRO DO CAPÍTULO ATUAL */}
            {subAba === 'lore' && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', paddingTop: '10px', paddingBottom: '10px', borderBottom: '1px solid #333', flexWrap: 'wrap' }}>
                    <span style={{ color: '#0088ff', fontWeight: 'bold' }}>📂 Arco:</span>
                    <select className="input-neon" value={loreFoco === 'presente' ? arcoAtivoIdPresente : arcoAtivoIdFuturo} onChange={(e) => loreFoco === 'presente' ? setArcoAtivoIdPresente(Number(e.target.value)) : setArcoAtivoIdFuturo(Number(e.target.value))} style={{ flex: 1, minWidth: '150px', borderColor: '#0088ff', color: '#fff', padding: '8px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                        {capituloAtivoObj?.arcos?.map(a => <option key={a.id} value={a.id} style={{ color: '#000' }}>{a.titulo}</option>)}
                    </select>
                    {podeEditarRegistros && (
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <button className="btn-neon btn-gold" onClick={editarTituloArco} style={{ padding: '8px 15px', margin: 0 }} title="Editar Nome do Arco">✏️</button>
                            <button className="btn-neon btn-red" onClick={apagarArco} style={{ padding: '8px 15px', margin: 0 }} title="Apagar este Arco">🗑️</button>
                            <button className="btn-neon btn-blue" onClick={adicionarArco} style={{ padding: '8px 15px', margin: 0 }}>➕ Novo Arco Aqui</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Ações embaixo de cada resposta da Sexta-Feira: mandar pros Registros (com o destino sugerido
// pelo resumo de sessão já escolhido) e, pro Mestre, gravar na memória permanente da mesa.
function AcoesMensagemIA({ msg }) {
    const ctx = useAIForm();
    const [destino, setDestino] = useState(msg.destinoSugerido || 'novo_capitulo');
    const [memorizado, setMemorizado] = useState('');
    if (!ctx) return null;
    const { salvarNoRegistro, loreFoco, capitulosPresente, capitulosFuturo, podeEditarRegistros, isMestre, memorizarTexto } = ctx;
    // Resumo de sessão sempre vai pro Presente (os destinos sugeridos são de lá).
    const foco = msg.tipo === 'resumo' ? 'presente' : loreFoco;
    const capitulos = foco === 'presente' ? capitulosPresente : capitulosFuturo;

    const memorizar = async (soMestre) => {
        try {
            await memorizarTexto(msg.texto.substring(0, 500), soMestre);
            setMemorizado(soMestre ? '🔒 Memorizado (só Mestre)' : '📌 Memorizado');
        } catch (e) {
            setMemorizado('❌ Não foi possível memorizar');
        }
    };

    if (!podeEditarRegistros && !isMestre) return null;
    return (
        <div className="sexta-msg-acoes">
            {podeEditarRegistros && (
                <>
                    <span className="sexta-msg-acoes-rotulo">{msg.destinoSugerido ? 'Destino sugerido:' : 'Destino:'}</span>
                    <select className="input-neon sexta-msg-acoes-select" value={destino} onChange={e => setDestino(e.target.value)}>
                        <option value="novo_capitulo">➕ Criar Novo Capítulo Inteiro</option>
                        {capitulos.map(cap => (
                            <optgroup key={cap.id} label={`📖 ${cap.titulo}`}>
                                <option value={`novo_arco_${cap.id}`}>➕ Novo Arco aqui dentro</option>
                                {cap.arcos.map(a => <option key={a.id} value={`${cap.id}_${a.id}`}>📂 {a.titulo}</option>)}
                            </optgroup>
                        ))}
                    </select>
                    <button
                        onClick={() => {
                            const titulo = msg.tipo === 'resumo' ? 'Resumo de Sessão da Sexta-Feira' : 'Análise da Sexta-Feira';
                            Promise.resolve(salvarNoRegistro(msg.texto, titulo, destino, foco)).then((ok) => {
                                if (ok) ctx.dialogos.avisar('✅ Texto enviado para o Arco selecionado!');
                            }).catch(() => ctx.dialogos.avisar('Não foi possível enviar para os Registros.', 'erro'));
                        }}
                        className="sexta-chip-btn azul"
                    >
                        📜 Enviar
                    </button>
                </>
            )}
            {isMestre && (
                memorizado ? <span className="sexta-msg-acoes-rotulo">{memorizado}</span> : (
                    <>
                        <button className="sexta-chip-btn" onClick={() => memorizar(false)} title="A Sexta-Feira passa a lembrar disto em todas as conversas da mesa">📌 Memorizar</button>
                        <button className="sexta-chip-btn" onClick={() => memorizar(true)} title="Só aparece para o Mestre">🔒 Só Mestre</button>
                    </>
                )
            )}
        </div>
    );
}

// 📝 Botão do Mestre: resume a sessão (feed de combate + falas transcritas) do período escolhido.
function ResumirSessaoMestre() {
    const ctx = useAIForm();
    const [periodo, setPeriodo] = useState('hoje');
    if (!ctx || !ctx.isMestre) return null;
    return (
        <div className="sexta-resumo-sessao">
            <select className="input-neon sexta-msg-acoes-select" value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Período do resumo">
                {Object.entries(PERIODOS_RESUMO).map(([valor, rotulo]) => <option key={valor} value={valor}>Sessão {rotulo}</option>)}
            </select>
            <button className="sexta-chip-btn ouro" onClick={() => ctx.resumirSessao(periodo)} disabled={ctx.carregando} title="Junta o feed de combate e as falas transcritas e escreve uma crônica para os Registros">
                📝 Resumir sessão
            </button>
        </div>
    );
}

// 🔊 Lê uma resposta em voz alta (Web Speech API do navegador). Some se o navegador não tiver voz.
function BotaoOuvir({ texto }) {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return null;
    const ouvir = () => {
        try {
            window.speechSynthesis.cancel();
            const fala = new window.SpeechSynthesisUtterance(markdownParaTextoFalado(texto));
            configurarFalaSexta(fala, window.speechSynthesis.getVoices?.() || []);
            window.speechSynthesis.speak(fala);
        } catch (e) { /* sem voz */ }
    };
    return <button type="button" className="sexta-chip-btn" onClick={ouvir} title="Ouvir esta resposta" aria-label="Ouvir esta resposta">🔊</button>;
}

const ESTADO_PROPOSTA = { aplicada: '✅ Aplicada', enviada: '⏳ Enviada ao Mestre', descartada: '🗑️ Descartada' };

function CartaoProposta({ proposta, msgIdx }) {
    const ctx = useAIForm();
    const [ocupado, setOcupado] = useState(false);
    if (!ctx) return null;
    const { isMestre } = ctx;
    const titulo = proposta.tipo === 'tierlist' ? 'Tier List' : (proposta.objeto?.nome || 'Sem nome');
    const executar = async (fn) => { setOcupado(true); try { await fn(msgIdx, proposta.id); } finally { setOcupado(false); } };
    const podeEnviar = !isMestre && ['poder', 'magia', 'item'].includes(proposta.tipo);
    return (
        <div className={`sexta-criacao sexta-criacao-${proposta.estado || 'nova'}`}>
            <div className="sexta-criacao-topo">
                <span className="sexta-criacao-tipo">🛠️ {ROTULO_TIPO[proposta.tipo] || proposta.tipo}{proposta.quantidade > 1 ? ` × ${proposta.quantidade}` : ''}</span>
                <strong className="sexta-criacao-nome">{titulo}</strong>
                {proposta.alvo && <span className="sexta-criacao-alvo">para {proposta.alvo}</span>}
                {proposta.cenaNome && <span className="sexta-criacao-alvo">na cena "{proposta.cenaNome}"</span>}
                {proposta.tipo === 'tierlist' && proposta.capituloTitulo && <span className="sexta-criacao-alvo">no capítulo "{proposta.capituloTitulo}"</span>}
            </div>
            <DetalhesCriacao tipo={proposta.tipo} objeto={proposta.objeto} avisos={proposta.avisos} />
            <div className="sexta-criacao-acoes">
                {proposta.estado && proposta.estado !== 'nova' ? (
                    <span className="sexta-criacao-estado">{ESTADO_PROPOSTA[proposta.estado] || proposta.estado}</span>
                ) : (
                    <>
                        {isMestre && <button type="button" className="sexta-chip-btn verde" disabled={ocupado} onClick={() => executar(ctx.aplicarProposta)}>✅ Aplicar</button>}
                        {podeEnviar && <button type="button" className="sexta-chip-btn azul" disabled={ocupado} onClick={() => executar(ctx.enviarPropostaParaAprovacao)}>📨 Enviar para aprovação</button>}
                        {!isMestre && !podeEnviar && <span className="sexta-criacao-estado">Só o Mestre pode aplicar isto.</span>}
                        <button type="button" className="sexta-chip-btn" disabled={ocupado} onClick={() => ctx.descartarProposta(msgIdx, proposta.id)}>Descartar</button>
                    </>
                )}
            </div>
        </div>
    );
}

// 📥 Pedidos de criação dos jogadores esperando o Mestre (painel lateral).
function PendentesMestre() {
    const ctx = useAIForm();
    const [aberto, setAberto] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    if (!ctx || !ctx.isMestre) return null;
    const pedidos = Object.entries(ctx.sextaFeiraPendentes || {})
        .filter(([, p]) => p && p.objeto)
        .sort(([, a], [, b]) => (Number(a.em) || 0) - (Number(b.em) || 0));
    if (pedidos.length === 0) return null;
    const agir = async (fn, id) => { setOcupado(id); try { await fn(id); } finally { setOcupado(null); } };
    return (
        <div className="sexta-painel-bloco sexta-pendentes">
            <div className="sexta-painel-titulo">📥 Pedidos dos jogadores ({pedidos.length})</div>
            {pedidos.map(([id, p]) => (
                <div key={id} className="sexta-pendente">
                    <button type="button" className="sexta-pendente-cabecalho" onClick={() => setAberto(aberto === id ? null : id)} aria-expanded={aberto === id}>
                        <strong>{p.objeto.nome}</strong>
                        <small>{ROTULO_TIPO[p.tipo] || p.tipo} · {p.solicitante}{p.alvo && p.alvo !== p.solicitante ? ` → ${p.alvo}` : ''}</small>
                    </button>
                    {aberto === id && <DetalhesCriacao tipo={p.tipo} objeto={p.objeto} avisos={p.avisos} />}
                    <div className="sexta-criacao-acoes">
                        <button type="button" className="sexta-chip-btn verde" disabled={ocupado === id} onClick={() => agir(ctx.aprovarPendente, id)}>✅ Aprovar</button>
                        <button type="button" className="sexta-chip-btn vermelho" disabled={ocupado === id} onClick={() => agir(ctx.recusarPendente, id)}>❌ Recusar</button>
                    </div>
                </div>
            ))}
        </div>
    );
}

function MensagemChat({ msg, meuNome, ultima, msgIdx }) {
    const ctx = useAIForm();
    const papel = msg.role === 'user' ? 'user' : msg.role === 'erro' ? 'erro' : 'ai';
    const rotulo = papel === 'user' ? meuNome?.toUpperCase() : papel === 'erro' ? 'ERRO' : (msg.tipo === 'resumo' ? 'SEXTA-FEIRA · RESUMO DE SESSÃO' : 'SEXTA-FEIRA');
    return (
        <div className={`sexta-msg sexta-msg-${papel}`}>
            <div className="sexta-msg-balao">
                <div className="sexta-msg-rotulo">{rotulo}</div>
                {papel === 'ai' ? <MarkdownSexta texto={msg.texto} /> : <div className="sexta-msg-texto">{msg.texto}</div>}
                {papel === 'erro' && ultima && ctx && (
                    <button type="button" className="sexta-chip-btn vermelho sexta-msg-retry" onClick={ctx.tentarDeNovo} disabled={ctx.carregando}>↻ Tentar de novo</button>
                )}
            </div>
            {papel === 'ai' && Array.isArray(msg.propostas) && msg.propostas.map(p => (
                <CartaoProposta key={p.id} proposta={p} msgIdx={msgIdx} />
            ))}
            {papel === 'ai' && (
                <div className="sexta-msg-rodape">
                    <BotaoOuvir texto={msg.texto} />
                    <AcoesMensagemIA msg={msg} />
                </div>
            )}
        </div>
    );
}

// ⚡ Perguntas prontas (um clique envia). O Mestre tem as dele.
function AtalhosChat() {
    const ctx = useAIForm();
    if (!ctx) return null;
    const atalhos = ctx.isMestre ? ATALHOS_MESTRE : ATALHOS_JOGADOR;
    return (
        <div className="sexta-atalhos">
            {atalhos.map(a => (
                <button key={a.rotulo} type="button" className="sexta-atalho" onClick={() => ctx.enviarMensagem(a.texto)} disabled={ctx.carregando} title={a.texto}>{a.rotulo}</button>
            ))}
        </div>
    );
}

const ROTULO_TIPO_MENCAO = { cena: '🗺️ cena', personagem: '🧑 personagem', npc: '👾 NPC', arco: '📜 arco' };

// Campo de mensagem com menções: "@" abre a lista de personagens, NPCs, arcos e a cena atual.
function CampoMensagem() {
    const ctx = useAIForm();
    const campoRef = useRef(null);
    const [mencao, setMencao] = useState(null);
    const carregandoCtx = !!ctx?.carregando;
    // Depois que a resposta chega, o cursor volta pro campo (ele fica desabilitado enquanto ela escreve).
    useEffect(() => { if (!carregandoCtx && campoRef.current && document.activeElement === document.body) campoRef.current.focus(); }, [carregandoCtx]);
    if (!ctx) return null;
    const { mensagem, setMensagem, handleKeyDown, carregando, alvosMencao } = ctx;
    const opcoes = mencao ? filtrarAlvosMencao(alvosMencao, mencao.termo) : [];
    const aberta = !!mencao && opcoes.length > 0;
    const indice = aberta ? Math.min(mencao.indice, opcoes.length - 1) : 0;

    const atualizarMencao = (texto, cursor) => {
        const achada = detectarMencaoAtiva(texto, cursor);
        setMencao(achada ? { ...achada, cursor, indice: 0 } : null);
    };
    const escolher = (alvo) => {
        const { texto, cursor } = aplicarMencao(mensagem, mencao.inicio, mencao.cursor, alvo.rotulo);
        setMensagem(texto);
        setMencao(null);
        requestAnimationFrame(() => {
            const el = campoRef.current;
            if (el) { el.focus(); el.setSelectionRange(cursor, cursor); }
        });
    };
    const aoTeclar = (e) => {
        if (aberta) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMencao({ ...mencao, indice: (indice + 1) % opcoes.length }); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMencao({ ...mencao, indice: (indice - 1 + opcoes.length) % opcoes.length }); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolher(opcoes[indice]); return; }
            if (e.key === 'Escape') { e.preventDefault(); setMencao(null); return; }
        }
        handleKeyDown(e);
    };

    return (
        <div className="sexta-campo">
            {aberta && (
                <ul id="sexta-lista-mencoes" className="sexta-mencoes" role="listbox" aria-label="Mencionar">
                    {opcoes.map((alvo, i) => (
                        <li key={`${alvo.tipo}-${alvo.rotulo}-${i}`} id={`sexta-mencao-${i}`} role="option" aria-selected={i === indice}
                            className={`sexta-mencao${i === indice ? ' ativa' : ''}`}
                            onMouseDown={(e) => { e.preventDefault(); escolher(alvo); }}>
                            <span>@{alvo.rotulo}</span>
                            <small>{ROTULO_TIPO_MENCAO[alvo.tipo] || alvo.tipo}{alvo.capitulo ? ` · ${alvo.capitulo}` : ''}</small>
                        </li>
                    ))}
                </ul>
            )}
            <textarea
                ref={campoRef}
                className="input-neon sexta-campo-texto"
                placeholder="Fale com a Sexta-Feira... (use @ para mencionar)"
                aria-label="Mensagem para a Sexta-Feira"
                aria-expanded={aberta}
                aria-controls={aberta ? 'sexta-lista-mencoes' : undefined}
                aria-activedescendant={aberta ? `sexta-mencao-${indice}` : undefined}
                value={mensagem}
                onChange={e => { setMensagem(e.target.value); atualizarMencao(e.target.value, e.target.selectionStart); }}
                onKeyDown={aoTeclar}
                onClick={e => atualizarMencao(e.target.value, e.target.selectionStart)}
                onBlur={() => setMencao(null)}
                disabled={carregando}
            />
        </div>
    );
}

// 🎤 Pergunta por voz (reconhecimento de voz do navegador; só existe no Chrome/Edge pelo site).
// Clique para falar; ao terminar a frase (ou clicar de novo) o texto é enviado e a resposta é
// lida em voz alta. Com um arquivo anexado, o texto só vai para o campo (o envio fica com você).
function BotaoMicrofone() {
    const ctx = useAIForm();
    const [ouvindo, setOuvindo] = useState(false);
    const [parcial, setParcial] = useState('');
    const reconhecedorRef = useRef(null);
    const ctxRef = useRef(ctx);
    ctxRef.current = ctx;
    useEffect(() => () => {
        const rec = reconhecedorRef.current;
        if (!rec) return;
        rec.onresult = null; rec.onerror = null; rec.onend = null;
        try { rec.abort(); } catch (e) { /* já parado */ }
    }, []);
    const Reconhecimento = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!ctx || !Reconhecimento) return null;

    const avisar = (texto) => ctxRef.current?.dialogos?.avisar?.(texto, 'erro');
    const comecar = () => {
        let rec;
        try { rec = new Reconhecimento(); } catch (e) { avisar(mensagemErroMicrofone('falha')); return; }
        rec.lang = 'pt-BR';
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        let final = '';
        let interino = '';
        let falhou = false;
        rec.onresult = (e) => {
            interino = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const trecho = e.results[i][0]?.transcript || '';
                if (e.results[i].isFinal) final += trecho; else interino += trecho;
            }
            setParcial(`${final} ${interino}`.replace(/\s+/g, ' ').trim());
        };
        rec.onerror = (e) => {
            if (e.error === 'aborted') return;
            falhou = true;
            avisar(mensagemErroMicrofone(e.error));
        };
        rec.onend = () => {
            reconhecedorRef.current = null;
            setOuvindo(false);
            setParcial('');
            // Alguns navegadores encerram sem "fechar" a última frase: usa o que já tinha sido ouvido.
            const falado = (final.trim() || interino).trim();
            const atual = ctxRef.current;
            if (falhou || !falado || !atual) return;
            const texto = juntarTextoFalado(atual.mensagem, falado);
            // Sem enviar agora (anexo, resposta em andamento ou IA sem chave): o texto fica no campo.
            if (atual.nomeArquivo || atual.carregando || !atual.iaConfigurada) {
                atual.setMensagem(texto);
                // Sem chave: o envio direto não mexe no campo e só mostra o aviso de configuração.
                if (!atual.iaConfigurada) atual.enviarMensagem(texto);
                return;
            }
            atual.setMensagem('');
            atual.enviarMensagem(texto, { porVoz: true });
        };
        // A Sexta-Feira para de falar, senão o microfone ouve a própria voz dela.
        ctx.pararVoz?.();
        try {
            rec.start();
            reconhecedorRef.current = rec;
            setOuvindo(true);
        } catch (e) { avisar(mensagemErroMicrofone('falha')); }
    };
    const parar = () => { try { reconhecedorRef.current?.stop(); } catch (e) { /* já parado */ } };

    const rotulo = ouvindo ? 'Parar de ouvir e enviar' : 'Falar com a Sexta-Feira';
    return (
        <div className="sexta-mic">
            {ouvindo && <div className="sexta-mic-parcial" aria-live="polite">🎤 {parcial || 'Ouvindo...'}</div>}
            <button type="button" className={`btn-neon sexta-mic-btn${ouvindo ? ' ouvindo' : ''}`}
                onClick={ouvindo ? parar : comecar} disabled={!ouvindo && ctx.carregando}
                title={rotulo} aria-label={rotulo}>🎤</button>
        </div>
    );
}

const ESTADOS_SEXTA = {
    pensando: { rotulo: 'Pensando...', icone: '🧠' },
    combate: { rotulo: 'Modo combate', icone: '⚔️' },
    pronta: { rotulo: 'Pronta', icone: '💠' },
    offline: { rotulo: 'Sem chave', icone: '💤' },
};

// 🛰️ Painel ao lado do chat: estado da Sexta-Feira, o que ela está "vendo" e as fontes ligadas.
function PainelContextoSexta() {
    const ctx = useAIForm();
    const minhaFicha = useStore(s => s.minhaFicha);
    const divisorPoderMesa = useStore(s => s.divisorPoderMesa);
    const resumoTurno = useStore(s => s.resumoTurnoMapa);
    const cenario = useStore(s => s.cenario);
    const meuNome = ctx?.meuNome;
    const minhaVisao = useMemo(() => {
        if (!minhaFicha) return null;
        try { return resumoFichaDetalhado(meuNome, minhaFicha, { divisorPoderMesa }); } catch (e) { return null; }
    }, [minhaFicha, meuNome, divisorPoderMesa]);
    if (!ctx) return null;
    const { isMestre, carregando, iaConfigurada, preferencias, alternarPreferencia, arcoAtivoObj, capituloAtivoObj, sextaFeiraMemoria } = ctx;

    const ordem = Array.isArray(resumoTurno?.ordem) ? resumoTurno.ordem : [];
    const emCombate = ordem.length > 0;
    const vezDe = emCombate ? ordem[((Number(resumoTurno.turnoAtualIndex) || 0) % ordem.length + ordem.length) % ordem.length]?.nome : null;
    const cena = cenario?.lista?.[cenario?.ativa]?.nome || '';
    const estado = !iaConfigurada ? 'offline' : carregando ? 'pensando' : emCombate ? 'combate' : 'pronta';
    const totalMemoria = Object.values(sextaFeiraMemoria || {}).filter(f => f && f.texto && (isMestre || !f.soMestre)).length;
    const fontes = [
        { chave: 'lore', rotulo: '📜 Lore', dica: 'Trechos dos Registros ligados à pergunta' },
        { chave: 'mesa', rotulo: '🛠️ Dados da mesa', dica: 'Fichas, combate, feed, Árvore e simulações' },
        { chave: 'memoria', rotulo: '📌 Memória', dica: 'Fatos que o Mestre mandou lembrar' },
        { chave: 'voz', rotulo: '🔊 Voz', dica: 'Ler as respostas em voz alta' },
    ];

    return (
        <aside className="sexta-painel">
            <div className={`sexta-avatar sexta-avatar-${estado}`}>
                <div className="sexta-avatar-orbe" aria-hidden="true">{ESTADOS_SEXTA[estado].icone}</div>
                <div>
                    <div className="sexta-avatar-nome">SEXTA-FEIRA</div>
                    <div className="sexta-avatar-estado">{ESTADOS_SEXTA[estado].rotulo}</div>
                </div>
            </div>

            <PendentesMestre />

            <div className="sexta-painel-bloco sexta-painel-visao">
                <div className="sexta-painel-titulo">👁️ O que ela está vendo</div>
                <div className="sexta-painel-linha"><span>Você</span><strong>{meuNome} · {isMestre ? 'Mestre' : 'Jogador'}</strong></div>
                {minhaVisao && (
                    <>
                        <div className="sexta-painel-linha"><span>Poder</span><strong>{Number(minhaVisao.poderCalculado || 0).toLocaleString('pt-BR')}</strong></div>
                        <div className="sexta-painel-linha"><span>Fadiga</span><strong>{minhaVisao.fadigaPorcentagem}%</strong></div>
                        {minhaVisao.vitais?.vida && <div className="sexta-painel-linha"><span>Vida</span><strong>{minhaVisao.vitais.vida.porcentagem}%</strong></div>}
                    </>
                )}
                <div className="sexta-painel-linha"><span>Combate</span><strong>{emCombate ? `vez de ${vezDe}` : 'nenhum'}</strong></div>
                {cena && <div className="sexta-painel-linha"><span>Cena</span><strong>{cena}</strong></div>}
                {arcoAtivoObj && <div className="sexta-painel-linha"><span>Arco</span><strong>{capituloAtivoObj?.titulo ? `${capituloAtivoObj.titulo} › ` : ''}{arcoAtivoObj.titulo}</strong></div>}
                <div className="sexta-painel-linha"><span>Memória</span><strong>{totalMemoria} fato(s)</strong></div>
            </div>

            <div className="sexta-painel-bloco">
                <div className="sexta-painel-titulo">🎚️ Fontes</div>
                <div className="sexta-fontes">
                    {fontes.map(f => (
                        <button key={f.chave} type="button" className={`sexta-fonte${preferencias[f.chave] ? ' ligada' : ''}`} onClick={() => alternarPreferencia(f.chave)} title={f.dica} aria-pressed={!!preferencias[f.chave]}>
                            {f.rotulo}
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
}

export function AIChat() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { chatRef, historico, meuNome, carregando, enviarMensagem, arquivoTexto, nomeArquivo, setArquivoTexto, setNomeArquivo, fileInputRef, handleArquivoSelecionado, limparChat, respostaParcial, mensagem } = ctx;
    const podeEnviar = !carregando && (mensagem.trim() || arquivoTexto);

    return (
        <div className="sexta-chat-layout">
            <div className="sexta-chat-coluna">
                <div className="sexta-chat-topo">
                    <span className="sexta-chat-memoria">📡 Memória Neural Ativa para: {meuNome}</span>
                    <div className="sexta-chat-topo-acoes">
                        <ResumirSessaoMestre />
                        {historico.length > 0 && (
                            <button onClick={limparChat} className="sexta-chat-limpar" title="Zerar a conversa com a IA">🗑️ Limpar Memória</button>
                        )}
                    </div>
                </div>

                <div ref={chatRef} className="def-box sexta-chat-mensagens" aria-live="polite">
                    {historico.length === 0 && respostaParcial === null && <div className="sexta-chat-vazio">A Sexta-Feira está online e pronta para ajudar. Experimente um atalho abaixo ou mencione alguém com @.</div>}
                    {historico.map((msg, i) => (
                        <MensagemChat key={i} msg={msg} meuNome={meuNome} ultima={i === historico.length - 1} msgIdx={i} />
                    ))}
                    {carregando && (
                        <div className="sexta-msg sexta-msg-ai">
                            <div className="sexta-msg-balao sexta-msg-escrevendo">
                                <div className="sexta-msg-rotulo">SEXTA-FEIRA</div>
                                {respostaParcial ? <MarkdownSexta texto={respostaParcial} /> : <div className="sexta-msg-texto sexta-pensando">Consultando os dados da mesa<span className="sexta-reticencias" /></div>}
                            </div>
                        </div>
                    )}
                </div>

                <AtalhosChat />

                <div className="sexta-envio">
                    {nomeArquivo && (
                        <div className="sexta-anexo">
                            <span>📄 {nomeArquivo}</span>
                            <button onClick={() => { setArquivoTexto(''); setNomeArquivo(''); }} className="sexta-anexo-remover" title="Remover arquivo" aria-label="Remover arquivo">✕</button>
                        </div>
                    )}
                    <div className="sexta-envio-linha">
                        <input type="file" ref={fileInputRef} accept=".pdf,.txt,.md" onChange={handleArquivoSelecionado} style={{ display: 'none' }} />
                        <button className={`btn-neon sexta-envio-anexar${nomeArquivo ? ' com-anexo' : ''}`} onClick={() => fileInputRef.current?.click()} title="Anexar PDF, TXT ou MD" aria-label="Anexar PDF, TXT ou MD">📎</button>
                        <CampoMensagem />
                        <BotaoMicrofone />
                        <button className="btn-neon sexta-envio-btn" onClick={enviarMensagem} disabled={!podeEnviar}>{carregando ? '...' : 'ENVIAR'}</button>
                    </div>
                </div>
            </div>
            <PainelContextoSexta />
        </div>
    );
}

export function AITierList() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { tierListAtiva, handleDragOver, handleDrop, handleDragStart, moverPersonagem, poolPersonagens, novoPersonagem, setNovoPersonagem, novoAvatar, setNovoAvatar, adicionarCustomizado, podeEditarRegistros } = ctx;

    return (
        <div className="def-box" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <AICapituladorHeader />
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '5px', marginBottom: '20px' }}>
                {TODOS_RANKS.map(rank => {
                    const personagensNesteRank = tierListAtiva.filter(p => p.rank === rank.id);
                    const isEmpty = personagensNesteRank.length === 0;

                    return (
                        <div key={rank.id} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, rank.id)} style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', border: `1px dashed ${rank.cor}80`, borderRadius: '5px', minHeight: isEmpty ? '40px' : '65px', opacity: isEmpty ? 0.5 : 1, transition: 'all 0.2s' }}>
                            <div style={{ width: isEmpty ? '50px' : '80px', background: rank.cor, color: rank.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isEmpty ? '1em' : '1.6em', fontWeight: 'bold', textShadow: '0 0 3px rgba(255,255,255,0.4)', transition: 'all 0.2s' }}>{rank.id}</div>
                            <div style={{ flex: 1, padding: '5px 10px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                {personagensNesteRank.map((pers, i) => (
                                    <div key={i} draggable={podeEditarRegistros} onDragStart={(e) => handleDragStart(e, pers)} style={{ cursor: podeEditarRegistros ? 'grab' : 'default', background: 'rgba(0,0,0,0.8)', padding: '5px 12px', borderRadius: '30px', border: `1px solid ${rank.cor}`, color: '#fff', fontSize: '0.9em', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: `0 0 8px ${rank.cor}40` }}>
                                        {pers.avatar && <img src={pers.avatar} alt={pers.nome} style={{ width: '35px', height: '35px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${rank.cor}`, backgroundColor: '#222' }} onError={(e) => { e.target.style.display = 'none'; }} />}
                                        {pers.nome}
                                        {podeEditarRegistros && <span style={{ cursor: 'pointer', color: '#ff003c', fontSize: '1.4em', lineHeight: '0.5', paddingLeft: '5px' }} onClick={() => moverPersonagem(pers, 'pool')} title="Devolver ao Banco">×</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>

            {podeEditarRegistros && (
            <div style={{ borderTop: '2px solid #333', paddingTop: '15px' }}>
                <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, 'pool')} style={{ minHeight: '80px', background: 'rgba(0,0,0,0.3)', border: '2px dashed #555', borderRadius: '8px', padding: '15px', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h4 style={{ margin: 0, color: '#aaa' }}>📦 Banco de Entidades Expandido (Arraste para classificar)</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {poolPersonagens.length === 0 && <span style={{ color: '#555', fontStyle: 'italic', fontSize: '0.9em' }}>Nenhum avatar ou transformação sobrando.</span>}
                        {poolPersonagens.map((pers, i) => (
                            <div key={i} draggable onDragStart={(e) => handleDragStart(e, pers)} style={{ cursor: 'grab', background: '#222', padding: '5px 15px', borderRadius: '20px', border: '1px solid #555', color: '#ccc', fontSize: '0.85em', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <img src={pers.avatar} alt={pers.nome} style={{ width: '25px', height: '25px', borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                                {pers.nome}
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: '#666', fontSize: '0.8em', flex: '1 1 100%' }}>Criar entidade manual (NPCs sem ficha):</span>
                    <input className="input-neon" placeholder="Nome do Inimigo" value={novoPersonagem} onChange={(e) => setNovoPersonagem(e.target.value)} style={{ flex: '1 1 200px', padding: '8px', color: '#fff', borderColor: '#444' }} />
                    <input className="input-neon" placeholder="URL da Foto (opcional)" value={novoAvatar} onChange={(e) => setNovoAvatar(e.target.value)} style={{ flex: '1 1 200px', padding: '8px', color: '#fff', borderColor: '#444' }} />
                    <button className="btn-neon btn-blue" onClick={adicionarCustomizado} style={{ flex: 'none', width: 'auto', padding: '0 20px', height: '40px', margin: 0 }}>+ CRIAR NOVO</button>
                </div>
            </div>
            )}
        </div>
    );
}

function dataCurta(ms) {
    const d = new Date(Number(ms));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// 🕘 Versões do arco aberto: lista (mais nova primeiro), prévia e restaurar.
function VersoesArcoModal({ aoFechar }) {
    const ctx = useAIForm();
    const [versoes, setVersoes] = useState(null);
    const [selecionada, setSelecionada] = useState(null);
    const [erro, setErro] = useState('');
    const listar = ctx?.listarVersoesDoArcoAtivo;
    useEffect(() => {
        let ativo = true;
        if (!listar) return undefined;
        listar().then((lista) => { if (ativo) { setVersoes(lista); setSelecionada(lista[0] || null); } })
            .catch(() => { if (ativo) { setVersoes([]); setErro('Não foi possível carregar as versões.'); } });
        return () => { ativo = false; };
    }, [listar]);
    if (!ctx) return null;
    const restaurar = async () => {
        if (!selecionada) return;
        const ok = await ctx.dialogos.confirmar({ titulo: '🕘 Restaurar versão', mensagem: `Trocar o texto de "${ctx.arcoAtivoObj?.titulo}" pela versão de ${dataCurta(selecionada.em)}? O texto atual vira uma versão e pode ser recuperado.`, textoConfirmar: 'Restaurar' });
        if (!ok) return;
        if (ctx.restaurarVersao(selecionada)) { ctx.dialogos.avisar('✅ Versão restaurada.'); aoFechar(); }
    };
    return (
        <ModalSexta titulo={`🕘 Versões de "${ctx.arcoAtivoObj?.titulo || ''}"`} aoFechar={aoFechar} largura="larga"
            rodape={<><button type="button" className="btn-neon sexta-modal-btn" onClick={aoFechar}>Fechar</button><button type="button" className="btn-neon btn-green sexta-modal-btn" onClick={restaurar} disabled={!selecionada}>Restaurar esta versão</button></>}>
            {versoes === null && <p className="sexta-modal-mensagem">Carregando...</p>}
            {erro && <p className="sexta-modal-mensagem">{erro}</p>}
            {versoes && versoes.length === 0 && !erro && <p className="sexta-modal-mensagem">Ainda não há versões guardadas deste arco. Elas são criadas antes de edições, de textos acrescentados pela Sexta-Feira e de restaurações.</p>}
            {versoes && versoes.length > 0 && (
                <div className="sexta-versoes">
                    <ul className="sexta-versoes-lista">
                        {versoes.map(v => (
                            <li key={v.id}>
                                <button type="button" className={`sexta-versao${selecionada?.id === v.id ? ' ativa' : ''}`} onClick={() => setSelecionada(v)}>
                                    <strong>{dataCurta(v.em)}</strong>
                                    <small>{v.autor ? `${v.autor} · ` : ''}{v.motivo || 'versão'} · {v.texto.length.toLocaleString('pt-BR')} caracteres</small>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <pre className="sexta-versao-previa">{selecionada?.texto || ''}</pre>
                </div>
            )}
        </ModalSexta>
    );
}

// ♻️ Lixeira: capítulos e arcos apagados, com restaurar.
function LixeiraModal({ aoFechar }) {
    const ctx = useAIForm();
    const [itens, setItens] = useState(null);
    const carregar = ctx?.carregarLixeira;
    useEffect(() => {
        let ativo = true;
        if (!carregar) return undefined;
        carregar().then((lista) => { if (ativo) setItens(lista); }).catch(() => { if (ativo) setItens([]); });
        return () => { ativo = false; };
    }, [carregar]);
    if (!ctx) return null;
    const restaurar = async (item) => {
        try {
            if (await ctx.restaurarDaLixeira(item)) {
                setItens(prev => (prev || []).filter(i => i.id !== item.id));
                ctx.dialogos.avisar(`✅ ${item.tipo === 'capitulo' ? 'Capítulo' : 'Arco'} "${item.dados?.titulo || ''}" restaurado.`);
            }
        } catch (e) { ctx.dialogos.avisar('Não foi possível restaurar.', 'erro'); }
    };
    return (
        <ModalSexta titulo="♻️ Lixeira dos Registros" aoFechar={aoFechar} largura="larga" rodape={<button type="button" className="btn-neon sexta-modal-btn" onClick={aoFechar}>Fechar</button>}>
            {itens === null && <p className="sexta-modal-mensagem">Carregando...</p>}
            {itens && itens.length === 0 && <p className="sexta-modal-mensagem">A Lixeira está vazia.</p>}
            {itens && itens.length > 0 && (
                <ul className="sexta-memoria-lista">
                    {itens.map(item => (
                        <li key={item.id} className="sexta-memoria-item">
                            <span>
                                {item.tipo === 'capitulo' ? '📖' : '📂'} <strong>{item.dados?.titulo || '(sem título)'}</strong>
                                <small className="sexta-lixeira-info"> · {item.foco === 'futuro' ? 'Futuro' : 'Presente'} · apagado em {dataCurta(item.em)}{item.autor ? ` por ${item.autor}` : ''}</small>
                            </span>
                            <button type="button" className="sexta-chip-btn verde" onClick={() => restaurar(item)}>↩️ Restaurar</button>
                        </li>
                    ))}
                </ul>
            )}
        </ModalSexta>
    );
}

// 🔎 + 🗺️ Coluna dos Registros: busca por termo e linha do tempo (capítulos e arcos em ordem).
function NavegadorRegistros() {
    const ctx = useAIForm();
    const [termo, setTermo] = useState('');
    const resultados = useMemo(() => (ctx ? buscarNosRegistros({
        capitulosPresente: ctx.capitulosPresente, capitulosFuturo: ctx.capitulosFuturo, incluirFuturo: ctx.podeVerFuturo,
    }, termo) : []), [ctx?.capitulosPresente, ctx?.capitulosFuturo, ctx?.podeVerFuturo, termo]);
    if (!ctx) return null;
    const { loreFoco, setLoreFoco, capitulosPresente, capitulosFuturo, capituloAtivoObj, arcoAtivoObj,
        setCapituloAtivoId, setArcoAtivoIdPresente, setCapFuturoAtivoId, setArcoAtivoIdFuturo } = ctx;
    const abrir = (foco, capId, arcId) => {
        setLoreFoco(foco);
        if (foco === 'presente') { setCapituloAtivoId(capId); setArcoAtivoIdPresente(arcId); }
        else { setCapFuturoAtivoId(capId); setArcoAtivoIdFuturo(arcId); }
    };
    const capitulos = loreFoco === 'presente' ? capitulosPresente : capitulosFuturo;
    const buscando = termo.trim().length >= 2;
    return (
        <nav className="sexta-registros-nav" aria-label="Navegar pelos Registros">
            <input className="input-neon sexta-registros-busca" type="search" value={termo} onChange={e => setTermo(e.target.value)} placeholder="🔎 Buscar nos Registros..." aria-label="Buscar nos Registros" />
            {buscando ? (
                <div className="sexta-registros-resultados">
                    <div className="sexta-painel-titulo">{resultados.length} resultado(s)</div>
                    {resultados.length === 0 && <p className="sexta-registros-vazio">Nada encontrado.</p>}
                    {resultados.map(r => (
                        <button key={`${r.foco}-${r.capituloId}-${r.arcoId}`} type="button" className="sexta-registros-resultado" onClick={() => abrir(r.foco, r.capituloId, r.arcoId)}>
                            <strong>{r.foco === 'futuro' ? '🚀 ' : ''}{r.capituloTitulo} › {r.arcoTitulo}</strong>
                            <small>{r.ocorrencias > 0 ? `${r.ocorrencias}× · ` : ''}{r.trecho}</small>
                        </button>
                    ))}
                </div>
            ) : (
                <ol className="sexta-linha-tempo">
                    {capitulos.map((cap, i) => (
                        <li key={cap.id} className={`sexta-linha-tempo-cap${capituloAtivoObj?.id === cap.id ? ' ativo' : ''}`}>
                            <span className="sexta-linha-tempo-marco" aria-hidden="true">{i + 1}</span>
                            <div>
                                <div className="sexta-linha-tempo-titulo">{cap.titulo}</div>
                                <ul>
                                    {(cap.arcos || []).map(arco => (
                                        <li key={arco.id}>
                                            <button type="button" className={`sexta-linha-tempo-arco${capituloAtivoObj?.id === cap.id && arcoAtivoObj?.id === arco.id ? ' ativo' : ''}`} onClick={() => abrir(loreFoco, cap.id, arco.id)}>
                                                {arco.titulo}
                                                <small>{(arco.texto || '').length.toLocaleString('pt-BR')} car.</small>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </nav>
    );
}

export function AILore() {
    const ctx = useAIForm();
    const [modal, setModal] = useState(null);
    if (!ctx) return FALLBACK;
    const { textoAtivo, atualizarTexto, loreFoco, podeEditarRegistros, historicoDisponivel } = ctx;

    return (
        <div className="def-box sexta-registros">
            <AICapituladorHeader />
            {historicoDisponivel && (
                <div className="sexta-registros-ferramentas">
                    <button type="button" className="sexta-chip-btn" onClick={() => setModal('versoes')}>🕘 Versões deste Arco</button>
                    <button type="button" className="sexta-chip-btn" onClick={() => setModal('lixeira')}>♻️ Lixeira</button>
                </div>
            )}
            <div className="sexta-registros-corpo">
                <NavegadorRegistros />
                <textarea className={`input-neon sexta-registros-texto ${loreFoco === 'presente' ? 'presente' : 'futuro'}`} value={textoAtivo} readOnly={!podeEditarRegistros} onChange={e => atualizarTexto(e.target.value)} placeholder="A história deste Arco será escrita aqui..." aria-label="Texto do Arco" />
            </div>
            {modal === 'versoes' && <VersoesArcoModal aoFechar={() => setModal(null)} />}
            {modal === 'lixeira' && <LixeiraModal aoFechar={() => setModal(null)} />}
        </div>
    );
}

// 📚 CODEX: Registros, Tier List e Árvore ficam juntos numa aba só (são a "enciclopédia" da mesa).
export const ABAS_CODEX = [
    { id: 'lore', rotulo: '📜 Registros' },
    { id: 'tierlist', rotulo: '🏆 Tier List' },
    { id: 'arvore', rotulo: '🌳 Árvore' },
];

function CodexNav() {
    const ctx = useAIForm();
    if (!ctx) return null;
    return (
        <div className="sexta-codex-nav" role="tablist" aria-label="Codex">
            {ABAS_CODEX.map(a => (
                <button key={a.id} type="button" role="tab" aria-selected={ctx.subAba === a.id} className={`sexta-codex-aba${ctx.subAba === a.id ? ' ativa' : ''}`} onClick={() => ctx.setSubAba(a.id)}>{a.rotulo}</button>
            ))}
        </div>
    );
}

export function AIAreaCentral() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { subAba } = ctx;

    if (subAba === 'chat') return <AIChat />;
    if (subAba === 'gravador') return <div style={{ flex: 1, overflowY: 'auto' }}><GravadorPanel /></div>;
    if (subAba === 'config') return <AIConfig />;
    if (ABAS_CODEX.some(a => a.id === subAba)) {
        return (
            <div className="sexta-codex">
                <CodexNav />
                {subAba === 'lore' && <AILore />}
                {subAba === 'tierlist' && <AITierList />}
                {subAba === 'arvore' && <AIArvoreGenealogica />}
            </div>
        );
    }
    return null;
}

// ⚙️ CONFIGURAÇÃO DA SEXTA-FEIRA (só Mestre/Co-Mestre): chave gratuita do Gemini (Google AI
// Studio) + modelo, gravados na mesa. O projeto está no plano gratuito do Firebase, então o
// navegador de cada jogador usa esta chave pra falar direto com o Gemini.
export function AIConfig() {
    const ctx = useAIForm();
    const configAtual = ctx?.sextaFeiraConfig;
    const [chave, setChave] = useState(configAtual?.chaveGemini || '');
    const [modelo, setModelo] = useState(configAtual?.modelo || MODELO_GEMINI_PADRAO);
    const [mostrarChave, setMostrarChave] = useState(false);
    const [status, setStatus] = useState('');
    const [modelos, setModelos] = useState([]);
    const [testando, setTestando] = useState(false);

    useEffect(() => {
        setChave(configAtual?.chaveGemini || '');
        setModelo(configAtual?.modelo || MODELO_GEMINI_PADRAO);
    }, [configAtual?.chaveGemini, configAtual?.modelo]);

    if (!ctx) return FALLBACK;
    if (!ctx.isMestre) return <div className="def-box sexta-config"><p>Somente o Mestre configura a Sexta-Feira.</p></div>;

    const salvar = async (novaChave) => {
        setStatus('Salvando...');
        try {
            await ctx.salvarConfigSextaFeira({ chaveGemini: novaChave, modelo });
            setStatus(novaChave.trim() ? '✅ Configuração salva. A Sexta-Feira já está disponível para a mesa.' : '🗑️ Chave removida. A Sexta-Feira ficou offline.');
        } catch (e) {
            const negado = String(e?.code || e?.message || '').toLowerCase().includes('permission');
            setStatus(negado
                ? '❌ O banco recusou a gravação (regras do Realtime Database). Libere o nó "sextaFeira" dentro de mesas/$mesaId nas Regras do Firebase.'
                : `❌ Não foi possível salvar (${e?.message || 'erro desconhecido'}).`);
        }
    };

    const testarChave = async () => {
        setTestando(true);
        setStatus('Testando a chave...');
        try {
            const lista = await listarModelosGemini({ chave: chave.trim() });
            setModelos(lista);
            setStatus(lista.length
                ? `✅ Chave válida. ${lista.length} modelo(s) disponível(is): escolha um na lista e salve.`
                : '⚠️ A chave respondeu, mas não listou nenhum modelo de texto.');
        } catch (e) {
            setModelos([]);
            setStatus(`❌ ${e?.message || 'Não foi possível testar a chave.'}`);
        } finally {
            setTestando(false);
        }
    };

    return (
        <div className="def-box sexta-config">
            <h3 className="sexta-config-titulo">⚙️ Configuração da Sexta-Feira</h3>
            <p className="sexta-config-texto">
                A Sexta-Feira usa o Gemini direto do navegador com uma <strong>chave gratuita</strong> do Google AI Studio.
                Sem faturamento no projeto dessa chave, o uso nunca gera cobrança: ao passar do limite gratuito ela só pausa até a cota renovar.
            </p>
            <ol className="sexta-config-passos">
                <li>Com uma <strong>conta Google pessoal (@gmail.com)</strong>, acesse <strong>aistudio.google.com</strong> e clique em <strong>Get API key</strong> → <strong>Create API key</strong>. Contas de empresa/escola costumam bloquear chaves.</li>
                <li>No AI Studio, confira se a chave está no plano <strong>Free (gratuito)</strong>, sem faturamento vinculado.</li>
                <li>Cole a chave abaixo, clique em <strong>Testar chave</strong>, escolha o modelo e salve. Todos da mesa passam a usar a Sexta-Feira.</li>
            </ol>
            <label className="sexta-config-campo">
                <span>Chave do Gemini</span>
                <div className="sexta-config-linha">
                    <input className="input-neon" type={mostrarChave ? 'text' : 'password'} value={chave} onChange={e => setChave(e.target.value)} placeholder="AIza..." autoComplete="off" spellCheck={false} />
                    <button type="button" className="btn-neon sexta-config-btn-icone" onClick={() => setMostrarChave(v => !v)} title={mostrarChave ? 'Esconder chave' : 'Mostrar chave'}>{mostrarChave ? '🙈' : '👁️'}</button>
                    <button type="button" className="btn-neon btn-blue sexta-config-btn-icone" onClick={testarChave} disabled={!chave.trim() || testando}>{testando ? '...' : '🔍 Testar chave'}</button>
                </div>
            </label>
            <label className="sexta-config-campo">
                <span>Modelo</span>
                {modelos.length > 0 ? (
                    <select className="input-neon" value={modelo} onChange={e => setModelo(e.target.value)}>
                        {!modelos.some(m => m.id === modelo) && <option value={modelo}>{modelo} (atual)</option>}
                        {modelos.map(m => <option key={m.id} value={m.id}>{m.nome} — {m.id}</option>)}
                    </select>
                ) : (
                    <input className="input-neon" type="text" value={modelo} onChange={e => setModelo(e.target.value)} placeholder={MODELO_GEMINI_PADRAO} spellCheck={false} />
                )}
            </label>
            <div className="sexta-config-linha">
                <button type="button" className="btn-neon btn-green" onClick={() => salvar(chave)} disabled={!chave.trim()}>💾 Salvar</button>
                {configAtual?.chaveGemini && (
                    <button type="button" className="btn-neon btn-red" onClick={async () => { if (await ctx.dialogos.confirmar({ titulo: '🗑️ Remover chave', mensagem: 'Remover a chave? A Sexta-Feira ficará offline para toda a mesa.', textoConfirmar: 'Remover', perigo: true })) { setChave(''); salvar(''); } }}>🗑️ Remover chave</button>
                )}
            </div>
            {status && <p className="sexta-config-status">{status}</p>}
            <MemoriaMesaConfig />
            <p className="sexta-config-aviso">⚠️ Qualquer pessoa desta mesa consegue ler a chave (o navegador dela precisa usá-la). Use uma chave só para isto. Se desconfiar de abuso, apague a chave no AI Studio, crie outra e salve aqui: vale para a mesa toda na hora.</p>
        </div>
    );
}

// 📌 Memória permanente da mesa: fatos que a Sexta-Feira lembra em toda conversa (gravados pelo
// botão "Memorizar" nas respostas ou quando o Mestre pede no chat). Só o Mestre vê e apaga aqui.
function MemoriaMesaConfig() {
    const ctx = useAIForm();
    if (!ctx) return null;
    const fatos = Object.entries(ctx.sextaFeiraMemoria || {})
        .filter(([, f]) => f && f.texto)
        .sort(([, a], [, b]) => (Number(b.em) || 0) - (Number(a.em) || 0));
    return (
        <div className="sexta-memoria">
            <h4 className="sexta-config-titulo">📌 Memória da mesa ({fatos.length})</h4>
            {fatos.length === 0 ? (
                <p className="sexta-config-texto">Nada memorizado ainda. Use "📌 Memorizar" numa resposta da Sexta-Feira, ou peça no chat: "lembre que...".</p>
            ) : (
                <ul className="sexta-memoria-lista">
                    {fatos.map(([id, f]) => (
                        <li key={id} className="sexta-memoria-item">
                            <span>{f.soMestre ? '🔒 ' : ''}{f.texto}</span>
                            <button type="button" className="sexta-chip-btn vermelho" onClick={async () => { if (await ctx.dialogos.confirmar({ titulo: '🗑️ Esquecer fato', mensagem: `Apagar da memória da Sexta-Feira: "${f.texto}"?`, textoConfirmar: 'Apagar', perigo: true })) ctx.esquecerFato(id); }} title="Esquecer">🗑️</button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
