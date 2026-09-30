import React, { useEffect, useState } from 'react';
import { useAIForm, TODOS_RANKS } from './AIFormContext';
import { MODELO_GEMINI_PADRAO } from '../../core/sextaFeira';
import GravadorPanel from './GravadorPanel';
import AIArvoreGenealogica from './AIArvoreGenealogica'; // <-- ADIÇÃO: Importando o novo componente

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>AI provider não encontrado</div>;

export function AIHeader() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { subAba, setSubAba, isMestre, iaConfigurada } = ctx;

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #00ffcc', paddingBottom: 10 }}>
            <h2 style={{ color: '#00ffcc', textShadow: '0 0 10px #00ffcc', margin: 0 }}>
                Sexta-Feira (IA Central)
                <span className={`sexta-status ${iaConfigurada ? 'online' : 'offline'}`}>{iaConfigurada ? '● online' : '● sem chave'}</span>
            </h2>
            <div style={{ display: 'flex', gap: '5px' }}>
                <button className={`btn-neon ${subAba === 'chat' ? 'btn-green' : ''}`} onClick={() => setSubAba('chat')} style={{ padding: '5px 10px', margin: 0 }}>💬 Chat</button>
                <button className={`btn-neon ${subAba === 'gravador' ? 'btn-red' : ''}`} onClick={() => setSubAba('gravador')} style={{ padding: '5px 10px', margin: 0 }}>🎙️ Gravador</button>
                <button className={`btn-neon ${subAba === 'tierlist' ? 'btn-gold' : ''}`} onClick={() => setSubAba('tierlist')} style={{ padding: '5px 10px', margin: 0 }}>🏆 Tier List</button>
                <button className={`btn-neon ${subAba === 'lore' ? 'btn-blue' : ''}`} onClick={() => setSubAba('lore')} style={{ padding: '5px 10px', margin: 0 }}>📜 Registros</button>
                {/* 👇 ADIÇÃO: O NOVO BOTÃO ENTRA AQUI 👇 */}
                <button className={`btn-neon ${subAba === 'arvore' ? 'btn-purple' : ''}`} onClick={() => setSubAba('arvore')} style={{ padding: '5px 10px', margin: 0, borderColor: subAba === 'arvore' ? '#b180ff' : '', color: subAba === 'arvore' ? '#b180ff' : '' }}>🌳 Árvore</button>
                {isMestre && (
                    <button className={`btn-neon ${subAba === 'config' ? 'btn-gold' : ''}`} onClick={() => setSubAba('config')} style={{ padding: '5px 10px', margin: 0 }}>⚙️ Config</button>
                )}
            </div>
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

