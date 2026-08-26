import React, { useEffect, useState, createContext } from 'react';
import { ref, get, set, onValue } from 'firebase/database';
import { db } from './services/firebase-config';
import useStore, { sanitizarNome } from './stores/useStore';
import useFirebase from './hooks/useFirebase';

// 🔥 IMPORTANDO O MOTOR DE VOZ PARA O TOPO DO APP 🔥
import { useVoiceChat } from './hooks/useVoiceChat';

// 📂 Import de Layout e Componentes
import Sidebar from './components/layout/Sidebar';
import TabPanel from './components/layout/TabPanel';
import PerfilPanel from './components/perfil/PerfilPanel';
import ModalConfirm from './components/perfil/ModalConfirm';
import FichaPanel from './components/ficha/FichaPanel';
import AtaquePanel from './components/combate/AtaquePanel';
import AcertoPanel from './components/combate/AcertoPanel';
import DefesaPanel from './components/combate/DefesaPanel';
import TestesPanel from './components/combate/TestesPanel';
import PoderesPanel from './components/poderes/PoderesPanel';
import ArsenalPanel from './components/arsenal/ArsenalPanel';
import ElementosPanel from './components/arsenal/ElementosPanel';
import FeedCombate from './components/feed/FeedCombate';
import MapaPanel from './components/mapa/MapaPanel';
import Jukebox from './components/jukebox/Jukebox';
import CompendioPanel from './components/compendio/CompendioPanel';
import AIPanel from './components/ia/AIPanel';
import GravadorPanel from './components/ia/GravadorPanel';
import MarcadosPanel from './components/Ficha Def/Marcados';

// IMPORTAÇÃO DO NOVO GRIMÓRIO!
import GrimorioPanel from './components/Ficha Def/Grimorio';

import MestrePanel from './components/mestre/MestrePanel';
import AuthScreen from './components/auth/AuthScreen';
import LobbyNeon from './components/lobby/LobbyNeon';
import TelaLoading from './components/layout/TelaLoading';

import {
    carregarFichaDoFirebase, iniciarListenerDummies,
    iniciarListenerCenario, monitorarAuth,
    iniciarSistemaDePresenca, iniciarListenerPresenca, removerPresencaImediata,
    iniciarListenerMestres, salvarFirebaseImediato, iniciarListenerDivisorPoderMesa
} from './services/firebase-sync';

// 🔥 CRIANDO O CONTEXTO GLOBAL DA VOZ 🔥
export const VoiceContext = createContext(null);

// 🛡️ O GUARDIÃO DO RÁDIO: Só liga depois de você escolher o seu nome!
function ProvedorDeVozGlobal({ meuNome, cenario, children }) {
    const tavernaAtivos = Array.isArray(cenario?.tavernaAtivos) ? cenario.tavernaAtivos : [];
    const isPresenteNaTaverna = tavernaAtivos.includes(meuNome);
    
    // O motor nasce aqui de forma segura com o ID correto (Ex: Natsu)
    const chatCtx = useVoiceChat(meuNome, tavernaAtivos, isPresenteNaTaverna);

    return (
        <VoiceContext.Provider value={chatCtx}>
            {children}
        </VoiceContext.Provider>
    );
}

window.deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    window.dispatchEvent(new Event('pwa-ready'));
});

