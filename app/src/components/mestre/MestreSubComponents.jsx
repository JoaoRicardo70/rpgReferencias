import React, { useState } from 'react';
import { useMestreForm } from './MestreFormContext';
import { ref, set } from 'firebase/database';
import { database } from '../../services/firebase-config';
import PainelMestreSandbox from './PainelMestreSandbox';
import { getMaximo } from '../../core/attributes';
import { calcularCA } from '../../core/engine';
import { calcularBarrasVida, getVitalMax, getVitalMaxEstavel } from '../../core/vitals';
import { calcularFatorMultiplicadorForca } from '../../core/poder';

const FALLBACK = <div style={{color:'#888',padding:10}}>Mestre provider não encontrado</div>;

// --- FUNÇÕES DE CÁLCULO DE STATUS ---
function getStatusLimpo(ficha, chave, threshold) {
    if (!ficha) return { max: 0, atual: 0, pVit: 0 };

    // 🩸 Vida passa pela MESMA fonte única de verdade que o resto do app (calcularBarrasVida,
    // core/vitals.js) — ela decide a escala/nº de barras pelo máximo ESTÁVEL (sem Formas), igual
    // MestreFormContext.jsx > jogadoresComStats já faz pro card compacto. Reimplementar a conta
    // aqui com o máximo BRUTO (com Formas, via getMaximo) fazia este card "expandido" mostrar um
    // nº de barras/Máximo diferente do card compacto pro MESMO personagem sempre que ele tivesse
    // uma Forma ativa.
    //
    // 🩹 SINCRONIA COM A FICHA/MAPA (pedido do usuário): multiplica pelo "Multiplicador de Força"
    // de Vida (core/poder.js > calcularFatorMultiplicadorForca), igual a Ficha Definitiva e a
    // moldura de combate do Mapa já fazem — senão o MESMO personagem mostra um Máximo diferente
    // aqui.
    if (chave === 'vida') {
        const fatorVida = calcularFatorMultiplicadorForca(ficha, 'vida');
        const rawMx = getVitalMax('vida', ficha) * fatorVida;
        const rawMxEstavel = getVitalMaxEstavel('vida', ficha) * fatorVida;
        const info = calcularBarrasVida(rawMx, 'vida', ficha.vida?.atual, rawMxEstavel);
        return { max: info.totalMax, atual: info.atual, pVit: info.p };
    }

    let mx = 0;
    try { mx = getMaximo(ficha, chave); } catch(e){}
    if (!mx || isNaN(mx)) mx = parseInt(ficha[chave]?.base) || 0;
    // 🩹 SINCRONIA COM A FICHA/MAPA (pedido do usuário): mesmo "Multiplicador de Força" aplicado
    // acima pra vida, agora também pra mana/aura/chakra/corpo — senão o MESMO personagem mostra um
    // Máximo diferente aqui do que na Ficha Definitiva/Mapa assim que o Multiplicador entra em jogo.
    mx = mx * (calcularFatorMultiplicadorForca(ficha, chave) || 1);
    const strVal = String(Math.floor(mx));
    const pVit = Math.max(0, strVal.length - threshold);
    const maxFinal = pVit > 0 ? Math.floor(mx / Math.pow(10, pVit)) : mx;
    let atual = maxFinal;
    if (ficha[chave] && ficha[chave].atual !== undefined) {
        let at = parseFloat(ficha[chave].atual);
        if (!isNaN(at)) atual = (pVit > 0 && at > maxFinal * 10) ? Math.floor(at / Math.pow(10, pVit)) : at;
    }
    return { max: maxFinal, atual: atual, pVit: pVit };
}

