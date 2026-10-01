import React, { useState, useEffect, useRef } from 'react';
import useStore, { sanitizarNome, fichaPadrao } from '../../stores/useStore'; 
import { ref, set, onValue } from 'firebase/database'; // 🔥 INJETADO onValue PARA ESCUTA REAL-TIME 🔥
import { database } from '../../services/firebase-config';
import { useDialogosSexta } from './DialogosSexta';

export default function AIArvoreGenealogica() {
    const personagens = useStore(s => s.personagens);
    const setPersonagens = useStore(s => s.setPersonagens);
    const mesaId = useStore(s => s.mesaId); 

    // 🪟 Modais no tema da Sexta-Feira no lugar de prompt/confirm/alert do navegador.
    const dialogos = useDialogosSexta();

    const [familias, setFamilias] = useState(() => {
        const salvo = localStorage.getItem('rpgSextaFeira_arvore');
        if (salvo) return JSON.parse(salvo);
        return {
            "Ackermann": [
                { id: 1, nome: "Natsu Ackermann", avatar: "", parceiros: "Lucy Heartfilia", papel: "Protagonista", classe: "Mago Psíquico", elemento: "Fogo Sombrio", hp: "150000", mana: "200000", status: "Vivo", lore: "Fundador principal.", afiliacao: "Ackermann", parentId: null },
                { id: 2, nome: "Filho do Natsu", avatar: "", parceiros: "", genitor2: "Lucy Heartfilia", papel: "Herdeiro", classe: "Mago", elemento: "Fogo", hp: "100000", mana: "100000", status: "Vivo", lore: "Herdeiro da família.", afiliacao: "Ackermann", parentId: 1 }
            ]
        };
    });

    const [familiaAtiva, setFamiliaAtiva] = useState('Ackermann');
    const [npcSelecionado, setNpcSelecionado] = useState(null);
    const [novaArvoreInput, setNovaArvoreInput] = useState('');
    const fileInputRef = useRef(null);

    // 🔥 ESCUTA REAL-TIME DIRETA DO FIREBASE: O FIM DA "CEGUEIRA" DA ÁRVORE 🔥
    useEffect(() => {
        if (!mesaId) return;
        const arvoreRef = ref(database, `mesas/${mesaId}/arvore`);
        const unsub = onValue(arvoreRef, (snap) => {
            if (snap.exists()) {
                const dadosNuvem = snap.val();
                setFamilias(dadosNuvem);
                try { localStorage.setItem('rpgSextaFeira_arvore', JSON.stringify(dadosNuvem)); } catch (e) { /* cota do localStorage: a nuvem continua valendo */ }
                // Garante que a aba ativa continua válida
                setFamiliaAtiva(prev => dadosNuvem[prev] ? prev : (Object.keys(dadosNuvem)[0] || null));
            }
        });
        return () => unsub();
    }, [mesaId]);

    // Preserva a gravação local como backup de segurança secundário
    useEffect(() => {
        try { localStorage.setItem('rpgSextaFeira_arvore', JSON.stringify(familias)); } catch (e) { /* cota do localStorage (imagens em base64): segue sem a cópia local */ }
    }, [familias]);

    const getIniciais = (nome) => {
        if (!nome) return "?";
        const partes = nome.trim().split(' ').filter(Boolean);
        if (partes.length === 0) return "?";
        if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
        return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    };

    const criarFamilia = () => {
        if (novaArvoreInput.trim() !== '' && !familias[novaArvoreInput]) {
            const novasFams = { ...familias, [novaArvoreInput]: [] };
            setFamilias(novasFams);
            setFamiliaAtiva(novaArvoreInput);
            setNovaArvoreInput('');
            setNpcSelecionado(null);
            sincronizarArvoreNuvem(novasFams);
        }
    };

    const editarNomeFamilia = async (nomeAtual) => {
        const novoNome = await dialogos.pedirTexto({ titulo: '✏️ Renomear Árvore', rotulo: 'Novo nome da Árvore', valorInicial: nomeAtual });
        if (!novoNome || novoNome.trim() === '' || novoNome === nomeAtual) return;
        if (familias[novoNome]) { dialogos.avisar('Já existe uma árvore com este nome!', 'erro'); return; }

        const novasFamilias = { ...familias };
        novasFamilias[novoNome] = novasFamilias[nomeAtual];
        delete novasFamilias[nomeAtual];

        setFamilias(novasFamilias);
        if (familiaAtiva === nomeAtual) setFamiliaAtiva(novoNome);
        sincronizarArvoreNuvem(novasFamilias);
    };

    const deletarFamilia = async (nomeFam) => {
        if (await dialogos.confirmar({ titulo: '🗑️ Apagar Árvore', mensagem: `Apagar a ÁRVORE "${nomeFam}" e TODOS os seus membros permanentemente?`, textoConfirmar: 'Apagar', perigo: true })) {
            const novasFamilias = { ...familias };
            delete novasFamilias[nomeFam];
            setFamilias(novasFamilias);
            const chaves = Object.keys(novasFamilias);
            setFamiliaAtiva(chaves.length > 0 ? chaves[0] : null);
            setNpcSelecionado(null);
            sincronizarArvoreNuvem(novasFamilias);
        }
    };

    // 🔥 AUTOMATIZAÇÃO: Envia qualquer alteração estrutural direto para a Nuvem 🔥
    const sincronizarArvoreNuvem = (estadoAtualizado) => {
        if (!mesaId) return;
        set(ref(database, `mesas/${mesaId}/arvore`), estadoAtualizado).catch(e => {
            console.warn("Aviso: Sincronização secundária com Firebase falhou.", e);
        });
    };

    const adicionarMembro = (parentId = null, genitor2 = "") => {
        if (!familiaAtiva) { dialogos.avisar('Crie ou selecione uma árvore primeiro!', 'erro'); return; }
        
        const novoId = Date.now();
        const novoNpc = { 
            id: novoId, 
            nome: parentId ? "Novo Herdeiro" : "Fundador(a)", 
            avatar: "", parceiros: "", genitor2: genitor2, 
            papel: "", classe: "", elemento: "", hp: "100000", mana: "100000", status: "Vivo", lore: "", 
            afiliacao: familiaAtiva, 
            parentId: parentId 
        };
        
        const novoEstado = {
            ...familias,
            [familiaAtiva]: [...(familias[familiaAtiva] || []), novoNpc]
        };
        setFamilias(novoEstado);
        setNpcSelecionado(novoNpc);
        sincronizarArvoreNuvem(novoEstado);
    };

    const atualizarNpc = (campo, valor) => {
        if (!npcSelecionado || !familiaAtiva) return;
        if (campo === 'parentId' && valor === npcSelecionado.id) { dialogos.avisar('Erro de paradoxo: ninguém pode ser pai de si mesmo.', 'erro'); return; }

        const npcAtualizado = { ...npcSelecionado, [campo]: valor };
        setNpcSelecionado(npcAtualizado);
        
        const listaAtualizada = (familias[familiaAtiva] || []).map(npc => 
            npc.id === npcSelecionado.id ? npcAtualizado : npc
        );
        const novoEstado = { ...familias, [familiaAtiva]: listaAtualizada };
        setFamilias(novoEstado);
        sincronizarArvoreNuvem(novoEstado);
    };

    const deletarNpc = async (id) => {
        if (!familiaAtiva) return;
        if (await dialogos.confirmar({ titulo: '🗑️ Apagar NPC', mensagem: 'Apagar este NPC? Os filhos dele viram fundadores soltos na árvore, para não sumirem.', textoConfirmar: 'Apagar', perigo: true })) {
            const listaAtualizada = (familias[familiaAtiva] || [])
                .filter(npc => npc.id !== id)
                .map(npc => npc.parentId === id ? { ...npc, parentId: null } : npc);
            
            const novoEstado = { ...familias, [familiaAtiva]: listaAtualizada };
            setFamilias(novoEstado);
            if (npcSelecionado && npcSelecionado.id === id) setNpcSelecionado(null);
            sincronizarArvoreNuvem(novoEstado);
        }
    };

    const injetarNaMesa = async () => {
        if (!npcSelecionado || !npcSelecionado.nome || npcSelecionado.nome.trim() === '') {
            dialogos.avisar('O NPC precisa de um Nome Completo antes de ser enviado para a mesa!', 'erro');
            return;
        }
        if (!mesaId) { dialogos.avisar('Você não está conectado a nenhuma Mesa!', 'erro'); return; }

        const nomeOriginal = npcSelecionado.nome.trim();
        const funcSanitizar = typeof sanitizarNome === 'function' ? sanitizarNome : (n) => n.replace(/[.#$\[\]\/]/g, '_');
        const nomePersonagem = funcSanitizar(nomeOriginal);

        if (personagens && personagens[nomePersonagem]) {
            if (!(await dialogos.confirmar({ titulo: '⚠️ Personagem já existe', mensagem: `O personagem "${nomePersonagem}" já existe na mesa. Sobrescrever a ficha dele com a da Árvore?`, textoConfirmar: 'Sobrescrever', perigo: true }))) {
                return;
            }
        }

        const hpValor = Number(npcSelecionado.hp) || 100000;
        const manaValor = Number(npcSelecionado.mana) || 100000;

        let novaFicha = JSON.parse(JSON.stringify(fichaPadrao));

        novaFicha.bio = { 
            ...novaFicha.bio,
            classe: npcSelecionado.classe || 'NPC - Ameaça', 
            raca: npcSelecionado.papel || 'Criatura', 
            mesa: 'npc',
            afiliacao: npcSelecionado.afiliacao || familiaAtiva || 'Sem Afiliação' 
        };
        
        novaFicha.vida = { ...novaFicha.vida, atual: hpValor, base: hpValor };
        novaFicha.mana = { ...novaFicha.mana, atual: manaValor, base: manaValor };
        novaFicha.forca = { ...novaFicha.forca, base: 1 };         
        novaFicha.destreza = { ...novaFicha.destreza, base: 1 };      
        novaFicha.inteligencia = { ...novaFicha.inteligencia, base: 1 };  
        novaFicha.avatar = { base: npcSelecionado.avatar ? npcSelecionado.avatar.trim() : "" };

        if (npcSelecionado.elemento && npcSelecionado.elemento.trim() !== '') {
            const elemNome = npcSelecionado.elemento.trim();
            novaFicha.dominios.elementos[elemNome] = { nivel: 1, nome: "Básico" };
        }

        novaFicha.poderes = [
            {
                id: Date.now(),
                nome: "📖 Linhagem & Lore",
                ativa: true, dano: "0",
                descricao: `Status: ${npcSelecionado.status || 'Vivo'}\nElemento Mágico: ${npcSelecionado.elemento || 'Nenhum'}\nClã / Panteão: ${npcSelecionado.afiliacao || familiaAtiva}\n\nHistória: ${npcSelecionado.lore || 'Sem registos.'}`
            }
        ];

        novaFicha.isNPC = true;
        novaFicha.dataCriacao = Date.now();

        const novosPersonagens = { ...personagens, [nomePersonagem]: novaFicha };
        if (setPersonagens) setPersonagens(novosPersonagens);

        try {
            await set(ref(database, `mesas/${mesaId}/personagens/${nomePersonagem}`), novaFicha);
            dialogos.avisar(`✅ ${nomePersonagem} foi forjado! Ele está na pasta "${npcSelecionado.afiliacao || familiaAtiva}" no Painel do Mestre.`);
        } catch (erro) {
            dialogos.avisar('⚠️ O Firebase bloqueou o save na nuvem, mas a criação local funcionou.', 'erro');
        }
    };

    const exportarBackup = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(familias, null, 2));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", `rpg_arvores_backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const importarBackup = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evento) => {
            try {
                const dados = JSON.parse(evento.target.result);
                setFamilias(dados);
                setFamiliaAtiva(Object.keys(dados)[0] || null);
                setNpcSelecionado(null);
                sincronizarArvoreNuvem(dados);
                dialogos.avisar('✅ Backup das Árvores carregado com sucesso!');
            } catch (err) { dialogos.avisar('❌ Erro ao ler o arquivo JSON.', 'erro'); }
        };
        reader.readAsText(file);
        e.target.value = ''; 
    };

    const renderNPC = (npc) => {
        const isMorto = npc.status === 'Morto';
        const isSelecionado = npcSelecionado?.id === npc.id;

        const parceirosRaw = npc.parceiros || npc.conjuge || ""; 
        const parceirosSet = new Set(parceirosRaw.split(',').map(s => s.trim()).filter(Boolean));
        
        const filhos = (familias[familiaAtiva] || []).filter(n => n.parentId === npc.id);
        filhos.forEach(f => { if (f.genitor2 && f.genitor2.trim()) parceirosSet.add(f.genitor2.trim()); });
        const parceirosUnicos = Array.from(parceirosSet);

        const corBordaAvatar = isSelecionado ? '#00ffcc' : (isMorto ? '#ff4444' : '#555');

        return (
            <li key={npc.id}>
                {/* 🔥 LARGURA PADRONIZADA (width: 180px) ANTI-ESMAGAMENTO HORIZONTAL 🔥 */}
                <div className="arvore-node-container" style={{ borderColor: isSelecionado ? '#00ffcc' : (isMorto ? '#ff4444' : '#333'), boxShadow: isSelecionado ? '0 0 15px rgba(0, 255, 204, 0.3)' : 'none' }} onClick={() => setNpcSelecionado(npc)}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-5px' }}>
                        <button onClick={(e) => { e.stopPropagation(); deletarNpc(npc.id); }} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '14px', cursor: 'pointer' }}>✖</button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                            <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#1a2333', border: `2px solid ${corBordaAvatar}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px', overflow: 'hidden', boxShadow: isSelecionado ? '0 0 10px rgba(0,255,204,0.5)' : 'none' }}>
                                {npc.avatar && npc.avatar.trim() !== '' ? (
                                    <img src={npc.avatar} alt={npc.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                                ) : null}
                                <span style={{ color: '#aaa', fontSize: '15px', fontWeight: 'bold', display: (npc.avatar && npc.avatar.trim() !== '') ? 'none' : 'block' }}>{getIniciais(npc.nome)}</span>
                            </div>

                            <div style={{ fontWeight: 'bold', color: isMorto ? '#ff4444' : (isSelecionado ? '#00ffcc' : '#fff'), fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{npc.nome || 'Desconhecido'}</div>
                            <div style={{ color: '#888', fontSize: '11px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{npc.papel || 'NPC'}</div>
                        </div>

                        {parceirosUnicos.length === 1 && (
                            <>
                                <div style={{ color: '#ffcc00', fontSize: '11px' }}>💍</div>
                                <div style={{ textAlign: 'center', paddingLeft: '4px', borderLeft: '1px dashed #555', maxWidth: '60px' }}>
                                    <div style={{ fontWeight: 'bold', color: '#ccc', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parceirosUnicos[0]}</div>
                                    <div style={{ color: '#666', fontSize: '9px', marginTop: '2px' }}>Parceiro</div>
                                </div>
                            </>
                        )}
                    </div>

                    <div style={{ marginTop: '10px', borderTop: '1px solid #333', paddingTop: '6px' }}>
                        <button className="btn-neon" onClick={(e) => { e.stopPropagation(); adicionarMembro(npc.id, parceirosUnicos.length === 1 ? parceirosUnicos[0] : ""); }} style={{ padding: '2px 6px', fontSize: '10px', margin: 0, borderColor: '#0088ff', color: '#0088ff', width: '100%' }}>➕ {parceirosUnicos.length > 1 ? 'Herdeiro Geral' : 'Gerar Herdeiro'}</button>
                    </div>
                </div>

                {filhos.length > 0 && parceirosUnicos.length <= 1 && (<ul>{filhos.map(f => renderNPC(f))}</ul>)}

                {parceirosUnicos.length > 1 && (
                    <ul>
                        {parceirosUnicos.map(parceiroNome => {
                            const filhosDesteParceiro = filhos.filter(f => (f.genitor2 || "").trim() === parceiroNome);
                            return (
                                <li key={parceiroNome}>
                                    <div className="arvore-node-container" style={{ borderColor: '#ffcc00', padding: '8px 10px', background: 'rgba(255, 204, 0, 0.05)', width: '150px' }}>
                                        <div style={{ color: '#ffcc00', fontSize: '11px', marginBottom: '4px' }}>💍 União com:</div>
                                        <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parceiroNome}</div>
                                        <div style={{ marginTop: '8px', borderTop: '1px solid #555', paddingTop: '6px' }}>
                                            <button className="btn-neon" onClick={(e) => { e.stopPropagation(); adicionarMembro(npc.id, parceiroNome); }} style={{ padding: '2px 6px', fontSize: '10px', margin: 0, borderColor: '#ffcc00', color: '#ffcc00', width: '100%' }}>➕ Filho(a)</button>
                                        </div>
                                    </div>
                                    {filhosDesteParceiro.length > 0 && (<ul>{filhosDesteParceiro.map(f => renderNPC(f))}</ul>)}
                                </li>
                            )
                        })}
                        {filhos.filter(f => !(f.genitor2||"").trim()).length > 0 && (
                            <li key="desconhecido">
                                <div className="arvore-node-container" style={{ borderColor: '#888', padding: '8px 10px', background: 'rgba(255, 255, 255, 0.05)', width: '150px' }}>
                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>🧬 Outras Linhagens</div>
                                    <div style={{ marginTop: '8px', borderTop: '1px solid #555', paddingTop: '6px' }}>
                                        <button className="btn-neon" onClick={(e) => { e.stopPropagation(); adicionarMembro(npc.id, ""); }} style={{ padding: '2px 6px', fontSize: '10px', margin: 0, borderColor: '#aaa', color: '#aaa', width: '100%' }}>➕ Adicionar</button>
                                    </div>
                                </div>
                                <ul>{filhos.filter(f => !(f.genitor2||"").trim()).map(f => renderNPC(f))}</ul>
                            </li>
                        )}
                    </ul>
                )}
            </li>
        );
    };

    const paiAtivo = (npcSelecionado?.parentId && familiaAtiva) ? (familias[familiaAtiva] || []).find(n => n.id === npcSelecionado.parentId) : null;
    const opcoesGenitor2 = paiAtivo ? Array.from(new Set((paiAtivo.parceiros || paiAtivo.conjuge || "").split(',').map(s=>s.trim()).filter(Boolean))) : [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: '75vh', position: 'relative' }}>
            
            {/* 🔥 BARRA SUPERIOR (NAVBAR) DE GESTÃO DA ÁRVORE 🔥 */}
            <div className="def-box" style={{ padding: '15px 20px', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <h3 style={{ color: '#00ffcc', margin: 0, textShadow: '0 0 10px rgba(0,255,204,0.4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🌳 Panteão & Linhagens <span style={{ fontSize: '0.6em', background: 'rgba(0,255,204,0.1)', color: '#00ffcc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #00ffcc' }}>MODO CANVAS</span>
                    </h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-neon btn-blue" onClick={exportarBackup} style={{ padding: '5px 12px', fontSize: '11px', margin: 0 }}>💾 Backup</button>
                        <input type="file" ref={fileInputRef} accept=".json" onChange={importarBackup} style={{ display: 'none' }} />
                        <button className="btn-neon btn-gold" onClick={() => fileInputRef.current?.click()} style={{ padding: '5px 12px', fontSize: '11px', margin: 0 }}>📂 Carregar</button>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <input type="text" className="input-neon" placeholder="Criar Nova Árvore..." value={novaArvoreInput} onChange={(e) => setNovaArvoreInput(e.target.value)} style={{ padding: '5px 10px', borderColor: '#00ffcc', color: '#fff', width: '150px', fontSize: '12px' }}/>
                        <button className="btn-neon btn-green" onClick={criarFamilia} style={{ padding: '0 12px', margin: 0, fontSize: '12px', fontWeight: 'bold' }}>➕ ADICIONAR</button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '70px', overflowY: 'auto' }}>
                    {Object.keys(familias).map(fam => (
                        <div key={fam} style={{ display: 'flex', alignItems: 'center' }}>
                            <button className="btn-neon" onClick={() => { setFamiliaAtiva(fam); setNpcSelecionado(null); }} style={{ background: familiaAtiva === fam ? 'rgba(0, 255, 204, 0.2)' : 'transparent', color: familiaAtiva === fam ? '#fff' : '#aaa', borderColor: familiaAtiva === fam ? '#00ffcc' : '#444', padding: '5px 15px', margin: 0, borderRight: 'none', borderRadius: '5px 0 0 5px', fontWeight: familiaAtiva === fam ? 'bold' : 'normal' }}>{fam}</button>
                            <button onClick={() => editarNomeFamilia(fam)} style={{ background: 'rgba(255, 204, 0, 0.1)', border: '1px solid #444', borderLeft: '1px dashed #555', borderRight: 'none', padding: '6px 8px', color: '#ffcc00', cursor: 'pointer' }} title="Renomear Árvore">✏️</button>
                            <button onClick={() => deletarFamilia(fam)} style={{ background: '#ff003c22', border: '1px solid #444', borderLeft: 'none', borderRadius: '0 5px 5px 0', padding: '6px 8px', color: '#ff4444', cursor: 'pointer' }} title="Apagar Árvore">✖</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* 🔥 O CANVAS PRINCIPAL DOMINANDO 100% DA TELA HORIZONTAL E VERTICAL 🔥 */}
            {familiaAtiva && (
                <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #1a2333', borderRadius: '10px', padding: '30px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    <div style={{ alignSelf: 'center', marginBottom: '30px' }}>
                        <button className="btn-neon btn-green" onClick={() => adicionarMembro(null)} style={{ padding: '8px 20px', margin: 0, fontSize: '12px', fontWeight: 'bold', boxShadow: '0 0 15px rgba(0,255,0,0.2)' }}>👑 ADICIONAR FUNDADOR</button>
                    </div>
                    
                    <div className="genealogy-tree" style={{ minWidth: '100%', display: 'inline-block', textAlign: 'center' }}>
                        {(familias[familiaAtiva] || []).filter(n => n.parentId === null).length === 0 ? (
                            <p style={{ color: '#555', fontStyle: 'italic', marginTop: '40px' }}>Esta árvore está vazia. Invoque o primeiro primordial.</p>
                        ) : (
                            <ul style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
                                {(familias[familiaAtiva] || []).filter(n => n.parentId === null).map(n => renderNPC(n))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* 🔥 EDITOR DE FICHA FLUTUANTE RETRÁTIL (GAVETA FLUTUANTE) 🔥 */}
            {npcSelecionado && (
                <div className="def-box fade-in" style={{ 
                    position: 'absolute', top: '90px', right: '20px', width: '380px', 
                    maxHeight: 'calc(100% - 110px)', overflowY: 'auto', 
                    background: 'rgba(7, 10, 15, 0.95)', border: '2px solid #00ffcc', 
                    boxShadow: '-10px 10px 30px rgba(0,0,0,0.8), inset 0 0 15px rgba(0,255,204,0.1)', 
                    zIndex: 100, padding: '20px', borderRadius: '12px',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #00ffcc', paddingBottom: '10px', marginBottom: '15px' }}>
                        <h3 style={{ color: '#00ffcc', margin: 0 }}>📋 Editor de Ficha</h3>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button onClick={injetarNaMesa} className="btn-neon btn-green" style={{ padding: '4px 10px', margin: 0, fontSize: '11px' }}>🚀 INJETAR</button>
                            <button onClick={() => setNpcSelecionado(null)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px', fontWeight: 'bold' }} title="Fechar Gaveta">✖</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', background: 'rgba(0, 255, 204, 0.05)', padding: '10px', borderRadius: '8px', border: '1px dashed #00ffcc' }}>
                            <div style={{ width: '50px', height: '50px', borderRadius: '8px', border: '1px solid #00ffcc', background: '#05070a', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShr: 0 }}>
                                {npcSelecionado.avatar && npcSelecionado.avatar.trim() !== '' ? (<img src={npcSelecionado.avatar} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />) : null}
                                <span style={{ color: '#00ffcc', fontSize: '18px', fontWeight: 'bold', display: (npcSelecionado.avatar && npcSelecionado.avatar.trim() !== '') ? 'none' : 'block' }}>{getIniciais(npcSelecionado.nome)}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={{ color: '#00ffcc', fontSize: '0.8em', textTransform: 'uppercase', fontWeight: 'bold' }}>🔗 Foto (Avatar)</label>
                                <input type="text" className="input-neon" placeholder="URL da imagem..." value={npcSelecionado.avatar || ''} onChange={(e) => atualizarNpc('avatar', e.target.value)} style={{ width: '100%', padding: '6px', borderColor: '#00ffcc', color: '#fff', marginTop: '4px', background: '#05070a', boxSizing: 'border-box', fontSize: '0.9em' }} />
                            </div>
                        </div>

                        <div style={{ background: 'rgba(0, 136, 255, 0.1)', border: '1px solid #0088ff', padding: '10px', borderRadius: '8px' }}>
                            <label style={{ color: '#0088ff', fontSize: '0.8em', textTransform: 'uppercase', fontWeight: 'bold' }}>🧬 Descende de (Pai/Mãe):</label>
                            <select className="input-neon" value={npcSelecionado.parentId || ""} onChange={(e) => atualizarNpc('parentId', e.target.value === "" ? null : Number(e.target.value))} style={{ width: '100%', padding: '6px', borderColor: '#0088ff', color: '#fff', marginTop: '4px', background: '#05070a', boxSizing: 'border-box', fontSize: '0.9em' }}>
                                <option value="">👑 Nenhum (É um Fundador)</option>
                                {(familias[familiaAtiva] || []).filter(n => n.id !== npcSelecionado.id).map(n => (<option key={n.id} value={n.id}>↳ {n.nome}</option>))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1.5, minWidth: 0 }}>
                                <label style={{ color: '#00ffcc', fontSize: '0.8em', textTransform: 'uppercase' }}>Nome da Entidade</label>
                                <input type="text" className="input-neon" value={npcSelecionado.nome} onChange={(e) => atualizarNpc('nome', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#333', color: '#fff', marginTop: '4px', boxSizing: 'border-box', fontSize: '0.9em' }} />
                            </div>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={{ color: '#ff00ff', fontSize: '0.8em', textTransform: 'uppercase', fontWeight: 'bold' }}>📁 Subpasta</label>
                                <input type="text" className="input-neon" placeholder="Ex: Clã / X" value={npcSelecionado.afiliacao || ''} onChange={(e) => atualizarNpc('afiliacao', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#ff00ff', color: '#ff00ff', marginTop: '4px', boxSizing: 'border-box', background: 'rgba(255, 0, 255, 0.05)', fontSize: '0.9em' }} title="Pasta Mestre onde o NPC habitará!" />
                            </div>
                        </div>

                        <div>
                            <label style={{ color: '#ffcc00', fontSize: '0.8em', textTransform: 'uppercase' }}>💍 Parceiro(s) / Cônjuge</label>
                            <input type="text" className="input-neon" placeholder="Ex: Lilith, Eva" value={npcSelecionado.parceiros || npcSelecionado.conjuge || ""} onChange={(e) => atualizarNpc('parceiros', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#ffcc00', color: '#fff', marginTop: '4px', boxSizing: 'border-box', fontSize: '0.9em' }} />
                        </div>

                        {paiAtivo && opcoesGenitor2.length > 0 && (
                            <div style={{ background: 'rgba(255, 204, 0, 0.1)', border: '1px solid #ffcc00', padding: '10px', borderRadius: '8px' }}>
                                <label style={{ color: '#ffcc00', fontSize: '0.8em', textTransform: 'uppercase', fontWeight: 'bold' }}>👼 Fruto da União com:</label>
                                <select className="input-neon" value={npcSelecionado.genitor2 || ""} onChange={(e) => atualizarNpc('genitor2', e.target.value)} style={{ width: '100%', padding: '6px', borderColor: '#ffcc00', color: '#fff', marginTop: '4px', background: '#05070a', boxSizing: 'border-box', fontSize: '0.9em' }}>
                                    <option value="">Desconhecido / Linhagem Geral</option>
                                    {opcoesGenitor2.map(p => (<option key={p} value={p}>{p}</option>))}
                                </select>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase' }}>Raça / Papel</label>
                                <input type="text" className="input-neon" placeholder="Ex: Demônio" value={npcSelecionado.papel} onChange={(e) => atualizarNpc('papel', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#333', color: '#fff', marginTop: '4px', boxSizing: 'border-box', fontSize: '0.9em' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase' }}>Status</label>
                                <select className="input-neon" value={npcSelecionado.status} onChange={(e) => atualizarNpc('status', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#333', color: '#fff', marginTop: '4px', background: 'rgba(0,0,0,0.8)', boxSizing: 'border-box', fontSize: '0.9em' }}>
                                    <option value="Vivo">Vivo</option>
                                    <option value="Morto">Morto</option>
                                    <option value="Desaparecido">Desaparecido</option>
                                    <option value="Selado">Selado</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase' }}>Classe</label>
                                <input type="text" className="input-neon" value={npcSelecionado.classe} onChange={(e) => atualizarNpc('classe', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#333', color: '#fff', marginTop: '4px', boxSizing: 'border-box', fontSize: '0.9em' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={{ color: '#aaa', fontSize: '0.8em', textTransform: 'uppercase' }}>Elemento</label>
                                <input type="text" className="input-neon" value={npcSelecionado.elemento} onChange={(e) => atualizarNpc('elemento', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#333', color: '#fff', marginTop: '4px', boxSizing: 'border-box', fontSize: '0.9em' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={{ color: '#44ff44', fontSize: '0.8em', textTransform: 'uppercase' }}>HP Base</label>
                                <input type="number" className="input-neon" value={npcSelecionado.hp} onChange={(e) => atualizarNpc('hp', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#333', color: '#44ff44', marginTop: '4px', fontWeight: 'bold', boxSizing: 'border-box', fontSize: '0.9em' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <label style={{ color: '#44bbff', fontSize: '0.8em', textTransform: 'uppercase' }}>Mana</label>
                                <input type="number" className="input-neon" value={npcSelecionado.mana} onChange={(e) => atualizarNpc('mana', e.target.value)} style={{ width: '100%', padding: '8px', borderColor: '#333', color: '#44bbff', marginTop: '4px', fontWeight: 'bold', boxSizing: 'border-box', fontSize: '0.9em' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ color: '#00ffcc', fontSize: '0.8em', textTransform: 'uppercase' }}>Lore Base</label>
                            <textarea className="input-neon" value={npcSelecionado.lore} onChange={(e) => atualizarNpc('lore', e.target.value)} style={{ width: '100%', height: '80px', padding: '8px', borderColor: '#333', color: '#aaa', marginTop: '4px', resize: 'none', lineHeight: '1.4', boxSizing: 'border-box', fontSize: '0.85em' }} />
                        </div>

                        <button className="btn-neon btn-red" onClick={() => deletarNpc(npcSelecionado.id)} style={{ padding: '8px', fontSize: '0.9em', marginTop: '5px' }}>✖ APAGAR MEMBRO</button>
                    </div>
                </div>
            )}

            {/* 🔥 CSS DE BLINDAGEM: GRELHA UNIFORME E LARGURA CRAVADA 🔥 */}
            <style dangerouslySetInnerHTML={{__html: `
                .genealogy-tree { display: flex; justify-content: center; }
                .genealogy-tree ul { padding-top: 20px; position: relative; display: flex; justify-content: center; padding-left: 0; margin: 0; }
                .genealogy-tree li { text-align: center; list-style-type: none; position: relative; padding: 20px 8px 0 8px; }
                .genealogy-tree li::before, .genealogy-tree li::after { content: ''; position: absolute; top: 0; right: 50%; border-top: 2px solid #334455; width: 50%; height: 20px; }
                .genealogy-tree li::after { right: auto; left: 50%; border-left: 2px solid #334455; }
                .genealogy-tree li:only-child::after, .genealogy-tree li:only-child::before { display: none; }
                .genealogy-tree li:only-child { padding-top: 0; }
                .genealogy-tree li:first-child::before, .genealogy-tree li:last-child::after { border: 0 none; }
                .genealogy-tree li:last-child::before { border-right: 2px solid #334455; border-radius: 0 5px 0 0; }
                .genealogy-tree li:first-child::after { border-radius: 5px 0 0 0; }
                .genealogy-tree ul::before { content: ''; position: absolute; top: 0; left: 50%; border-left: 2px solid #334455; width: 0; height: 20px; transform: translateX(-50%); }
                .genealogy-tree > ul::before { display: none; }
                
                /* LARGURA FIXA PARA IMPEDIR ESTIRAMENTO HORIZONTAL BIZARRO */
                .arvore-node-container { 
                    background: rgba(10, 14, 20, 0.9); 
                    border: 1px solid #333; 
                    padding: 10px 12px; 
                    text-decoration: none; 
                    display: inline-block; 
                    border-radius: 8px; 
                    transition: all 0.3s; 
                    width: 180px; 
                    box-sizing: border-box;
                    cursor: pointer; 
                    position: relative; 
                }
                .arvore-node-container:hover { 
                    background: rgba(0, 255, 204, 0.15) !important; 
                    border-color: rgba(0, 255, 204, 0.6) !important; 
                    box-shadow: 0 0 15px rgba(0,255,204,0.2);
                }
                .genealogy-tree li:hover > .arvore-node-container { border-color: #00ffcc; }
            `}} />
        </div>
    );
}