export default function App() {
    const userLogado = useStore(s => s.userLogado);
    const setUserLogado = useStore(s => s.setUserLogado);
    const [authVerificada, setAuthVerificada] = useState(false);

    const jogadoresOnline = useStore(s => s.jogadoresOnline);
    const setJogadoresOnline = useStore(s => s.setJogadoresOnline);
    
    const mesaCriador = useStore(s => s.mesaCriador);
    const mesaMestres = useStore(s => s.mesaMestres);
    const setMesaInfo = useStore(s => s.setMesaInfo);

    const meuNome = useStore(s => s.meuNome);
    const setMeuNome = useStore(s => s.setMeuNome);
    const carregarDadosFicha = useStore(s => s.carregarDadosFicha);
    const abaAtiva = useStore(s => s.abaAtiva);
    
    const cenario = useStore(s => s.cenario);
    const setCenario = useStore(s => s.setCenario);
    const setDummies = useStore(s => s.setDummies);
    const setDivisorPoderMesa = useStore(s => s.setDivisorPoderMesa);
    
    const mesaId = useStore(s => s.mesaId);
    const setMesaId = useStore(s => s.setMesaId);
    const limparFeedStore = useStore(s => s.limparFeedStore);
    
    const isMestre = useStore(s => s.isMestre);
    const setIsMestre = useStore(s => s.setIsMestre);

    const { loading } = useFirebase();
    const [pronto, setPronto] = useState(false);
    const [modalAberto, setModalAberto] = useState(false);
    const [themeReady, setThemeReady] = useState(false);

    const [meusPersonagens, setMeusPersonagens] = useState(() => {
        try { return JSON.parse(localStorage.getItem('rpg_historico_personagens')) || []; }
        catch(e) { return []; }
    });

    useEffect(() => { setTimeout(() => setThemeReady(true), 50); }, []);

    // ATALHO SECRETO (F5 / CTRL+R) PARA ATUALIZAR O APP
    useEffect(() => {
        const handleRefresh = (e) => {
            if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R' || e.key === 'f5' || e.key === 'F5'))) {
                e.preventDefault();
                window.location.reload(true);
            }
        };
        window.addEventListener('keydown', handleRefresh);
        return () => window.removeEventListener('keydown', handleRefresh);
    }, []);

    useEffect(() => {
        const unsub = monitorarAuth((nick) => {
            setUserLogado(nick);
            setAuthVerificada(true);
        });
        return () => unsub();
    }, [setUserLogado]);

    useEffect(() => {
        if (!mesaId || !userLogado) return;
        const unsub = iniciarListenerMestres(mesaId, (criador, mestresDict) => {
            setMesaInfo(criador, mestresDict);
            const nickSanitizado = sanitizarNome(userLogado);
            if (mestresDict[nickSanitizado]) {
                setIsMestre(true);
            } else {
                setIsMestre(false);
            }
        });
        return () => unsub();
    }, [mesaId, userLogado, setIsMestre, setMesaInfo]);

    useEffect(() => {
        if (!mesaId || !isMestre) return;
        const unsubLore = onValue(ref(db, `mesas/${mesaId}/lore`), (snap) => {
            if (snap.exists()) {
                localStorage.setItem('rpgSextaFeira_capitulos', JSON.stringify(snap.val()));
            }
        });
        const unsubArvore = onValue(ref(db, `mesas/${mesaId}/arvore`), (snap) => {
            if (snap.exists()) {
                localStorage.setItem('rpgSextaFeira_arvore', JSON.stringify(snap.val()));
            }
        });
        return () => {
            unsubLore();
            unsubArvore();
        };
    }, [mesaId, isMestre]);

    useEffect(() => {
        let nomeLocal = localStorage.getItem('rpgNome') || localStorage.getItem('rpg_nome');
        if (nomeLocal) {
            const nomeSanitizado = sanitizarNome(nomeLocal);
            setMeuNome(nomeSanitizado);
            try {
                const backup = localStorage.getItem('rpgFicha_' + nomeSanitizado);
                if (backup) carregarDadosFicha(JSON.parse(backup));
            } catch (e) { console.warn('Falha backup:', e); }
            setPronto(true);
        }
    }, [setMeuNome, carregarDadosFicha]);

    useEffect(() => {
        // 🔥 mesaId PRECISA estar nas dependências: iniciarListenerDummies/Cenario/DivisorPoderMesa
        // leem mesaId internamente (useStore.getState()) só no momento em que são chamadas — se
        // mesaId ainda não estava definido quando este efeito rodou pela primeira vez (ex.: primeiro
        // login da sessão, mesaId chega via setMesaId DEPOIS do mount), os listeners nunca eram
        // (re)anexados para a mesa certa, e o valor nunca sincronizava enquanto durasse a sessão —
        // mesmo funcionando "por acidente" quando mesaId já vinha cacheado do localStorage.
        if (!mesaId) return;
        const unsubDummies = iniciarListenerDummies((dados) => setDummies(dados || {}));
        const unsubCenario = iniciarListenerCenario((dados) => setCenario(dados));
        const unsubDivisorPoder = iniciarListenerDivisorPoderMesa((valor) => setDivisorPoderMesa(valor));
        return () => { if (unsubDummies) unsubDummies(); if (unsubCenario) unsubCenario(); if (unsubDivisorPoder) unsubDivisorPoder(); };
    }, [mesaId, setDummies, setCenario, setDivisorPoderMesa]);

    useEffect(() => {
        if (!mesaId || !userLogado || !pronto) return;
        const unsubConnected = iniciarSistemaDePresenca(mesaId, userLogado);
        const unsubPresenca = iniciarListenerPresenca(mesaId, (dados) => {
            setJogadoresOnline(Object.keys(dados || {}));
        });
        return () => {
            if (unsubConnected) unsubConnected();
            if (unsubPresenca) unsubPresenca();
            removerPresencaImediata(mesaId, userLogado);
        };
    }, [mesaId, userLogado, pronto, setJogadoresOnline]);

    const entrarComPersonagem = async (nome) => {
        if (!nome) return;
        const nomeSanitizado = sanitizarNome(nome);
        const novaLista = [nomeSanitizado, ...meusPersonagens.filter(n => n !== nomeSanitizado)].slice(0, 5);
        setMeusPersonagens(novaLista);
        localStorage.setItem('rpg_historico_personagens', JSON.stringify(novaLista));
        localStorage.setItem('rpgNome', nomeSanitizado);
        setMeuNome(nomeSanitizado);
        setPronto(true);
        try {
            const dados = await carregarFichaDoFirebase(nomeSanitizado);
            if (dados && Object.keys(dados).length > 2) {
                carregarDadosFicha(dados);
                // 🔥 Persiste imediatamente a migração de ficha.passivas -> ficha.poderes
                // (ver migrarPassivasParaPoderes), para não repeti-la a cada login.
                if (Array.isArray(dados.passivas) && dados.passivas.length > 0) {
                    salvarFirebaseImediato().catch(() => {});
                }
            }
        } catch (e) { console.warn('Falha Firebase:', e); }
    };

    const removerPersonagemDoHistorico = (nomeParaRemover, e) => {
        e.stopPropagation();
        const novaLista = meusPersonagens.filter(n => n !== nomeParaRemover);
        setMeusPersonagens(novaLista);
        localStorage.setItem('rpg_historico_personagens', JSON.stringify(novaLista));
    };

    const criadorOn = jogadoresOnline.filter(j => j === mesaCriador);
    const coMestresOn = jogadoresOnline.filter(j => j !== mesaCriador && mesaMestres[j]);
    const playersOn = jogadoresOnline.filter(j => !mesaMestres[j]);

    let tooltipOnline = "🌟 CONTAS ONLINE NA SALA:\n\n";
    if (criadorOn.length > 0) tooltipOnline += `👑 MESTRE SUPREMO:\n- ${criadorOn.join(', ')}\n\n`;
    if (coMestresOn.length > 0) tooltipOnline += `🛡️ CO-MESTRES:\n- ${coMestresOn.join(', ')}\n\n`;
    if (playersOn.length > 0) tooltipOnline += `⚔️ AVENTUREIROS:\n- ${playersOn.join(', ')}`;
    if (jogadoresOnline.length === 0) tooltipOnline += "Ninguém online no momento.";

    if (!authVerificada) return <TelaLoading texto="Verificando as chaves do Multiverso..." />;
    if (!userLogado) return <AuthScreen />;
    if (!mesaId) return <LobbyNeon />;
    if (loading || !themeReady) return <TelaLoading texto={`Sincronizando os dados da sala ${mesaId}...`} />;

    if (!pronto && !meuNome) {
        return (
            <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', backgroundImage: 'radial-gradient(circle, #1a0b2e 0%, #000 100%)', fontFamily: 'sans-serif' }}>
                <div className="def-box fade-in" style={{ padding: '40px', maxWidth: '450px', width: '100%', textAlign: 'center', background: 'rgba(10, 10, 15, 0.95)', border: '2px solid #00ffcc', boxShadow: '0 0 30px rgba(0, 255, 204, 0.2)', borderRadius: '15px' }}>
                    <h2 style={{ color: '#00ffcc', textShadow: '0 0 10px #00ffcc', marginTop: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>SALA: {mesaId}</h2>
                    <p style={{ color: '#aaa', marginBottom: '30px' }}>Escolha ou crie o seu personagem para esta sessão.</p>
                    {meusPersonagens.length > 0 && (
                        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                            <span style={{ color: '#aaa', fontSize: '0.8em', fontWeight: 'bold' }}>SEUS PERSONAGENS RECENTES:</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                {meusPersonagens.map(p => (
                                    <div key={p} style={{ display: 'flex', gap: '5px' }}>
                                        <button type="button" onClick={() => entrarComPersonagem(p)} className="btn-neon btn-blue" style={{ flex: 1, margin: 0, padding: '10px', fontWeight: 'bold' }}>👤 {p}</button>
                                        <button type="button" onClick={(e) => removerPersonagemDoHistorico(p, e)} style={{ background: 'rgba(255,0,60,0.2)', border: '1px solid #ff003c', color: '#ff003c', borderRadius: '5px', padding: '0 15px', cursor: 'pointer' }} title="Apagar do Histórico">🗑️</button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ position: 'relative', marginBottom: '20px', marginTop: '30px' }}><hr style={{ borderColor: '#333' }} /><span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: '#0a0a0f', padding: '0 10px', color: '#666', fontSize: '0.8em' }}>OU NOVO PERSONAGEM</span></div>
                        </div>
                    )}
                    <form onSubmit={(e) => { e.preventDefault(); entrarComPersonagem(e.target.elements.nomeInput.value.trim()); }}>
                        <input className="input-neon" name="nomeInput" type="text" autoFocus placeholder="Nome (Ex: Natsu)" maxLength={50} style={{ width: '100%', boxSizing: 'border-box', padding: '15px', fontSize: '1.2em', textAlign: 'center' }}/>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button type="button" className="btn-neon btn-red" onClick={() => { limparFeedStore(); setMesaId(''); }} style={{ flex: 1, padding: '10px' }}>🚪 Voltar</button>
                            <button type="submit" className="btn-neon btn-green" style={{ flex: 2, padding: '10px', fontSize: '1.1em', fontWeight: 'bold' }}>Entrar na Mesa</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    const isMapMode = abaAtiva === 'aba-mapa';

    // 🔥 O GUARDIÃO ENVOLVE TODO O SISTEMA AQUI 🔥
    return (
        <ProvedorDeVozGlobal meuNome={meuNome} cenario={cenario}>
            <div className="app-layout">
                <div style={{ position: 'absolute', top: '10px', right: '15px', zIndex: 9999, display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.8)', padding: '5px 15px', borderRadius: '20px', border: '1px solid #333', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }}>
                    
                    <div title={tooltipOnline} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 255, 170, 0.1)', border: '1px solid #00ffaa', padding: '2px 8px', borderRadius: '15px', cursor: 'help', whiteSpace: 'pre-wrap' }}>
                        <span style={{ width: '8px', height: '8px', background: '#00ffaa', borderRadius: '50%', boxShadow: '0 0 8px #00ffaa' }}></span>
                        <span style={{ color: '#00ffaa', fontSize: '0.75em', fontWeight: 'bold' }}>{jogadoresOnline.length} ON</span>
                    </div>

                    <div style={{ borderLeft: '1px solid #444', height: '15px' }}></div>

                    <span style={{ color: '#00ffcc', fontSize: '0.8em', fontWeight: 'bold', letterSpacing: '1px' }}>SALA: {mesaId}</span>
                    
                    <div style={{ borderLeft: '1px solid #444', paddingLeft: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#aaa', fontSize: '0.85em', fontWeight: 'bold' }}>👤 {meuNome}</span>
                        <button onClick={() => { if(window.confirm('Deseja sair desta ficha e escolher outro personagem?')) { localStorage.removeItem('rpgNome'); localStorage.removeItem('rpg_nome'); setMeuNome(''); setPronto(false); } }} style={{ background: 'none', border: 'none', color: '#ffcc00', cursor: 'pointer', fontSize: '0.8em', padding: '0', display: 'flex', alignItems: 'center', gap: '4px' }} title="Mudar o nome/ficha atual sem sair da mesa">✏️ Trocar</button>
                    </div>

                    {isMestre && (
                        <button onClick={async () => {
                                const matrizId = localStorage.getItem('rpg_mesa_principal') || 'Nenhuma';
                                if (!matrizId || matrizId === 'Nenhuma') {
                                    return alert('⚠️ MESTRE: Defina primeiro o ID da sua Mesa Matriz usando o botão de lápis (✏️) no Hub Cósmico!');
                                }
                                if(!window.confirm(`⚠️ MESTRE: Deseja tentar copiar as estruturas da mesa matriz [${matrizId}] para a sala atual [${mesaId}]?\n\nNota: Se não for o Mestre Criador da Matriz, o Firebase pode bloquear a importação por segurança.`)) return;
                                
                                try {
                                    const oldPers = await get(ref(db, `mesas/${matrizId}/personagens`));
                                    if (oldPers.exists()) { 
                                        const data = oldPers.val(); 
                                        for (const key in data) {
                                            await set(ref(db, `mesas/${mesaId}/personagens/${key}`), data[key]).catch(() => {}); 
                                        }
                                    }
                                } catch (err) { 
                                    console.warn("Leitura de personagens bloqueada pelo sandbox:", err.message); 
                                }
                                
                                try {
                                    const oldArvore = await get(ref(db, `mesas/${matrizId}/arvore`));
                                    if (oldArvore.exists()) {
                                        await set(ref(db, `mesas/${mesaId}/arvore`), oldArvore.val());
                                        localStorage.setItem('rpgSextaFeira_arvore', JSON.stringify(oldArvore.val()));
                                        alert(`✅ SUCESSO SUPREMO! Dados copiados da nuvem da Matriz com sucesso! Atualize a página (F5).`);
                                    } else {
                                        throw new Error("Nó vazio");
                                    }
                                } catch (err) { 
                                    console.warn("Acesso à nuvem da matriz negado. Tentando cache local de segurança...");
                                    
                                    const arvorePonte = localStorage.getItem('rpgSextaFeira_arvore_MatrizBackup');
                                    if (arvorePonte && arvorePonte !== '{}') {
                                        try {
                                            await set(ref(db, `mesas/${mesaId}/arvore`), JSON.parse(arvorePonte));
                                            localStorage.setItem('rpgSextaFeira_arvore', arvorePonte);
                                            alert(`✅ PONTE LOCAL ATIVADA! O Firebase bloqueou a leitura externa, mas a árvore foi forjada a partir do seu cache local de segurança! Atualize a página (F5).`);
                                        } catch (writeErr) {
                                            alert(`❌ ACESSO NEGADO: O Firebase bloqueou a gravação da árvore para a sua conta nesta sala.\n\nDica: Peça ao dono da Matriz para fazer o resgate e selar as permissões!`);
                                        }
                                    } else {
                                        alert(`❌ ACESSO BLOQUEADO: O Firebase protege salas externas contra leitura. Como o seu navegador não possui o cache original da Matriz, o resgate foi cancelado com segurança.\n\n👉 Peça ao dono da Matriz para fazer o resgate!`);
                                    }
                                }
                            }} style={{ marginLeft: '5px', background: '#0088ff', border: '1px solid #fff', color: '#fff', fontSize: '0.7em', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>🧲 RESGATAR TUDO</button>
                    )}
                    
                    <button onClick={() => { if(window.confirm('Tem a certeza que deseja sair da mesa?')) { limparFeedStore(); setMesaId(''); } }} style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#ff003c', cursor: 'pointer', fontSize: '0.9em', fontWeight: 'bold', padding: 0 }} title="Desconectar do Servidor da Mesa">Sair 🚪</button>
                </div>

                <Sidebar onResetClick={() => setModalAberto(true)} />
                
                <div className={`main-content${isMapMode ? ' modo-mapa' : ''}`}>
                    {!isMapMode && <h1 className="title">RPG Anime System</h1>}
                    <TabPanel id="aba-perfil"><PerfilPanel /></TabPanel>
                    <TabPanel id="aba-mestre"><MestrePanel /></TabPanel>
                    <TabPanel id="aba-testes"><TestesPanel /></TabPanel>
                    <TabPanel id="aba-ataque"><AtaquePanel /></TabPanel>
                    <TabPanel id="aba-acerto"><AcertoPanel /></TabPanel>
                    <TabPanel id="aba-defesa"><DefesaPanel /></TabPanel>
                    <TabPanel id="aba-ficha"><FichaPanel /></TabPanel>
                    <TabPanel id="aba-poderes"><PoderesPanel /></TabPanel>
                    <TabPanel id="aba-arsenal"><ArsenalPanel /></TabPanel>
                    <TabPanel id="aba-elementos"><ElementosPanel /></TabPanel>
                    <TabPanel id="aba-log"><FeedCombate /></TabPanel>
                    <TabPanel id="aba-mapa"><MapaPanel /></TabPanel>
                    <TabPanel id="aba-musica"><Jukebox /></TabPanel>
                    <TabPanel id="aba-compendio"><CompendioPanel /></TabPanel>
                    <TabPanel id="aba-oraculo"><AIPanel /></TabPanel>
                    <TabPanel id="aba-gravador"><GravadorPanel /></TabPanel>
                    {/* 🔥 AS DUAS ABAS ÉPICAS! */}
                    <TabPanel id="aba-Ficha Def"><MarcadosPanel /></TabPanel>
                    <TabPanel id="aba-grimorio"><GrimorioPanel /></TabPanel>
                </div>
                
                <ModalConfirm isOpen={modalAberto} onClose={() => setModalAberto(false)} />
            </div>
        </ProvedorDeVozGlobal>
    );
}