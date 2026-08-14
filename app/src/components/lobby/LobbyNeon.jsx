import React, { useState, useEffect } from 'react';
import { ref, set, get } from 'firebase/database';
import { db } from '../../services/firebase-config';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { verificarMesaExistente, registrarNovaMesa, sairConta } from '../../services/firebase-sync';
import Swal from 'sweetalert2';

export default function LobbyNeon() {
    const setMesaId = useStore(s => s.setMesaId);
    const userLogado = useStore(s => s.userLogado);
    const setMeuNome = useStore(s => s.setMeuNome);
    
    const [codigoSala, setCodigoSala] = useState('');
    const [abaMesas, setAbaMesas] = useState('jogador');
    const [ping, setPing] = useState(12);

    const [mostrarConfig, setMostrarConfig] = useState(false);
    const [temaAtivo, setTemaAtivo] = useState(localStorage.getItem('rpg_tema') || 'theme-cyber');
    const [fonteAtiva, setFonteAtiva] = useState(localStorage.getItem('rpg_fonte') || 'sans-serif');
    const [brilho, setBrilho] = useState(localStorage.getItem('rpg_brilho') || '100');
    
    const [volumeGeral, setVolumeGeral] = useState(localStorage.getItem('rpg_volume') || '50');
    const [modoDesempenho, setModoDesempenho] = useState(localStorage.getItem('rpg_desempenho') === 'true');
    const [sfxAtivo, setSfxAtivo] = useState(localStorage.getItem('rpg_sfx') !== 'false');

    const [canInstall, setCanInstall] = useState(!!window.deferredPrompt);

    const [minhasMesas, setMinhasMesas] = useState([]);

    useEffect(() => {
        if (userLogado) {
            setMeuNome(userLogado);
            localStorage.setItem('rpgNome', userLogado);
        }
    }, [userLogado, setMeuNome]);

    useEffect(() => {
        const handleReady = () => setCanInstall(true);
        window.addEventListener('pwa-ready', handleReady);
        return () => window.removeEventListener('pwa-ready', handleReady);
    }, []);

    const handleInstallClick = async () => {
        if (!window.deferredPrompt) return;
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        if (outcome === 'accepted') { window.deferredPrompt = null; setCanInstall(false); }
    };

    useEffect(() => {
        const interval = setInterval(() => setPing(Math.floor(Math.random() * 15) + 8), 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        document.body.className = temaAtivo;
        localStorage.setItem('rpg_tema', temaAtivo);
        localStorage.setItem('rpg_fonte', fonteAtiva);
        localStorage.setItem('rpg_brilho', brilho);
        localStorage.setItem('rpg_volume', volumeGeral);
        localStorage.setItem('rpg_desempenho', modoDesempenho);
        localStorage.setItem('rpg_sfx', sfxAtivo);
    }, [temaAtivo, fonteAtiva, brilho, volumeGeral, modoDesempenho, sfxAtivo]);

    const atualizarHistoricoNuvem = async (novaLista) => {
        setMinhasMesas(novaLista);
        if (userLogado) {
            const nomeSanitizado = sanitizarNome(userLogado);
            const chaveLocalIsolada = `rpg_historico_mesas_${nomeSanitizado}`;
            localStorage.setItem(chaveLocalIsolada, JSON.stringify(novaLista));
            try { await set(ref(db, `usuarios/${nomeSanitizado}/historicoMesas`), novaLista); } catch(e){}
        }
    };

    // 🔥 O MOTOR DE FUSÃO COM PROTOCOLO DE RESGATE CORRIGIDO 🔥
    useEffect(() => {
        if (!userLogado) {
            setMinhasMesas([]);
            return;
        }

        const syncHistorico = async () => {
            const nomeSanitizado = sanitizarNome(userLogado);
            const refHistorico = ref(db, `usuarios/${nomeSanitizado}/historicoMesas`);
            const chaveLocalIsolada = `rpg_historico_mesas_${nomeSanitizado}`;
            const chaveLegado = 'rpg_historico_mesas'; // A gaveta antiga partilhada
            
            try {
                const snap = await get(refHistorico);
                let nuvemLista = snap.exists() ? snap.val() : [];
                if (!Array.isArray(nuvemLista)) nuvemLista = Object.values(nuvemLista);

                setMinhasMesas(prevLocal => {
                    const mapUnificado = new Map();
                    
                    let localIsolado = [];
                    try { 
                        const dadosIsolados = localStorage.getItem(chaveLocalIsolada);
                        if (dadosIsolados) {
                            localIsolado = JSON.parse(dadosIsolados) || [];
                        }
                        
                        // 🔥 A CORREÇÃO DE OURO: Agora verificamos se a lista está realmente vazia (length === 0),
                        // em vez de perguntar apenas se o ficheiro existe no disco!
                        if (localIsolado.length === 0) {
                            const dadosLegado = localStorage.getItem(chaveLegado);
                            if (dadosLegado) {
                                localIsolado = JSON.parse(dadosLegado) || [];
                            }
                        }
                    } catch(e) {}

                    // Funde a Nuvem com os dados Locais (seja da gaveta nova ou da resgatada)
                    [...nuvemLista, ...localIsolado].forEach(m => {
                        if (m && m.id && !mapUnificado.has(m.id)) mapUnificado.set(m.id, m);
                    });
                    
                    const listaUnificada = Array.from(mapUnificado.values()).slice(0, 10);

                    // Se recuperamos dados antigos que não estavam na nuvem, faz o upload silencioso!
                    if (listaUnificada.length > nuvemLista.length) {
                        set(refHistorico, listaUnificada).catch(()=>{});
                    }
                    
                    // Salva na NOVA gaveta isolada de forma definitiva
                    localStorage.setItem(chaveLocalIsolada, JSON.stringify(listaUnificada));
                    
                    return listaUnificada;
                });
            } catch (error) {
                console.warn("A nuvem negou a leitura ou falhou. Mantendo os atalhos locais seguros.");
            }
        };
        syncHistorico();
    }, [userLogado]);

    const salvarNoHistorico = (id, nomePersonalizado = id, isMestreTable = false) => {
        let existing = minhasMesas.find(m => m.id === id);
        let finalName = existing ? existing.nome : nomePersonalizado;
        atualizarHistoricoNuvem([{ id, nome: finalName, isMestre: isMestreTable }, ...minhasMesas.filter(m => m.id !== id)].slice(0, 10));
    };

    const removerDoHistorico = (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Esquecer as coordenadas desta mesa?')) return;
        const novaLista = minhasMesas.filter(m => m.id !== id);
        atualizarHistoricoNuvem(novaLista);
    };

    const criarMesa = async () => {
        const decisao = await Swal.fire({ title: 'Proteger com Senha?', showDenyButton: true, showCancelButton: true, confirmButtonText: 'Sim (Com Senha)', denyButtonText: 'Não (Pública)', background: '#0a0a0a', color: '#fff', confirmButtonColor: '#00ffcc', denyButtonColor: '#333' });
        if (decisao.isDismissed) return;
        let senha = '';
        if (decisao.isConfirmed) {
            const { value: s } = await Swal.fire({ title: 'Digite a Senha', input: 'password', background: '#0a0a0a', color: '#fff', confirmButtonColor: '#00ffcc' });
            if (!s) return; senha = s;
        }
        const novoCodigo = 'MESA-' + Math.random().toString(36).substring(2, 7).toUpperCase();
        try { await registrarNovaMesa(novoCodigo, userLogado, senha); salvarNoHistorico(novoCodigo, novoCodigo, true); setMesaId(novoCodigo); } catch (e) { alert("Erro ao criar mesa!"); }
    };

    const entrarMesa = async (idForcado = null) => {
        const id = (idForcado || codigoSala).trim().toUpperCase();
        if (!id) return alert('Digite o código para aceder!');
        const resultado = await verificarMesaExistente(id);
        if (!resultado.existe) return alert('Sinal não encontrado na Membrana!');
        let checkFinal = resultado;
        if (!resultado.senhaCorreta) {
            const { value: s } = await Swal.fire({ title: 'Acesso Restrito!', input: 'password', background: '#0a0a0a', color: '#fff', confirmButtonColor: '#0088ff', showCancelButton: true });
            if (!s) return;
            const reCheck = await verificarMesaExistente(id, s);
            if (!reCheck.senhaCorreta) return Swal.fire({ title: 'Acesso Negado', text: 'Senha Incorreta!', icon: 'error', background: '#0a0a0a', color: '#fff' });
            checkFinal = reCheck;
        }
        salvarNoHistorico(id, id, !!(checkFinal.mestres && checkFinal.mestres[sanitizarNome(userLogado)]));
        setMesaId(id);
    };

    const mesasMestre = minhasMesas.filter(m => m.isMestre);
    const mesasJogador = minhasMesas.filter(m => !m.isMestre);

    return (
        <div style={{
            minHeight: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
            position: 'relative', overflow: 'hidden', padding: '20px 0 20px 5vw',
            backgroundImage: "url('/MenuFundo.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat'
        }}>

            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999, pointerEvents: 'none', background: 'rgba(0,0,0,1)', opacity: 1 - (brilho / 100), transition: 'opacity 0.3s' }} />
            
            <style>{`
                * { font-family: ${fonteAtiva} !important; }
                .hover-lift:hover { transform: translateY(-3px); box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
                ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
            `}</style>

            <div className="fade-in" style={{ padding: '0', maxWidth: '750px', width: '95%', textAlign: 'left', position: 'relative', zIndex: 1 }}>
                
                {/* 🛡️ CABEÇALHO */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.8) 100%)', padding: '15px 25px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: 'linear-gradient(135deg, #444, #111)', color: '#fff', width: '45px', height: '45px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1.4em', border: '1px solid rgba(255,255,255,0.2)' }}>{userLogado.charAt(0).toUpperCase()}</div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ color: '#888', fontSize: '0.65em', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}>Agente</span><strong style={{ color: '#fff', fontSize: '1.2em', letterSpacing: '1px' }}>{userLogado}</strong></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '6px', border: '1px solid #333' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f0', boxShadow: '0 0 8px #0f0' }}></span><span style={{ color: '#0f0', fontSize: '0.7em', fontWeight: 'bold' }}>SYS: {ping}ms</span></div>
                        <button onClick={() => { if(window.confirm('Encerrar conexão?')) sairConta(); }} style={{ background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.3)', color: '#ff3333', cursor: 'pointer', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold' }} className="hover-lift">SAIR 🚪</button>
                    </div>
                </div>

                {/* ⚙️ PAINEL DE CONFIGURAÇÕES */}
                {mostrarConfig ? (
                    <div className="fade-in" style={{ padding: '30px 25px', maxHeight: '75vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
                            <h2 style={{ color: '#fff', margin: 0 }}>⚙️ CALIBRAÇÃO DO SISTEMA</h2>
                            <button onClick={() => setMostrarConfig(false)} className="btn-neon btn-red" style={{ padding: '8px 15px', borderRadius: '8px' }}>FECHAR</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                                <strong style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>1. Espectro Visual (Tema)</strong>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                                    <button onClick={() => setTemaAtivo('theme-cyber')} className={`btn-neon ${temaAtivo === 'theme-cyber' ? 'btn-blue' : ''}`} style={{ padding: '10px', fontSize: '0.85em' }}>🔵 CYBER</button>
                                    <button onClick={() => setTemaAtivo('theme-blood')} className={`btn-neon ${temaAtivo === 'theme-blood' ? 'btn-red' : ''}`} style={{ padding: '10px', fontSize: '0.85em' }}>🩸 SANGUE</button>
                                    <button onClick={() => setTemaAtivo('theme-glass')} className={`btn-neon ${temaAtivo === 'theme-glass' ? 'btn-gold' : ''}`} style={{ padding: '10px', fontSize: '0.85em' }}>⚔️ AÇO</button>
                                    <button onClick={() => setTemaAtivo('theme-arcane')} className={`btn-neon ${temaAtivo === 'theme-arcane' ? 'btn-purple' : ''}`} style={{ padding: '10px', fontSize: '0.85em', borderColor: '#aa00ff', color: temaAtivo === 'theme-arcane' ? '#fff' : '#aa00ff', background: temaAtivo === 'theme-arcane' ? 'rgba(170,0,255,0.3)' : 'transparent' }}>💜 ARCANO</button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                                    <strong style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span>Brilho</span><span style={{ color: '#fff' }}>{brilho}%</span></strong>
                                    <input type="range" min="20" max="100" step="5" value={brilho} onChange={(e) => setBrilho(e.target.value)} style={{ width: '100%', cursor: 'pointer', accentColor: '#00ffcc' }} />
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                                    <strong style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span>Volume Global (Jukebox)</span><span style={{ color: '#fff' }}>{volumeGeral}%</span></strong>
                                    <input type="range" min="0" max="100" step="1" value={volumeGeral} onChange={(e) => setVolumeGeral(e.target.value)} style={{ width: '100%', cursor: 'pointer', accentColor: '#0088ff' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: modoDesempenho ? 'rgba(255,204,0,0.1)' : 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '10px', border: `1px solid ${modoDesempenho ? '#ffcc00' : '#333'}`, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={modoDesempenho} onChange={e => setModoDesempenho(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                                    <div><strong style={{ color: modoDesempenho ? '#ffcc00' : '#aaa', display: 'block' }}>Modo Desempenho</strong><span style={{ color: '#666', fontSize: '0.7em' }}>Reduz animações e partículas</span></div>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: sfxAtivo ? 'rgba(0,255,204,0.1)' : 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '10px', border: `1px solid ${sfxAtivo ? '#00ffcc' : '#333'}`, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={sfxAtivo} onChange={e => setSfxAtivo(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                                    <div><strong style={{ color: sfxAtivo ? '#00ffcc' : '#aaa', display: 'block' }}>Efeitos Sonoros (SFX)</strong><span style={{ color: '#666', fontSize: '0.7em' }}>Cliques e alertas do sistema</span></div>
                                </label>
                            </div>

                            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                                <strong style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Tipografia (Fonte)</strong>
                                <select className="input-neon" value={fonteAtiva} onChange={(e) => setFonteAtiva(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: '1em', background: '#000' }}>
                                    <option value="sans-serif">Padrão (Sans-Serif)</option>
                                    <option value="'Courier New', Courier, monospace">Terminal Tático (Monospace)</option>
                                    <option value="'Times New Roman', Times, serif">Grimório Antigo (Serif)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 🌌 PAINEL PRINCIPAL */
                    <div className="fade-in" style={{ padding: '30px 25px' }}>
                        <div style={{ textAlign: 'left', marginBottom: '30px', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '-10px', left: '0', background: '#00ffcc', color: '#000', fontSize: '0.6em', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px', letterSpacing: '2px' }}>V.2.1.0 - MULTIVERSE ENGINE</div>
                            <h1 style={{ color: 'inherit', margin: '15px 0 15px 0', textTransform: 'uppercase', letterSpacing: '5px', fontSize: '2.2em', fontWeight: '900', opacity: 0.9 }}>REFERÊNCIAS RPG</h1>
                            <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)', background: '#000', position: 'relative', boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }}>
                                <img src="/capa-lobby.png" alt="Capa" style={{ width: '100%', height: '140px', objectFit: 'cover', opacity: 0.8 }} onError={(e) => e.target.style.display = 'none'} />
                                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(0deg, rgba(10,10,15,1) 0%, rgba(0,0,0,0) 100%)' }}></div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                            <div style={{ background: 'rgba(0, 255, 204, 0.05)', border: '1px solid rgba(0, 255, 204, 0.2)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} className="hover-lift">
                                <div style={{ marginBottom: '15px' }}><span style={{ fontSize: '2.5em', display: 'block', marginBottom: '5px', filter: 'drop-shadow(0 0 10px rgba(0,255,204,0.5))' }}>🌌</span><strong style={{ color: '#fff', fontSize: '1.1em', display: 'block' }}>FORJAR REALIDADE</strong><span style={{ color: '#888', fontSize: '0.8em' }}>Inicie uma nova campanha (Mestre).</span></div>
                                <button className="btn-neon btn-green" onClick={criarMesa} style={{ width: '100%', padding: '12px', fontSize: '1em', fontWeight: 'bold', borderRadius: '8px' }}>CRIAR SESSÃO</button>
                            </div>
                            <div style={{ background: 'rgba(255, 0, 60, 0.05)', border: '1px solid rgba(255, 0, 60, 0.2)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} className="hover-lift">
                                <div style={{ marginBottom: '15px' }}><span style={{ fontSize: '2.5em', display: 'block', marginBottom: '5px', filter: 'drop-shadow(0 0 10px rgba(255,0,60,0.5))' }}>👁️</span><strong style={{ color: '#ff3333', fontSize: '1.1em', display: 'block', textShadow: '0 0 10px rgba(255,0,60,0.5)' }}>DESAFIAR ENTIDADE</strong><span style={{ color: '#888', fontSize: '0.8em' }}>Sincronize sua marca através do código.</span></div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <input className="input-neon" type="text" placeholder="CÓDIGO (EX: MESA-A8)" value={codigoSala} onChange={e => setCodigoSala(e.target.value)} style={{ width: '100%', padding: '10px', fontSize: '0.9em', textAlign: 'center', textTransform: 'uppercase', background: 'rgba(0,0,0,0.5)', borderRadius: '6px', border: '1px solid rgba(255, 0, 60, 0.3)', color: '#ff8888' }} />
                                    <button className="btn-neon btn-red" onClick={() => entrarMesa()} style={{ width: '100%', padding: '10px', fontSize: '1em', fontWeight: 'bold', borderRadius: '6px' }}>ACESSAR PORTAL</button>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                            <a href="https://discord.gg/SEU-LINK-AQUI" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'rgba(88, 101, 242, 0.1)', border: '1px solid rgba(88, 101, 242, 0.5)', color: '#5865F2', padding: '12px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }} className="hover-lift">
                                <span style={{ fontSize: '1.3em' }}>👾</span> DISCORD DA GUILDA
                            </a>
                            <button onClick={() => setMostrarConfig(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'rgba(170, 170, 170, 0.1)', border: '1px solid rgba(170, 170, 170, 0.5)', color: '#ccc', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }} className="hover-lift">
                                <span style={{ fontSize: '1.3em' }}>⚙️</span> CONFIGURAÇÕES
                            </button>
                            {/* 🔥 NOVO BOTÃO DE RECARREGAR (EXCLUSIVO DO LOBBY) 🔥 */}
                            <button onClick={() => window.location.reload(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'rgba(0, 255, 204, 0.1)', border: '1px solid rgba(0, 255, 204, 0.5)', color: '#00ffcc', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }} className="hover-lift">
                                <span style={{ fontSize: '1.3em' }}>🔄</span> RECARREGAR (F5)
                            </button>
                        </div>

                        {minhasMesas.length > 0 && (
                            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.5)' }}>
                                    <button onClick={() => setAbaMesas('jogador')} style={{ flex: 1, padding: '15px', background: abaMesas === 'jogador' ? 'rgba(0, 136, 255, 0.15)' : 'transparent', border: 'none', borderBottom: abaMesas === 'jogador' ? '2px solid #0088ff' : '2px solid transparent', color: abaMesas === 'jogador' ? '#fff' : '#888', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s' }}>
                                        ⚔️ JOGADOR ({mesasJogador.length})
                                    </button>
                                    <button onClick={() => setAbaMesas('mestre')} style={{ flex: 1, padding: '15px', background: abaMesas === 'mestre' ? 'rgba(255, 204, 0, 0.15)' : 'transparent', border: 'none', borderBottom: abaMesas === 'mestre' ? '2px solid #ffcc00' : '2px solid transparent', color: abaMesas === 'mestre' ? '#fff' : '#888', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s' }}>
                                        👑 MESTRE ({mesasMestre.length})
                                    </button>
                                </div>
                                <div style={{ padding: '20px', minHeight: '120px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {abaMesas === 'jogador' && (mesasJogador.length > 0 ? <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{mesasJogador.map(m => (
                                        <div key={m.id} style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => entrarMesa(m.id)} className="btn-neon" style={{ flex: 1, textAlign: 'left', padding: '8px 15px', background: 'rgba(0,136,255,0.1)', borderColor: 'rgba(0,136,255,0.3)', color: '#fff' }}>⚔️ {m.nome}</button>
                                            <button onClick={(e) => removerDoHistorico(m.id, e)} style={{ width: '40px', background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.5)', color: '#ff3333', borderRadius: '5px' }}>🗑️</button>
                                        </div>
                                    ))}</div> : <div style={{ textAlign: 'center', color: '#555', fontStyle: 'italic', padding: '20px' }}>Vazio.</div>)}
                                    
                                    {abaMesas === 'mestre' && (mesasMestre.length > 0 ? <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{mesasMestre.map(m => (
                                        <div key={m.id} style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => entrarMesa(m.id)} className="btn-neon" style={{ flex: 1, textAlign: 'left', padding: '8px 15px', background: 'rgba(255,204,0,0.1)', borderColor: 'rgba(255,204,0,0.3)', color: '#fff' }}>👑 {m.nome}</button>
                                            <button onClick={(e) => removerDoHistorico(m.id, e)} style={{ width: '40px', background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.5)', color: '#ff3333', borderRadius: '5px' }}>🗑️</button>
                                        </div>
                                    ))}</div> : <div style={{ textAlign: 'center', color: '#555', fontStyle: 'italic', padding: '20px' }}>Vazio.</div>)}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}