function getEnergiasSupremas(ficha) {
    if (!ficha) return { vitais: {max:0, atual:0}, mortais: {max:0, atual:0} };
    const getRawBase = (attr) => parseFloat(ficha[attr]?.base) || 0;
    const getPrestAtual = (k) => {
        let baseP = 0;
        if (k === 'status') {
            const STATS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
            let m = 0;
            STATS.forEach(s => m += getRawBase(s));
            baseP = Math.floor((m / 8) / 1000);
        } else {
            const mults = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000 };
            baseP = Math.floor(getRawBase(k) / (mults[k] || 1));
        }
        const anchor = k === 'status' ? 'forca' : k;
        let mFormas = parseFloat(ficha[anchor]?.mFormas) || 1.0;
        let bMFormas = 0;
        let hasMFormas = false;
        const processarEfeitos = (efeitos) => {
            if(!efeitos) return;
            efeitos.forEach(e => {
                let atr = (e.atributo||'').toLowerCase();
                let prop = (e.propriedade||'').toLowerCase();
                let afeta = (atr === anchor) || (atr === 'todos_status' && k==='status') || (atr === 'todas_energias' && k!=='status');
                if(afeta && prop === 'mformas') { bMFormas += parseFloat(e.valor) || 0; hasMFormas = true; }
            });
        };
        (ficha.inventario || []).filter(i => i.equipado).forEach(i => {
            processarEfeitos(i.efeitos);
            if (i.formaAtivaId && i.formas) {
                let activeForm = i.formas.find(f => f.id === i.formaAtivaId);
                if (activeForm && activeForm.acumulaFormaBase !== false) {
                   let activeConfig = (activeForm.configs || []).find(c => c.id === i.configAtivaId) || activeForm.configs?.[0];
                   if (activeConfig) processarEfeitos(activeConfig.efeitos);
                }
            }
        });
        (ficha.poderes || []).filter(p => p.ativa).forEach(p => processarEfeitos(p.efeitos));
        let efetivoMFormas = (mFormas === 1.0 && hasMFormas ? 0 : mFormas) + bMFormas;
        const multForma = efetivoMFormas >= 10 ? (efetivoMFormas / 10) : 1;
        return Math.floor(baseP * multForma);
    };
    const maxVitais = Math.floor((getPrestAtual('vida') + getPrestAtual('chakra') + getPrestAtual('corpo')) / 3);
    const maxMortais = Math.floor((getPrestAtual('mana') + getPrestAtual('status') + getPrestAtual('aura')) / 3);
    let atualVitais = ficha.pontosVitais?.atual;
    if (atualVitais === undefined || isNaN(atualVitais)) atualVitais = maxVitais;
    let atualMortais = ficha.pontosMortais?.atual;
    if (atualMortais === undefined || isNaN(atualMortais)) atualMortais = maxMortais;
    return { vitais: { max: maxVitais, atual: atualVitais }, mortais: { max: maxMortais, atual: atualMortais } };
}

export function MestreAcessoNegado() {
    const ctx = useMestreForm();
    if (!ctx) return FALLBACK;
    const { isMestre } = ctx;

    if (isMestre) return null;

    return (
        <div style={{ color: '#ff003c', textAlign: 'center', padding: 50, fontSize: '1.5em', fontWeight: 'bold' }}>
            Acesso Negado. Apenas o Mestre pode aceder a este domínio.
        </div>
    );
}

