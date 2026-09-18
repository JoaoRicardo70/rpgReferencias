import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom'; 
import { ref as dbRef, push } from 'firebase/database'; 
import { db } from '../../services/firebase-config';
import useStore from '../../stores/useStore'; 

export function MapaOlhoSextaFeira({ meuNome, personagens, minhaFicha, tavernaAtivos, meuStream, conexoes }) {
    const [gravando, setGravando] = useState(false);
    const [expandido, setExpandido] = useState(false);
    const [logs, setLogs] = useState(['Sexta-Feira: HUD de Inteligência Artificial online.']);

    const [mascaraMestre, setMascaraMestre] = useState('narrador'); 
    const [nomeNpc, setNomeNpc] = useState('');

    const recognitionRef = useRef(null); 
    const gravandoRef = useRef(false); 
    const logsEndRef = useRef(null);
    const mesaId = useStore(s => s.mesaId); 

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.onend = null;
                recognitionRef.current.abort();
            }
        };
    }, []);

    const addLog = (msg) => { 
        const hora = new Date().toLocaleTimeString('pt-BR', { hour12: false }); 
        setLogs(prev => [...prev.slice(-12), `[${hora}] ${msg}`]); 
    };

    const enviarParaBancoDeDados = (frase, papel) => {
        if (!db || !mesaId) return;
        const logEntry = { timestamp: Date.now(), autor: papel, texto: frase, tipo: mascaraMestre };
        push(dbRef(db, `mesas/${mesaId}/sexta_feira_transcricao`), logEntry).catch(() => addLog("❌ Erro Nuvem."));
    };

    const iniciarGravacao = () => {
        if (!meuStream) return addLog("❌ Erro: Microfone offline.");
        
        setGravando(true); 
        gravandoRef.current = true;
        setExpandido(true); 
        addLog("🎙️ Escuta Ativa! Analisando voz...");

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'pt-BR'; 

            recognition.onresult = (event) => {
                const frase = event.results[event.results.length - 1][0].transcript.trim();
                if (frase) {
                    const papel = mascaraMestre === 'npc' && nomeNpc ? nomeNpc : meuNome;
                    const logFormatado = `🗣️ ${papel}: "${frase}"`;
                    
                    addLog(logFormatado);
                    
                    // 🔥 1. Envia para backup no Firebase
                    enviarParaBancoDeDados(frase, papel);
                    
                    // 🔥 2. A PONTE NEURAL: Dispara imediatamente para a aba dos Registros Akáshicos!
                    window.dispatchEvent(new CustomEvent('novaTranscricaoSextaFeira', { detail: logFormatado }));
                }
            };

            recognition.onerror = (e) => {
                if (e.error === 'no-speech' || e.error === 'aborted') return;
                addLog(`⚠️ Alerta: ${e.error}`);
            };
            
            recognition.onend = () => { 
                if (gravandoRef.current) {
                    setTimeout(() => { try { recognition.start(); } catch(e) {} }, 500);
                } 
            };
            
            try {
                recognition.start();
                recognitionRef.current = recognition;
            } catch(e) {
                addLog("❌ Erro ao ligar o ouvido nativo.");
            }
        } else {
            addLog("⚠️ Aviso: Navegador não suporta transcrição nativa.");
        }
    };

    const pararGravacao = () => {
        setGravando(false);
        gravandoRef.current = false;
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.abort();
        }
        addLog("⏹️ Escuta encerrada.");
    };

    const hudSextaFeira = (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 2147483647, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '15px' }}>
            <div onClick={() => setExpandido(!expandido)} style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(0, 20, 40, 0.85)', backdropFilter: 'blur(10px)', border: `2px solid ${gravando ? '#ff003c' : '#00ffcc'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', cursor: 'pointer', boxShadow: gravando ? '0 0 25px rgba(255,0,60,0.6)' : '0 0 15px rgba(0,255,204,0.4)', transition: 'all 0.3s ease' }}>
                {gravando ? '🎙️' : '👁️'}
            </div>

            {expandido && (
                <div className="fade-in" style={{ background: 'rgba(0, 15, 30, 0.85)', backdropFilter: 'blur(15px)', border: `1px solid ${gravando ? '#ff003c' : 'rgba(0, 255, 204, 0.4)'}`, borderRadius: '12px', padding: '20px', width: '340px', boxShadow: gravando ? '0 0 30px rgba(255,0,60,0.3), inset 0 0 20px rgba(255,0,60,0.1)' : '0 0 25px rgba(0,255,204,0.2), inset 0 0 15px rgba(0,255,204,0.05)', transition: 'all 0.3s ease' }}>
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: gravando ? '#ff003c' : '#00ffcc', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.9em', textShadow: `0 0 10px ${gravando ? '#ff003c' : '#00ffcc'}` }}>
                            {gravando ? '🔴 TRANSMISSÃO ATIVA' : '📡 SEXTA-FEIRA OS'}
                        </span>
                        <button onClick={() => setExpandido(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.5, fontSize: '1.2em' }}>✕</button>
                    </div>

                    <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px dashed rgba(255,204,0,0.3)' }}>
                        <span style={{ color: '#ffcc00', fontSize: '0.75em', fontWeight: 'bold', display: 'block', marginBottom: '10px', textAlign: 'center', letterSpacing: '1px' }}>🎭 MÁSCARA DE IDENTIDADE</span>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: mascaraMestre === 'npc' ? '12px' : '0' }}>
                            <button onClick={() => setMascaraMestre('narrador')} style={{ flex: 1, padding: '8px', fontSize: '0.8em', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${mascaraMestre === 'narrador' ? '#ffcc00' : '#444'}`, background: mascaraMestre === 'narrador' ? 'rgba(255,204,0,0.2)' : 'transparent', color: mascaraMestre === 'narrador' ? '#ffcc00' : '#888', transition: 'all 0.2s' }}>📖 NARRADOR</button>
                            <button onClick={() => setMascaraMestre('npc')} style={{ flex: 1, padding: '8px', fontSize: '0.8em', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${mascaraMestre === 'npc' ? '#00aaff' : '#444'}`, background: mascaraMestre === 'npc' ? 'rgba(0,170,255,0.2)' : 'transparent', color: mascaraMestre === 'npc' ? '#00aaff' : '#888', transition: 'all 0.2s' }}>👺 NPC</button>
                        </div>
                        {mascaraMestre === 'npc' && <input className="fade-in" type="text" placeholder="Nome do NPC atual..." value={nomeNpc} onChange={e => setNomeNpc(e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: '0.9em', border: '1px solid #00aaff', background: 'rgba(0,20,40,0.6)', color: '#00ffcc', borderRadius: '4px', outline: 'none', boxSizing: 'border-box', boxShadow: 'inset 0 0 10px rgba(0,170,255,0.2)' }} />}
                    </div>

                    {!gravando ? (
                        <button onClick={iniciarGravacao} style={{ marginTop: '15px', width: '100%', padding: '12px', background: 'rgba(0, 255, 204, 0.1)', border: '1px solid #00ffcc', color: '#00ffcc', fontWeight: '900', letterSpacing: '2px', cursor: 'pointer', borderRadius: '6px', boxShadow: '0 0 15px rgba(0,255,204,0.2)', transition: 'all 0.2s' }}>▶ INICIAR ESCUTA</button>
                    ) : (
                        <button onClick={pararGravacao} style={{ marginTop: '15px', width: '100%', padding: '12px', background: 'rgba(255, 0, 60, 0.1)', border: '1px solid #ff003c', color: '#ff003c', fontWeight: '900', letterSpacing: '2px', cursor: 'pointer', borderRadius: '6px', boxShadow: '0 0 15px rgba(255,0,60,0.3)', animation: 'pulse 1.5s infinite' }}>⏹ ENCERRAR</button>
                    )}
                    
                    <div style={{ background: 'rgba(0,5,10,0.8)', marginTop: '15px', borderRadius: '6px', padding: '10px', fontSize: '0.75em', color: '#00ffcc', fontFamily: 'monospace', height: '140px', overflowY: 'auto', border: '1px solid rgba(0,255,204,0.2)', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)', lineHeight: '1.4' }}>
                        {logs.map((l, i) => <div key={i} style={{ marginBottom: '4px', opacity: i === logs.length -1 ? 1 : 0.7 }}>{l}</div>)}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(hudSextaFeira, document.body);
}