export function AIChat() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { chatRef, historico, meuNome, mensagem, setMensagem, handleKeyDown, carregando, enviarMensagem, arquivoTexto, nomeArquivo, setArquivoTexto, setNomeArquivo, fileInputRef, handleArquivoSelecionado, limparChat, salvarNoRegistro, loreFoco, capitulosPresente, capitulosFuturo, podeEditarRegistros } = ctx;

    const [destinoLore, setDestinoLore] = useState('novo_capitulo');
    const arcosDisponiveis = loreFoco === 'presente' ? capitulosPresente : capitulosFuturo;

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-5px', padding: '0 5px' }}>
                <span style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold' }}>📡 Memória Neural Ativa para: {meuNome}</span>
                {historico.length > 0 && (
                    <button onClick={limparChat} style={{ background: 'none', border: 'none', color: '#ff003c', cursor: 'pointer', fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }} title="Zerar a conversa com a IA">
                        🗑️ Limpar Memória
                    </button>
                )}
            </div>

            <div ref={chatRef} className="def-box" style={{ flex: 1, minHeight: '300px', maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', padding: '15px' }}>
                {historico.length === 0 && <div style={{ color: '#555', textAlign: 'center', fontStyle: 'italic', marginTop: '40px' }}>A Sexta-Feira está online e pronta para ajudar.</div>}
                {historico.map((msg, i) => (
                    <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: msg.role === 'user' ? 'rgba(0, 255, 204, 0.15)' : msg.role === 'erro' ? 'rgba(255, 0, 60, 0.15)' : 'rgba(0, 136, 255, 0.15)', border: `1px solid ${msg.role === 'user' ? '#00ffcc' : msg.role === 'erro' ? '#ff003c' : '#0088ff'}`, color: '#ddd', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.95em' }}>
                            <div style={{ fontSize: '0.7em', fontWeight: 'bold', marginBottom: '4px', color: msg.role === 'user' ? '#00ffcc' : msg.role === 'erro' ? '#ff003c' : '#0088ff' }}>{msg.role === 'user' ? meuNome?.toUpperCase() : msg.role === 'erro' ? 'ERRO' : 'SEXTA-FEIRA'}</div>
                            {msg.texto}
                        </div>
                        
                        {/* 🔥 SELETOR HIERÁRQUICO NO CHAT 🔥 */}
                        {msg.role === 'ai' && podeEditarRegistros && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', background: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '5px', border: '1px solid #333', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75em', color: '#aaa' }}>Destino:</span>
                                <select className="input-neon" value={destinoLore} onChange={e => setDestinoLore(e.target.value)} style={{ padding: '2px 5px', fontSize: '0.75em', maxWidth: '200px', borderColor: '#444', color: '#fff' }}>
                                    <option value="novo_capitulo">➕ Criar Novo Capítulo Inteiro</option>
                                    {arcosDisponiveis.map(cap => (
                                        <optgroup key={cap.id} label={`📖 ${cap.titulo}`}>
                                            <option value={`novo_arco_${cap.id}`}>➕ Novo Arco aqui dentro</option>
                                            {cap.arcos.map(a => <option key={a.id} value={`${cap.id}_${a.id}`}>📂 {a.titulo}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => {
                                        if (salvarNoRegistro(msg.texto, 'Análise da Sexta-Feira', destinoLore, loreFoco)) {
                                            alert('✅ Texto transferido com sucesso para o Arco selecionado!');
                                        }
                                    }}
                                    className="btn-neon btn-blue"
                                    style={{ padding: '4px 10px', fontSize: '0.75em', margin: 0, opacity: 0.9 }}
                                >
                                    📜 Enviar
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', width: '100%' }}>
                {nomeArquivo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255, 204, 0, 0.1)', border: '1px solid #ffcc00', borderRadius: '6px' }}>
                        <span style={{ color: '#ffcc00', fontSize: '0.85em' }}>📄 {nomeArquivo}</span>
                        <button onClick={() => { setArquivoTexto(''); setNomeArquivo(''); }} style={{ cursor: 'pointer', color: '#ff003c', fontWeight: 'bold', marginLeft: 'auto', background: 'none', border: 'none', padding: '2px 6px', fontSize: '1em' }} title="Remover arquivo">✕</button>
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'row', gap: '10px', alignItems: 'flex-start' }}>
                    <input type="file" ref={fileInputRef} accept=".pdf,.txt,.md" onChange={handleArquivoSelecionado} style={{ display: 'none' }} />
                    <button className="btn-neon" onClick={() => fileInputRef.current?.click()} title="Anexar PDF, TXT ou MD" style={{ flex: 'none', width: '45px', height: '60px', padding: 0, margin: 0, borderColor: nomeArquivo ? '#ffcc00' : '#555', color: nomeArquivo ? '#ffcc00' : '#888', fontSize: '1.2em' }}>📎</button>
                    <textarea className="input-neon" placeholder="Fale com a Sexta-Feira..." value={mensagem} onChange={e => setMensagem(e.target.value)} onKeyDown={handleKeyDown} disabled={carregando} style={{ flex: 1, minHeight: '60px', resize: 'vertical', borderColor: '#00ffcc', color: '#fff', padding: '12px', boxSizing: 'border-box' }} />
                    <button className="btn-neon" onClick={enviarMensagem} disabled={carregando || (!mensagem.trim() && !arquivoTexto)} style={{ flex: '0 0 auto', width: '120px', minWidth: '120px', height: '60px', padding: '0 20px', borderColor: '#00ffcc', color: '#00ffcc', margin: 0, opacity: (carregando || (!mensagem.trim() && !arquivoTexto)) ? 0.4 : 1 }}>{carregando ? '...' : 'ENVIAR'}</button>
                </div>
            </div>
        </>
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

export function AILore() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { textoAtivo, atualizarTexto, loreFoco, podeEditarRegistros } = ctx;

    return (
        <div className="def-box" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <AICapituladorHeader />
            <textarea className="input-neon" value={textoAtivo} readOnly={!podeEditarRegistros} onChange={e => atualizarTexto(e.target.value)} placeholder={`A história deste Arco será escrita aqui...`} style={{ flex: 1, width: '100%', resize: 'none', borderColor: loreFoco === 'presente' ? '#00ffcc' : '#ffcc00', color: '#ddd', lineHeight: '1.6', padding: '15px', boxSizing: 'border-box', transition: 'border-color 0.3s' }} />
        </div>
    );
}

export function AIAreaCentral() {
    const ctx = useAIForm();
    if (!ctx) return FALLBACK;
    const { subAba } = ctx;

    if (subAba === 'chat') return <AIChat />;
    if (subAba === 'gravador') return <div style={{ flex: 1, overflowY: 'auto' }}><GravadorPanel /></div>;
    if (subAba === 'tierlist') return <AITierList />;
    if (subAba === 'lore') return <AILore />;
    {/* 👇 ADIÇÃO: O ROTEADOR DA NOVA ABA 👇 */}
    if (subAba === 'arvore') return <AIArvoreGenealogica />;
    if (subAba === 'config') return <AIConfig />;
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
            setStatus('❌ Não foi possível salvar. Verifique a conexão.');
        }
    };

    return (
        <div className="def-box sexta-config">
            <h3 className="sexta-config-titulo">⚙️ Configuração da Sexta-Feira</h3>
            <p className="sexta-config-texto">
                A Sexta-Feira usa o Gemini direto do navegador com uma <strong>chave gratuita</strong> do Google AI Studio.
                Sem faturamento ativado no projeto dessa chave, o uso nunca gera cobrança: ao passar do limite gratuito ela só pausa até a cota renovar.
            </p>
            <ol className="sexta-config-passos">
                <li>Acesse <strong>aistudio.google.com</strong> e clique em <strong>Get API key</strong> → <strong>Create API key</strong>.</li>
                <li>Recomendado: no Google Cloud (APIs e serviços → Credenciais → a chave), em <strong>Restrições de aplicativos</strong>, escolha <strong>Sites</strong> e adicione <code>https://rpg-referencias.web.app/*</code>. Assim a chave só funciona no site da mesa.</li>
                <li>Cole a chave abaixo e salve. Todos da mesa passam a usar a Sexta-Feira.</li>
            </ol>
            <label className="sexta-config-campo">
                <span>Chave do Gemini</span>
                <div className="sexta-config-linha">
                    <input className="input-neon" type={mostrarChave ? 'text' : 'password'} value={chave} onChange={e => setChave(e.target.value)} placeholder="AIza..." autoComplete="off" spellCheck={false} />
                    <button type="button" className="btn-neon" onClick={() => setMostrarChave(v => !v)} title={mostrarChave ? 'Esconder chave' : 'Mostrar chave'}>{mostrarChave ? '🙈' : '👁️'}</button>
                </div>
            </label>
            <label className="sexta-config-campo">
                <span>Modelo</span>
                <input className="input-neon" type="text" value={modelo} onChange={e => setModelo(e.target.value)} placeholder={MODELO_GEMINI_PADRAO} spellCheck={false} />
            </label>
            <div className="sexta-config-linha">
                <button type="button" className="btn-neon btn-green" onClick={() => salvar(chave)} disabled={!chave.trim()}>💾 Salvar</button>
                {configAtual?.chaveGemini && (
                    <button type="button" className="btn-neon btn-red" onClick={() => { if (window.confirm('Remover a chave? A Sexta-Feira ficará offline para toda a mesa.')) { setChave(''); salvar(''); } }}>🗑️ Remover chave</button>
                )}
            </div>
            {status && <p className="sexta-config-status">{status}</p>}
            <p className="sexta-config-aviso">⚠️ Qualquer pessoa desta mesa consegue ler a chave (o navegador dela precisa usá-la). Use uma chave só para isto, com a restrição de site acima.</p>
        </div>
    );
}