// 🔥 O NOVO VISOR COM SISTEMA DE PASTAS, ABRIR FICHA E CO-MESTRE 🔥
export function MestreVisorJogadores() {
    const ctx = useMestreForm();
    if (!ctx) return FALLBACK;
    const { jogadoresComStats, meuNome, handleApagarJogador, fmt, toggleCoMestre, mesaCriador, mesaMestres } = ctx;

    const [abaVisor, setAbaVisor] = useState('jogadores');
    const [pastasAbertas, setPastasAbertas] = useState({});
    
    // O ESTADO QUE ABRE O MODAL DA FICHA
    const [jogadorInspecionado, setJogadorInspecionado] = useState(null);

    const togglePasta = (nomePasta) => setPastasAbertas(prev => ({...prev, [nomePasta]: !prev[nomePasta]}));

    const herois = jogadoresComStats.filter(j => !j.ficha?.isNPC && j.ficha?.bio?.mesa !== 'npc');
    const npcs = jogadoresComStats.filter(j => j.ficha?.isNPC || j.ficha?.bio?.mesa === 'npc');

    const npcsPorFamilia = {};
    npcs.forEach(npc => {
        let familia = npc.ficha?.bio?.afiliacao;
        
        if (!familia || familia.trim() === '') {
            const lorePoder = (npc.ficha?.poderes || []).find(p => p.nome === "📖 Linhagem & Lore");
            if (lorePoder && lorePoder.descricao) {
                const match = lorePoder.descricao.match(/Clã de Origem:\s*(.*)/);
                if (match && match[1]) familia = match[1].trim();
            }
        }
        
        if (!familia || familia === 'Nenhum' || familia.trim() === '') {
            familia = 'Sem Clã / Bestas Soltas';
        }
        
        if (!npcsPorFamilia[familia]) npcsPorFamilia[familia] = [];
        npcsPorFamilia[familia].push(npc);
    });

    const renderCard = (jogador) => {
        const { nome, ficha, classId, percHp } = jogador;
        
        const vida = getStatusLimpo(ficha, 'vida', 8);
        const mana = getStatusLimpo(ficha, 'mana', 9);
        const aura = getStatusLimpo(ficha, 'aura', 9);
        const chakra = getStatusLimpo(ficha, 'chakra', 9);
        const corpo = getStatusLimpo(ficha, 'corpo', 9);
        const supremas = getEnergiasSupremas(ficha);

        const isGrand = String(classId).toLowerCase().includes('grand ');
        const isMisterio = classId === '?' || classId?.toLowerCase() === 'desconhecido';
        
        const nickSanitizado = nome.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isCoMestre = mesaMestres && mesaMestres[nickSanitizado];
        const isSupremo = nome === mesaCriador;

        let boxBorder = `1px solid ${nome === meuNome ? '#0f0' : '#333'}`;
        let boxShadow = nome === meuNome ? '0 0 15px rgba(0,255,0,0.2)' : 'none';
        let titleColor = '#fff';
        let subColor = '#aaa';
        let subText = classId ? String(classId).toUpperCase() : 'MUNDANO';

        if (isMisterio) {
            boxBorder = '2px dashed #666';
            titleColor = '#aaa'; subColor = '#666';
            subText = '👤 CLASSE: ? (ENCOBERTO)';
        } else if (isGrand) {
            boxBorder = '2px solid #ffcc00';
            boxShadow = '0 0 20px rgba(255,0,60,0.4), inset 0 0 20px rgba(255,204,0,0.1)';
            titleColor = '#ffcc00';
            subColor = '#ffcc00';
        }

        return (
            <div key={nome} style={{ background: 'rgba(0,0,0,0.6)', border: boxBorder, padding: '15px', borderRadius: '5px', position: 'relative', overflow: 'hidden', boxShadow: boxShadow }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', width: `${percHp}%`, background: percHp > 50 ? '#0f0' : percHp > 20 ? '#ffcc00' : '#f00', transition: 'width 0.3s' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', marginTop: '5px' }}>
                    <strong style={{ color: titleColor, fontSize: '1.2em', textShadow: isGrand ? '0 0 10px #ff003c' : 'none' }}>
                        {nome} {nome === meuNome && <span style={{color: '#0f0', fontSize: '0.6em', textShadow: 'none'}}>(VOCÊ)</span>}
                        {isSupremo && <span style={{marginLeft:'5px'}} title="Mestre Supremo">👑</span>}
                        {isCoMestre && !isSupremo && <span style={{marginLeft:'5px'}} title="Co-Mestre">🛡️</span>}
                    </strong>
                    <span style={{ color: subColor, fontSize: isGrand ? '0.85em' : '0.8em', fontStyle: isMisterio ? 'normal' : 'italic', fontWeight: isGrand ? 'bold' : 'normal' }}>
                        {subText}
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', fontSize: '0.75em', color: '#ccc', marginBottom: '12px' }}>
                    <div style={{ gridColumn: 'span 3', background: 'rgba(255,0,0,0.1)', padding: '6px', borderRadius: '3px', borderLeft: '3px solid #f00', display: 'flex', justifyContent: 'space-between' }}>
                        <span><span style={{ color: '#f00', fontWeight: 'bold' }}>HP:</span> {fmt(vida.atual)} / {fmt(vida.max)}</span>
                        {vida.pVit > 0 && <span style={{ color: '#ffcc00', fontWeight: 'bold' }}>+{vida.pVit} Vit</span>}
                    </div>
                    <div style={{ background: 'rgba(0,136,255,0.1)', padding: '4px 6px', borderRadius: '3px', borderLeft: '2px solid #0088ff' }}>
                        <span style={{ color: '#0088ff', fontWeight: 'bold' }}>MP:</span><br/>{fmt(mana.atual)} / {fmt(mana.max)}
                    </div>
                    <div style={{ background: 'rgba(170,0,255,0.1)', padding: '4px 6px', borderRadius: '3px', borderLeft: '2px solid #aa00ff' }}>
                        <span style={{ color: '#aa00ff', fontWeight: 'bold' }}>AURA:</span><br/>{fmt(aura.atual)} / {fmt(aura.max)}
                    </div>
                    <div style={{ background: 'rgba(0,255,170,0.1)', padding: '4px 6px', borderRadius: '3px', borderLeft: '2px solid #00ffaa' }}>
                        <span style={{ color: '#00ffaa', fontWeight: 'bold' }}>CHAK:</span><br/>{fmt(chakra.atual)} / {fmt(chakra.max)}
                    </div>
                    <div style={{ background: 'rgba(255,136,0,0.1)', padding: '4px 6px', borderRadius: '3px', borderLeft: '2px solid #ff8800' }}>
                        <span style={{ color: '#ff8800', fontWeight: 'bold' }}>CORP:</span><br/>{fmt(corpo.atual)} / {fmt(corpo.max)}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 6px', borderRadius: '3px', borderLeft: '2px solid #fff' }}>
                        <span style={{ color: '#fff', fontWeight: 'bold' }}>P.VIT:</span><br/>{fmt(supremas.vitais.atual)} / {fmt(supremas.vitais.max)}
                    </div>
                    <div style={{ background: 'rgba(150,0,0,0.2)', padding: '4px 6px', borderRadius: '3px', borderLeft: '2px solid #ff3333' }}>
                        <span style={{ color: '#ff3333', fontWeight: 'bold' }}>P.MOR:</span><br/>{fmt(supremas.mortais.atual)} / {fmt(supremas.mortais.max)}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        className="btn-neon btn-blue"
                        style={{ flex: 1, padding: '4px', fontSize: '0.8em', margin: 0 }}
                        onClick={() => setJogadorInspecionado(jogador)}
                    >
                        📖 ABRIR FICHA
                    </button>
                    
                    {/* SÓ O DONO DA SALA PODE VER O BOTÃO DE PROMOVER CO-MESTRE */}
                    {meuNome === mesaCriador && !isSupremo && (
                        <button
                            className={`btn-neon ${isCoMestre ? 'btn-gold' : 'btn-purple'}`}
                            style={{ flex: 1, padding: '4px', fontSize: '0.8em', margin: 0, borderColor: isCoMestre ? '#ffcc00' : '#aa00ff', color: isCoMestre ? '#ffcc00' : '#aa00ff' }}
                            onClick={() => toggleCoMestre(nome)}
                        >
                            {isCoMestre ? '👑 REBAIXAR' : '🛡️ PROMOVER'}
                        </button>
                    )}

                    <button
                        className="btn-neon btn-red"
                        style={{ flex: 1, padding: '4px', fontSize: '0.8em', margin: 0, opacity: isSupremo ? 0.3 : 1 }}
                        onClick={() => handleApagarJogador(nome)}
                        disabled={isSupremo}
                    >
                        ❌ APAGAR
                    </button>
                </div>
                
                <PainelMestreSandbox personagemId={nome} ficha={ficha} />
            </div>
        );
    };

    return (
        <div className="def-box" style={{ flex: '1 1 60%', minWidth: '400px', borderLeft: '4px solid #0088ff' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ color: '#0088ff', margin: 0 }}>Visor de Entidades ({jogadoresComStats.length})</h3>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button className={`btn-neon ${abaVisor === 'jogadores' ? 'btn-blue' : ''}`} onClick={() => setAbaVisor('jogadores')} style={{ margin: 0, padding: '5px 15px', fontSize: '0.9em' }}>🎭 JOGADORES ({herois.length})</button>
                    <button className={`btn-neon ${abaVisor === 'npcs' ? 'btn-red' : ''}`} onClick={() => setAbaVisor('npcs')} style={{ margin: 0, padding: '5px 15px', fontSize: '0.9em' }}>👹 NPCs ({npcs.length})</button>
                </div>
            </div>

            {abaVisor === 'jogadores' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
                    {herois.map(renderCard)}
                    {herois.length === 0 && <div style={{ color: '#aaa', fontStyle: 'italic' }}>Nenhum jogador encontrado.</div>}
                </div>
            )}

            {abaVisor === 'npcs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Object.entries(npcsPorFamilia).map(([familia, lista]) => (
                        <div key={familia} style={{ border: '1px solid #444', borderRadius: '5px', overflow: 'hidden' }}>
                            <button 
                                onClick={() => togglePasta(familia)}
                                style={{ 
                                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                                    padding: '12px 15px', background: pastasAbertas[familia] ? 'rgba(255, 0, 60, 0.2)' : 'rgba(0, 0, 0, 0.5)', 
                                    border: 'none', borderLeft: '4px solid #ff003c', color: '#ffcc00', fontWeight: 'bold', 
                                    cursor: 'pointer', textAlign: 'left', fontSize: '1.1em', transition: '0.3s'
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {pastasAbertas[familia] ? '📂' : '📁'} {familia.toUpperCase()}
                                </span>
                                <span style={{ color: '#fff', fontSize: '0.8em', background: '#ff003c', padding: '2px 8px', borderRadius: '12px' }}>{lista.length}</span>
                            </button>
                            
                            {pastasAbertas[familia] && (
                                <div style={{ padding: '15px', background: 'rgba(0,0,0,0.3)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
                                    {lista.map(renderCard)}
                                </div>
                            )}
                        </div>
                    ))}
                    {npcs.length === 0 && <div style={{ color: '#aaa', fontStyle: 'italic' }}>Nenhum NPC ou Monstro encontrado.</div>}
                </div>
            )}

            {/* 🔥 O VISUALIZADOR INQUEBRÁVEL DA FICHA DO JOGADOR 🔥 */}
            {jogadorInspecionado && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)',
                    zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
                }}>
                    <div className="fade-in" style={{
                        width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto',
                        background: '#0a0a0f', border: '2px solid #0088ff', borderRadius: '10px', padding: '20px', position: 'relative',
                        boxShadow: '0 0 30px rgba(0,136,255,0.3)'
                    }}>
                        <button onClick={() => setJogadorInspecionado(null)} style={{ position: 'absolute', top: 15, right: 15, background: 'none', border: 'none', color: '#ff003c', fontSize: '1.5em', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
                            {jogadorInspecionado.ficha.avatar?.base ? (
                                <img src={jogadorInspecionado.ficha.avatar.base} alt="Avatar" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #0088ff' }} />
                            ) : (
                                <div style={{ width: '80px', height: '80px', background: '#222', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Sem Foto</div>
                            )}
                            <div>
                                <h2 style={{ color: '#0088ff', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    📖 GRIMÓRIO: {jogadorInspecionado.nome}
                                </h2>
                                <span style={{ color: '#aaa', fontStyle: 'italic' }}>Classe: {jogadorInspecionado.classId?.toUpperCase() || 'MUNDANO'}</span>
                            </div>
                        </div>

                        {/* Atributos Seguros */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '25px' }}>
                            {['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].map(attr => (
                                <div key={attr} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '5px', display: 'flex', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <span style={{ color: '#aaa', textTransform: 'uppercase', fontWeight: 'bold' }}>{attr.substring(0,3)}</span>
                                    <strong style={{ color: '#fff', fontSize: '1.1em' }}>{jogadorInspecionado.ficha[attr]?.base || 0}</strong>
                                </div>
                            ))}
                        </div>
                        
                        {/* Aba de Dominios/Poderes (Lê tanto a ficha antiga plana quanto a nova) */}
                        <h3 style={{ color: '#ffcc00', borderBottom: '1px solid #ffcc00', paddingBottom: '5px' }}>⚡ Domínios Marcados & Poderes Antigos</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '25px' }}>
                            {jogadorInspecionado.ficha.dominios && Object.keys(jogadorInspecionado.ficha.dominios).length > 0 ? Object.entries(jogadorInspecionado.ficha.dominios).map(([nomeDom, dadosDom]) => (
                                <div key={nomeDom} style={{ background: 'rgba(255,204,0,0.1)', borderLeft: '3px solid #ffcc00', padding: '8px 12px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <strong style={{ color: '#fff' }}>{nomeDom}</strong>
                                    <span>
                                        <span style={{ color: '#ffcc00', fontWeight: 'bold', marginRight: '10px' }}>Nv {dadosDom?.nivel || 1}</span>
                                        {dadosDom?.categoria && <span style={{ color: '#888', fontSize: '0.85em', textTransform: 'uppercase' }}>({dadosDom.categoria})</span>}
                                    </span>
                                </div>
                            )) : <div style={{ color: '#888', fontStyle: 'italic' }}>Nenhum Domínio do Grimório novo encontrado.</div>}
                            
                            {/* Mostra também os poderes da aba de habilidades antiga para compatibilidade */}
                            {jogadorInspecionado.ficha.poderes && jogadorInspecionado.ficha.poderes.length > 0 ? jogadorInspecionado.ficha.poderes.map((pod, i) => (
                                <div key={`pod_${i}`} style={{ background: 'rgba(0,136,255,0.1)', borderLeft: '3px solid #0088ff', padding: '8px 12px', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
                                    <strong style={{ color: '#00ccff' }}>{pod.nome}</strong>
                                    <span style={{ color: '#ccc', fontSize: '0.9em', marginTop: '4px' }}>{pod.descricao || 'Sem descrição.'}</span>
                                </div>
                            )) : null}
                        </div>

                        {/* Aba de Inventario */}
                        <h3 style={{ color: '#00ff88', borderBottom: '1px solid #00ff88', paddingBottom: '5px' }}>🎒 Relicário & Inventário</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {jogadorInspecionado.ficha.inventario && jogadorInspecionado.ficha.inventario.length > 0 ? jogadorInspecionado.ficha.inventario.map((item, i) => (
                                <div key={i} style={{ background: 'rgba(0,255,136,0.1)', borderLeft: '3px solid #00ff88', padding: '8px 12px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <strong style={{ color: '#fff' }}>{item.nome || 'Item Desconhecido'}</strong>
                                    <span style={{ color: item.equipado ? '#00ff88' : '#888', fontSize: '0.9em', fontWeight: item.equipado ? 'bold' : 'normal' }}>
                                        {item.equipado ? '(Equipado)' : '(Na mochila)'}
                                    </span>
                                </div>
                            )) : <div style={{ color: '#888', fontStyle: 'italic' }}>O relicário deste jogador está vazio.</div>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function MestreInjetorEntidades() {
    const ctx = useMestreForm();
    if (!ctx) return FALLBACK;
    
    const { 
        dNome, setDNome, dHp, setDHp, dVit, setDVit, 
        dDefTipo, setDDefTipo, dDef, setDDef, 
        dVisivelHp, setDVisivelHp, dOculto, setDOculto, 
        injetarDummie, jogadoresComStats 
    } = ctx;

    const handleSelecionarEntidade = (e) => {
        const nomeSelecionado = e.target.value;
        if (!nomeSelecionado) return;

        const entidade = jogadoresComStats.find(j => j.nome === nomeSelecionado);
        if (entidade) {
            setDNome(entidade.nome);
            setDHp(entidade.hpMax || 100);
            setDVit(0); 
            setDDefTipo('evasiva');
            setDDef(entidade.evasiva || 10); 
        }
    };

    return (
        <div className="def-box" style={{ borderLeft: '4px solid #ff003c' }}>
            <h3 style={{ color: '#ff003c', margin: '0 0 15px 0' }}>👹 Injetor de Entidades (Mapa)</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ background: 'rgba(255, 0, 60, 0.1)', padding: '10px', borderRadius: '5px', border: '1px solid #ff003c' }}>
                    <label style={{ color: '#ff003c', fontSize: '0.85em', fontWeight: 'bold' }}>🔍 Carregar Ficha Salva (Auto-Preencher):</label>
                    <select 
                        className="input-neon" 
                        onChange={handleSelecionarEntidade}
                        defaultValue=""
                        style={{ width: '100%', marginTop: '5px', borderColor: '#ff003c', color: '#ff003c', fontWeight: 'bold' }}
                    >
                        <option value="" disabled>-- Selecione um Jogador ou NPC --</option>
                        {jogadoresComStats.map(j => (
                            <option key={j.nome} value={j.nome}>
                                {j.nome} {(j.classId === 'NPC - Ameaça' || j.ficha?.isNPC) ? '(💀 NPC)' : '(👤 Jogador)'}
                            </option>
                        ))}
                    </select>
                </div>

                <input className="input-neon" type="text" placeholder="Nome (Ex: Dragão Ancião)" value={dNome} onChange={e => setDNome(e.target.value)} />
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}><label style={{ color: '#aaa', fontSize: '0.8em' }}>HP Base</label><input className="input-neon" type="number" value={dHp} onChange={e => setDHp(e.target.value)} style={{ width: '100%' }} /></div>
                    <div style={{ flex: 1 }}><label style={{ color: '#0f0', fontSize: '0.8em' }}>+ Vitalidade (Zeros)</label><input className="input-neon" type="number" value={dVit} onChange={e => setDVit(e.target.value)} style={{ width: '100%', borderColor: '#0f0', color: '#0f0' }} /></div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}><label style={{ color: '#aaa', fontSize: '0.8em' }}>Defesa Alvo</label><select className="input-neon" value={dDefTipo} onChange={e => setDDefTipo(e.target.value)} style={{ width: '100%' }}><option value="evasiva">Evasiva</option><option value="resistencia">Resistência</option></select></div>
                    <div style={{ flex: 1 }}><label style={{ color: '#0088ff', fontSize: '0.8em' }}>Valor (CA)</label><input className="input-neon" type="number" value={dDef} onChange={e => setDDef(e.target.value)} style={{ width: '100%' }} /></div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '5px' }}>
                    <select className="input-neon" value={dVisivelHp} onChange={e => setDVisivelHp(e.target.value)} style={{ flex: 1 }}><option value="todos">HP Visível para Todos</option><option value="mestre">HP Oculto</option></select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: dOculto ? 'rgba(255,0,60,0.1)' : 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', border: `1px solid ${dOculto ? '#ff003c' : '#444'}`, cursor: 'pointer', transition: 'all 0.3s' }}>
                    <input type="checkbox" checked={dOculto} onChange={e => setDOculto(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                    <span style={{ color: dOculto ? '#ff003c' : '#aaa', fontWeight: dOculto ? 'bold' : 'normal' }}>{dOculto ? '👻 TOKEN INVISÍVEL NO MAPA' : '👁️ Token Visível no Mapa'}</span>
                </label>
                <button className="btn-neon btn-red" onClick={injetarDummie} style={{ marginTop: '10px', padding: '10px', fontSize: '1.1em', fontWeight: 'bold' }}>☄️ INVOCAR NO MAPA [0,0]</button>
            </div>
        </div>
    );
}

export function MestreVozSistema() {
    const ctx = useMestreForm();
    if (!ctx) return FALLBACK;
    const { msgSistema, setMsgSistema, enviarAviso } = ctx;

    return (
        <div className="def-box" style={{ borderLeft: '4px solid #ffcc00' }}>
            <h3 style={{ color: '#ffcc00', margin: '0 0 15px 0' }}>⚡ A Voz do Sistema</h3>
            <textarea className="input-neon" placeholder="Escreva uma mensagem global para o ecrã de todos..." value={msgSistema} onChange={e => setMsgSistema(e.target.value)} style={{ width: '100%', minHeight: '80px', borderColor: '#ffcc00', color: '#ffcc00' }} />
            <button className="btn-neon btn-gold" onClick={enviarAviso} style={{ width: '100%', marginTop: '10px' }}>📢 ENVIAR AVISO GLOBAL</button>
        </div>
    );
}

export function MestreForjaNPC() {
    const [npc, setNpc] = useState({
        nome: '', avatar: '', hpMax: 100, manaMax: 50, forca: 1, destreza: 1, inteligencia: 1,
    });
    const [poderes, setPoderes] = useState([]);
    const [formas, setFormas] = useState([]);

    const handleChange = (e) => setNpc(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const adicionarPoder = () => setPoderes([...poderes, { nome: '', descricao: '', dano: '' }]);
    const atualizarPoder = (index, campo, valor) => { const n = [...poderes]; n[index][campo] = valor; setPoderes(n); };
    const removerPoder = (index) => setPoderes(poderes.filter((_, i) => i !== index));

    const adicionarForma = () => setFormas([...formas, { nome: '', avatar: '', hpBonus: 0 }]);
    const atualizarForma = (index, campo, valor) => { const n = [...formas]; n[index][campo] = valor; setFormas(n); };
    const removerForma = (index) => setFormas(formas.filter((_, i) => i !== index));

    const salvarNPC = async () => {
        if (!npc.nome) return alert("A entidade precisa ter um nome!");
        
        const fichaCompleta = { 
            bio: { classe: 'NPC - Ameaça', raca: 'Criatura', mesa: 'npc', afiliacao: 'Sem Clã / Bestas Soltas' }, 
            vida: { atual: Number(npc.hpMax), base: Number(npc.hpMax) },
            mana: { atual: Number(npc.manaMax), base: Number(npc.manaMax) },
            forca: { base: Number(npc.forca) },
            destreza: { base: Number(npc.destreza) },
            inteligencia: { base: Number(npc.inteligencia) },
            avatar: npc.avatar,
            poderes: poderes, 
            formas: formas,   
            isNPC: true, 
            dataCriacao: Date.now() 
        };
        
        try {
            await set(ref(database, `personagens/${npc.nome}`), fichaCompleta);
            alert(`🔥 Ameaça [${npc.nome}] forjada e enviada para o Firebase com sucesso!`);
            
            setNpc({ nome: '', avatar: '', hpMax: 100, manaMax: 50, forca: 1, destreza: 1, inteligencia: 1 });
            setPoderes([]);
            setFormas([]);

        } catch (erro) {
            console.error("Erro ao invocar entidade no Firebase:", erro);
            alert("Erro ao salvar! Verifique o console ou a conexão.");
        }
    };

    return (
        <div className="def-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', borderLeft: '4px solid #aa00ff' }}>
            <div style={{ borderBottom: '2px solid #aa00ff', paddingBottom: '10px' }}>
                <h3 style={{ color: '#aa00ff', margin: 0, textShadow: '0 0 10px #aa00ff' }}>💀 Forja de Entidades (Boss & NPCs Avançados)</h3>
                <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0 0 0' }}>Crie chefões com múltiplas formas, habilidades e atributos completos para usar no sistema.</p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                <h4 style={{ color: '#00ffcc', width: '100%', margin: '0 0 5px 0' }}>1. Identidade e Atributos Básicos</h4>
                <input className="input-neon" name="nome" placeholder="Nome da Entidade" value={npc.nome} onChange={handleChange} style={{ flex: '1 1 200px', padding: '10px', color: '#fff', borderColor: '#555' }} />
                <input className="input-neon" name="avatar" placeholder="URL da Foto do Monstro" value={npc.avatar} onChange={handleChange} style={{ flex: '1 1 200px', padding: '10px', color: '#fff', borderColor: '#555' }} />
                <div style={{ width: '100%', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '80px' }}><label style={{ fontSize: '0.8em', color: '#00ffcc' }}>HP Max</label><input type="number" className="input-neon" name="hpMax" value={npc.hpMax} onChange={handleChange} style={{ width: '100%', padding: '8px', borderColor: '#00ffcc' }} /></div>
                    <div style={{ flex: 1, minWidth: '80px' }}><label style={{ fontSize: '0.8em', color: '#0088ff' }}>Mana Max</label><input type="number" className="input-neon" name="manaMax" value={npc.manaMax} onChange={handleChange} style={{ width: '100%', padding: '8px', borderColor: '#0088ff' }} /></div>
                    <div style={{ flex: 1, minWidth: '60px' }}><label style={{ fontSize: '0.8em', color: '#aaa' }}>FOR</label><input type="number" className="input-neon" name="forca" value={npc.forca} onChange={handleChange} style={{ width: '100%', padding: '8px' }} /></div>
                    <div style={{ flex: 1, minWidth: '60px' }}><label style={{ fontSize: '0.8em', color: '#aaa' }}>DES</label><input type="number" className="input-neon" name="destreza" value={npc.destreza} onChange={handleChange} style={{ width: '100%', padding: '8px' }} /></div>
                    <div style={{ flex: 1, minWidth: '60px' }}><label style={{ fontSize: '0.8em', color: '#aaa' }}>INT</label><input type="number" className="input-neon" name="inteligencia" value={npc.inteligencia} onChange={handleChange} style={{ width: '100%', padding: '8px' }} /></div>
                </div>
            </div>

            <div style={{ background: 'rgba(123, 31, 162, 0.1)', padding: '15px', borderRadius: '8px', border: '1px solid #7b1fa2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h4 style={{ color: '#e040fb', margin: 0 }}>2. Transformações (Fases do Boss)</h4>
                    <button className="btn-neon" onClick={adicionarForma} style={{ padding: '5px 15px', borderColor: '#e040fb', color: '#e040fb', margin: 0 }}>+ Nova Forma</button>
                </div>
                {formas.length === 0 && <span style={{ color: '#555', fontStyle: 'italic', fontSize: '0.85em' }}>Nenhuma transformação cadastrada.</span>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {formas.map((forma, i) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', border: '1px solid #444', flexWrap: 'wrap' }}>
                            <input className="input-neon" placeholder="Nome (Ex: Modo Assalto)" value={forma.nome} onChange={(e) => atualizarForma(i, 'nome', e.target.value)} style={{ flex: '1 1 150px', padding: '8px' }} />
                            <input className="input-neon" placeholder="URL da Imagem" value={forma.avatar} onChange={(e) => atualizarForma(i, 'avatar', e.target.value)} style={{ flex: '1 1 150px', padding: '8px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ color: '#0f0', fontSize: '0.8em' }}>+HP:</span>
                                <input type="number" className="input-neon" value={forma.hpBonus} onChange={(e) => atualizarForma(i, 'hpBonus', e.target.value)} style={{ width: '80px', padding: '8px', borderColor: '#0f0' }} />
                            </div>
                            <button onClick={() => removerForma(i)} style={{ background: 'none', border: 'none', color: '#ff003c', fontSize: '1.2em', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ background: 'rgba(255, 204, 0, 0.1)', padding: '15px', borderRadius: '8px', border: '1px solid #ffcc00' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h4 style={{ color: '#ffcc00', margin: 0 }}>3. Arsenal de Poderes / Ataques</h4>
                    <button className="btn-neon" onClick={adicionarPoder} style={{ padding: '5px 15px', borderColor: '#ffcc00', color: '#ffcc00', margin: 0 }}>+ Novo Ataque</button>
                </div>
                {poderes.length === 0 && <span style={{ color: '#555', fontStyle: 'italic', fontSize: '0.85em' }}>Nenhum ataque cadastrado.</span>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {poderes.map((poder, i) => (
                        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', border: '1px solid #444' }}>
                            <div style={{ display: 'flex', width: '100%', gap: '10px' }}>
                                <input className="input-neon" placeholder="Nome do Ataque/Poder" value={poder.nome} onChange={(e) => atualizarPoder(i, 'nome', e.target.value)} style={{ flex: 2, padding: '8px' }} />
                                <input className="input-neon" placeholder="Dano (Ex: 4d10+5)" value={poder.dano} onChange={(e) => atualizarPoder(i, 'dano', e.target.value)} style={{ flex: 1, padding: '8px', color: '#ff5252' }} />
                                <button onClick={() => removerPoder(i)} style={{ background: 'none', border: 'none', color: '#ff003c', fontSize: '1.2em', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                            </div>
                            <textarea className="input-neon" placeholder="Efeito ou descrição detalhada..." value={poder.descricao} onChange={(e) => atualizarPoder(i, 'descricao', e.target.value)} style={{ width: '100%', padding: '8px', resize: 'vertical', minHeight: '50px' }} />
                        </div>
                    ))}
                </div>
            </div>

            <button className="btn-neon btn-purple" onClick={salvarNPC} style={{ padding: '15px', fontSize: '1.1em', fontWeight: 'bold', marginTop: '10px', borderColor: '#aa00ff', color: '#aa00ff' }}>
                🔥 GUARDAR ENTIDADE NO REGISTRO
            </button>
        </div>
    );
}