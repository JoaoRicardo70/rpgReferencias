import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../stores/useStore';
import { useMapaForm, urlSeguraParaCss, calcularCA } from './MapaFormContext';
import { useAtaqueForm } from '../combate/AtaqueFormContext';
import { usePoderesForm } from '../poderes/PoderesFormContext';
import { useArsenalForm } from '../arsenal/ArsenalFormContext';
import { salvarDummie, salvarFichaSilencioso, salvarCenarioCompleto } from '../../services/firebase-sync';
import { getClassIconById } from '../../core/classIcons';
import { calcularPoderAtual } from '../../core/poder';
import { getVitalMxDisplay } from '../../core/vitals';
import { formatarPoderCosmico } from '../../core/utils';

// 🔥 IMPORTAÇÕES PARA RENDERIZAR O DADO 3D FÍSICO 🔥
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================================================
// 🎲 MOTOR 3D DO DADO D20 (REFATORADO PARA ALTO REALISMO)
// ============================================================================
function DadoFisico3D({ isLanded, cor }) {
    const meshRef = useRef();

    // Gera uma textura procedimental de relevo (Bump Map) para simular microimperfeições,
    // granulação de resina pesada e pequenos arranhões de impacto físico na superfície.
    const bumpTexture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Base cinza neutra (sem alteração de relevo profundo)
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 512, 512);
        
        // Adiciona microgranulação de alta frequência textura de metal/resina áspera
        for (let i = 0; i < 4000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const tomCinza = Math.floor(Math.random() * 30) + 110;
            ctx.fillStyle = `rgb(${tomCinza},${tomCinza},${tomCinza})`;
            ctx.fillRect(x, y, 1, 1);
        }
        
        // Adiciona micro-ranhuras lineares para simular desgaste e marcas de combate
        for (let i = 0; i < 35; i++) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.15})`;
            ctx.lineWidth = Math.random() * 1.5 + 0.5;
            ctx.beginPath();
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
            ctx.stroke();
        }
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }, []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        if (!isLanded) {
            // Rotação tridimensional caótica simétrica durante o voo de arremesso
            meshRef.current.rotation.x += delta * 13;
            meshRef.current.rotation.y += delta * 17;
            meshRef.current.rotation.z += delta * 9;
        } else {
            // Assentamento físico suave e inclinação estética realista ao parar
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0.38, 0.08);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0.48, 0.08);
            meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0.02, 0.08);
        }
    });

    const isCritFatal = cor === '#ff003c';
    const isCritNormal = cor === '#ffcc00';
    const glowIntensity = isCritFatal ? 1.8 : isCritNormal ? 1.0 : 0.3;

    return (
        <group>
            {/* 💡 ESTÚDIO DE ILUMINAÇÃO DE TRÊS PONTOS (MÁXIMO DESTAQUE DE FACETAS) */}
            <ambientLight intensity={0.25} />
            
            {/* Luz Direcional Principal (Key Light) - Cria brilhos intensos e sombras vincadas */}
            <directionalLight position={[12, 20, 10]} intensity={3.8} castShadow />
            
            {/* Luz de Preenchimento (Fill Light) - Suaviza contrastes sem perder o tom sombrio */}
            <directionalLight position={[-12, 6, -6]} intensity={1.5} color="#484d6d" />
            
            {/* Luz de Contra-Borda (Rim Light) - Desenha o contorno do dado contra o cenário de fundo */}
            <directionalLight position={[0, -15, -12]} intensity={2.2} color={cor} />
            
            {/* Ponto de Luz Interno (Núcleo de Energia) - Vazamento luminoso de relíquia pelas fendas */}
            <pointLight position={[0, 0, 0]} intensity={glowIntensity * 4} color={cor} distance={10} />
            
            <mesh ref={meshRef} castShadow receiveShadow>
                {/* Geometria Base do d20 */}
                <icosahedronGeometry args={[2.8, 0]} />
                
                {/* Material Físico Premium (Estilo Aço Balístico / Polímero Obsidiana) */}
                <meshPhysicalMaterial 
                    color="#08080c"                     // Base escura de altíssima absorção de luz
                    emissive={cor}                      // Reação cromática dinâmica baseada no resultado
                    emissiveIntensity={glowIntensity}
                    roughness={0.16}                    // Base altamente polida para refletir focos de luz
                    metalness={0.96}                    // Comportamento estritamente reflexivo e metálico
                    bumpMap={bumpTexture}               // Injeção física de micro-ranhuras e texturas de uso
                    bumpScale={0.012}                   // Relevo sutil perceptível apenas sob luz direta
                    clearcoat={1.0}                     // Camada espessa de verniz vítreo automotivo por cima
                    clearcoatRoughness={0.02}           // Brilho externo espelhado sem imperfeições na resina
                    reflectivity={1.0}
                />
                
                {/* Arestas Volumétricas Sincronizadas - Substitui linhas retas por uma malha de brilho tridimensional */}
                <mesh scale={[1.003, 1.003, 1.003]}>
                    <icosahedronGeometry args={[2.8, 0]} />
                    <meshBasicMaterial 
                        color={cor} 
                        wireframe 
                        transparent 
                        opacity={isCritFatal ? 0.85 : isCritNormal ? 0.6 : 0.35} 
                    />
                </mesh>
            </mesh>
        </group>
    );
}

export function MapaDadoAnimado() {
    const ctx = useMapaForm();
    if (!ctx) return null;
    const { dadoAnim, abaAtiva } = ctx;

    const painelMapa = document.querySelector('.mapa-panel');
    const mapaVisivel = painelMapa && (painelMapa.offsetWidth > 0 || painelMapa.offsetHeight > 0);
    const isAbaMapa = String(abaAtiva || '').toLowerCase().includes('map');

    const [pos, setPos] = useState({ x: -1000, y: -1000 });
    const requestRef = useRef();
    const vel = useRef({ 
        vx: (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 15), 
        vy: (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 15) 
    });

    useEffect(() => {
        if (dadoAnim?.ativo && !dadoAnim.finalResult) {
            let currentX = window.innerWidth / 2;
            let currentY = window.innerHeight / 2;

            const animate = () => {
                currentX += vel.current.vx;
                currentY += vel.current.vy;
                const size = 150; 
                
                if (currentX <= 0 || currentX >= window.innerWidth - size) {
                    vel.current.vx *= -1; 
                    currentX = Math.max(0, Math.min(currentX, window.innerWidth - size));
                }
                if (currentY <= 0 || currentY >= window.innerHeight - size) {
                    vel.current.vy *= -1; 
                    currentY = Math.max(0, Math.min(currentY, window.innerHeight - size));
                }

                setPos({ x: currentX, y: currentY });
                requestRef.current = requestAnimationFrame(animate);
            };
            requestRef.current = requestAnimationFrame(animate);

            return () => cancelAnimationFrame(requestRef.current);
        }
    }, [dadoAnim?.ativo, dadoAnim?.finalResult]);

    if (!dadoAnim?.ativo || (!mapaVisivel && !isAbaMapa)) return null;

    const isLanded = !!dadoAnim.finalResult;

    return createPortal(
        <>
            <style dangerouslySetInnerHTML={{__html: `
                .dado-wrapper {
                    position: fixed;
                    width: 150px;
                    height: 150px;
                    z-index: 999999;
                    pointer-events: none;
                    transition: ${isLanded ? 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none'};
                }
                .dado-landed-text {
                    position: fixed;
                    top: 65%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 999999;
                    animation: zoomInTexto 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                }
                @keyframes zoomInTexto {
                    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                    100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
            `}} />
            
            {isLanded && <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,2,4,0.75)', backdropFilter: 'blur(3px)', zIndex: 999998 }} />}

            <div 
                className="dado-wrapper"
                style={{ 
                    left: isLanded ? '50%' : `${pos.x}px`, 
                    top: isLanded ? '50%' : `${pos.y}px`,
                    transform: isLanded ? 'translate(-50%, -50%) scale(1.65)' : 'none',
                    filter: `drop-shadow(0 0 ${isLanded ? '50px' : '20px'} ${dadoAnim.cor})`
                }}
            >
                <Canvas camera={{ position: [0, 0, 8], fov: 50 }} style={{ width: '100%', height: '100%' }}>
                    <DadoFisico3D isLanded={isLanded} cor={dadoAnim.cor} />
                </Canvas>
                
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    color: '#fff', fontSize: '46px', fontWeight: '900', fontFamily: 'sans-serif',
                    textShadow: `0 0 12px ${dadoAnim.cor}, 2px 2px 0 #000, -2px -2px 0 #000`,
                    pointerEvents: 'none', zIndex: 10
                }}>
                    {dadoAnim.numero}
                </div>
            </div>

            {isLanded && (
                <div className="dado-landed-text" style={{ color: dadoAnim.cor, fontSize: '3em', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '3px', textShadow: `0 0 30px ${dadoAnim.cor}` }}>
                    {dadoAnim.cor === '#ff003c' ? 'CRÍTICO FATAL!' : dadoAnim.cor === '#ffcc00' ? 'CRÍTICO!' : dadoAnim.cor === '#660000' ? 'FALHA CRÍTICA' : 'ROLADO!'}
                </div>
            )}
        </>,
        document.body
    );
}

// ============================================================================
// O RESTO DO MÓDULO DE COMBATE
// ============================================================================
export function MapaEconomiaAcoes() {
    const ctx = useMapaForm();
    if (!ctx) return null;
    const { minhaFicha, meuNome, isMestre, jogadorHistory, dummies, personagens, toggleActionDot, jogadorDaVez } = ctx;

    let targetEntidade = { tipo: 'player', nome: meuNome, id: meuNome, data: minhaFicha };

    if (isMestre) {
        if (jogadorHistory) {
            const foundDummie = Object.entries(dummies || {}).find(([k,v]) => v.nome === jogadorHistory || k === jogadorHistory);
            if (foundDummie) targetEntidade = { tipo: 'dummie', nome: foundDummie[1].nome, id: foundDummie[0], data: foundDummie[1] };
            else if (personagens[jogadorHistory]) targetEntidade = { tipo: 'player', nome: jogadorHistory, id: jogadorHistory, data: personagens[jogadorHistory] };
        } else if (jogadorDaVez) {
            targetEntidade = { tipo: jogadorDaVez.isDummie ? 'dummie' : 'player', nome: jogadorDaVez.nome, id: jogadorDaVez.id || jogadorDaVez.nome, data: jogadorDaVez.ficha };
        }
    }

    const acoes = targetEntidade.data?.acoes || { padrao: {max:1, atual:1}, bonus: {max:1, atual:1}, reacao: {max:1, atual:1} };
    const canEdit = targetEntidade.nome === meuNome || (isMestre && targetEntidade.tipo === 'dummie');

    const renderDots = (tipo, label, color) => {
        const max = acoes[tipo]?.max || 1;
        const atual = acoes[tipo]?.atual || 0;
        const dots = [];
        for (let i = 0; i < max; i++) {
            const isAvail = i < atual;
            dots.push(
                <div key={i} onClick={() => canEdit && toggleActionDot(tipo, isAvail, targetEntidade.nome, targetEntidade.tipo === 'dummie', targetEntidade.id)}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: isAvail ? color : 'transparent', border: `2px solid ${color}`, cursor: canEdit ? 'pointer' : 'default', boxShadow: isAvail ? `0 0 8px ${color}` : 'none', opacity: isAvail ? 1 : 0.3 }}
                />
            );
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: '0.65em', color: color, fontWeight: 'bold', textTransform: 'uppercase' }}>{label}</span>
                <div style={{ display: 'flex', gap: 4 }}>{dots}</div>
            </div>
        );
    };

    return (
        <div style={{ marginTop: 15, padding: '10px 15px', background: 'rgba(0,0,0,0.6)', border: '1px solid #333', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#fff', fontSize: '0.85em', fontWeight: 'bold' }}>⚡ Ações de: <span style={{ color: '#00ffcc' }}>{targetEntidade.nome}</span>{!canEdit && <span style={{ fontSize: '0.7em', color: '#888', marginLeft: 8 }}>(Apenas Visão)</span>}</span>
                {canEdit && (
                    <button onClick={() => {
                        if (targetEntidade.tipo === 'dummie') {
                            const dData = dummies[targetEntidade.id];
                            if(dData) {
                                const nAcoes = dData.acoes ? JSON.parse(JSON.stringify(dData.acoes)) : { padrao: {max:1, atual:1}, bonus: {max:1, atual:1}, reacao: {max:1, atual:1} };
                                if (nAcoes.padrao) nAcoes.padrao.atual = nAcoes.padrao.max;
                                if (nAcoes.bonus) nAcoes.bonus.atual = nAcoes.bonus.max;
                                if (nAcoes.reacao) nAcoes.reacao.atual = nAcoes.reacao.max;
                                salvarDummie(targetEntidade.id, { ...dData, acoes: nAcoes });
                            }
                        } else {
                            ctx.updateFicha(f => {
                                if (!f.acoes) f.acoes = { padrao: {max:1, atual:1}, bonus: {max:1, atual:1}, reacao: {max:1, atual:1} };
                                if (f.acoes.padrao) f.acoes.padrao.atual = f.acoes.padrao.max;
                                if (f.acoes.bonus) f.acoes.bonus.atual = f.acoes.bonus.max;
                                if (f.acoes.reacao) f.acoes.reacao.atual = f.acoes.reacao.max;
                            });
                            salvarFichaSilencioso();
                        }
                    }} style={{ background: 'none', border: '1px solid #555', color: '#aaa', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: '0.8em' }}>↻ Resetar</button>
                )}
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
                {renderDots('padrao', 'Ação', '#00ffcc')}
                {renderDots('bonus', 'Bônus', '#ffcc00')}
                {renderDots('reacao', 'Reação', '#ff00ff')}
            </div>
        </div>
    );
}

export function MapaIniciativaTracker() {
    const ctx = useMapaForm();
    if (!ctx) return null;
    
    const {
        minhaFicha, iniciativaInput, setIniciativaInput, isMestre, sairDoCombate, encerrarCombate, descansar,
        setMinhaIniciativa, avancarTurno, ordemIniciativa, turnoAtualIndex, jogadorHistory,
        setJogadorHistory, feedCombate, getAvatarInfo, fmt, jogadorDaVez, infoDaVez, cenario,
        jogadores, dummies, cenaRenderId
    } = ctx;

    const todasEntidades = useMemo(() => {
        // Jogador pode ter a posição no sistema novo (posicoes[cenaId]) ou no antigo (posicao.cenaId) —
        // mesma lógica de tokenMap/ordemIniciativa em MapaFormContext, senão ele "vaza" para toda cena
        // que caia no fallback 'default'.
        const estaNaCena = (f) => {
            const pos = f.posicoes ? f.posicoes[cenaRenderId] : null;
            if (pos) return true;
            return !!(f.posicao && (f.posicao.cenaId || 'default') === cenaRenderId);
        };
        const js = Object.entries(jogadores || {}).filter(([n, f]) => estaNaCena(f)).map(([n, f]) => ({ id: n, nome: n, ficha: f, isDummie: false, init: f.iniciativa || 0 }));
        const ds = Object.entries(dummies || {}).filter(([id, d]) => (d.cenaId || 'default') === cenaRenderId).map(([id, d]) => ({ id, nome: d.nome, ficha: d, isDummie: true, init: d.iniciativa || 0 }));
        return [...js, ...ds].sort((a, b) => b.init - a.init);
    }, [jogadores, dummies, cenaRenderId]);

    const toggleVisibilidadeToken = (e, idOuNome) => {
        e.stopPropagation();
        const novoCenario = JSON.parse(JSON.stringify(cenario || {}));
        if (!novoCenario.tokensOcultos) novoCenario.tokensOcultos = [];
        if (novoCenario.tokensOcultos.includes(idOuNome)) {
            novoCenario.tokensOcultos = novoCenario.tokensOcultos.filter(t => t !== idOuNome);
        } else {
            novoCenario.tokensOcultos.push(idOuNome);
        }
        salvarCenarioCompleto(novoCenario);
    };

    return (
        <div className="def-box" style={{ marginTop: 15, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <h3 style={{ color: '#00ffcc', margin: 0, fontSize: '1.1em' }}>⚡ Iniciativa & Entidades</h3>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <input className="input-neon" type="number" value={iniciativaInput} onChange={e => setIniciativaInput(e.target.value)} style={{ width: 50, padding: 4, height: 26, margin: 0 }} />
                        <button className="btn-neon btn-gold" onClick={setMinhaIniciativa} style={{ padding: '2px 8px', fontSize: '0.8em', margin: 0 }}>Rolar</button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn-neon" onClick={avancarTurno} style={{ borderColor: '#00ffcc', color: '#00ffcc', padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>Passar Turno</button>
                    {/* 💖 Só aparece FORA de combate (iniciativa zerada) — senão daria pra zerar a
                        Fadiga acumulada a qualquer momento no meio da luta, esvaziando o sentido do
                        desgaste progressivo. "Sair" primeiro (iniciativa=0), depois "Descansar". */}
                    {!(minhaFicha?.iniciativa > 0) && <button className="btn-neon btn-green" onClick={descansar} title="Recupera toda a Vida/Energias e zera a Fadiga e o mUnico Crescente acumulados" style={{ padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>💖 Descansar</button>}
                    {minhaFicha?.iniciativa > 0 && <button className="btn-neon btn-red" onClick={sairDoCombate} style={{ padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>Sair</button>}
                    {isMestre && <button className="btn-neon" onClick={encerrarCombate} style={{ borderColor: '#ff003c', color: '#ff003c', padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>Zerar</button>}
                </div>
            </div>

            <div id="lista-turnos" style={{ display: 'flex', gap: 8, marginTop: 15, overflowX: 'auto', paddingBottom: 5, minHeight: 50 }}>
                {todasEntidades.length === 0 ? <p style={{ color: '#888', fontSize: '0.8em', margin: 0 }}>Nenhuma entidade no mapa.</p> : (
                    todasEntidades.map((entidade) => {
                        const isOculto = cenario?.tokensOcultos?.includes(entidade.id);
                        if (!isMestre && isOculto) return null;

                        const info = getAvatarInfo(entidade.ficha);
                        const isRolled = entidade.init > 0;
                        const isActive = isRolled && (ordemIniciativa || []).length > 0 && (ordemIniciativa[turnoAtualIndex % ordemIniciativa.length]?.nome === entidade.nome);
                        return (
                            <div key={entidade.id} style={{ position: 'relative' }}>
                                <div onClick={() => setJogadorHistory(entidade.nome)} style={{ 
                                    cursor: 'pointer', minWidth: 40, height: 40, borderRadius: '50%', 
                                    border: isActive ? '3px solid #00ffcc' : (isRolled ? '2px solid #aaa' : '2px dashed #444'), 
                                    opacity: isActive ? 1 : (isOculto ? 0.3 : (isRolled ? 0.8 : 0.5)), 
                                    backgroundImage: urlSeguraParaCss(info.img) || 'none', backgroundSize: 'cover', backgroundPosition: 'top center', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.7em', color: 'white', textShadow: '1px 1px 2px black' 
                                }}>{!info.img && entidade.nome.charAt(0)}</div>
                                {isMestre && <button onClick={(e) => toggleVisibilidadeToken(e, dynamicTokenId => toggleVisibilidadeToken(e, entidade.id))} style={{ position: 'absolute', top: -5, right: -5, background: isOculto ? '#ff003c' : '#000', borderRadius: '50%', padding: '2px 4px', fontSize: '10px', cursor: 'pointer', border: '1px solid #fff' }}>{isOculto ? '👻' : '👁️'}</button>}
                            </div>
                        );
                    })
                )}
            </div>

            <MapaEconomiaAcoes />

            {jogadorHistory && (
                <div style={{ marginTop: 15, padding: 15, background: 'rgba(0, 20, 40, 0.8)', border: '1px solid #0088ff', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <h4 style={{ margin: 0, color: '#0088ff' }}>Histórico: {jogadorHistory}</h4>
                        <button className="btn-neon btn-red" onClick={() => setJogadorHistory(null)} style={{ padding: '2px 8px', fontSize: '0.8em', margin: 0 }}>X</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                        {(feedCombate || []).filter(f => f.nome === jogadorHistory).slice(-6).reverse().map((h, i) => (
                            <div key={i} style={{ fontSize: '0.85em', color: '#ccc', background: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 5, borderLeft: `3px solid ${h.tipo === 'dano' ? '#ff003c' : '#f90'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><strong style={{ color: h.tipo === 'dano' ? '#ff003c' : h.tipo === 'acerto' ? '#f90' : '#0088ff', textTransform: 'uppercase' }}>[{h.tipo}]</strong>{h.acertoTotal && <strong style={{ color: '#fff' }}>Total: {fmt(h.acertoTotal)}</strong>}{h.dano && <strong style={{ color: '#fff' }}>Dano: {fmt(h.dano)}</strong>}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {jogadorDaVez && (
                <div style={{ marginTop: 15, display: 'flex', gap: 15, alignItems: 'center' }}>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', border: '3px solid #00ffcc', backgroundImage: urlSeguraParaCss(infoDaVez?.img) || 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5em', fontWeight: 'bold', color: '#fff' }}>{(!infoDaVez || !infoDaVez.img) && jogadorDaVez.nome.charAt(0)}</div>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1em' }}>{jogadorDaVez.nome}</div>
                        {infoDaVez?.forma && <div style={{ color: '#00ffcc', fontSize: '0.8em' }}>{infoDaVez.forma}</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

export function MapaRolagemRapida() {
    const ctx = useMapaForm();
    if (!ctx) return null;
    const { mapStat, setMapStat, mapQD, setMapQD, mapFD, setMapFD, mapBonus, setMapBonus, mapVantagens, changeVantagem, mapDesvantagens, changeDesvantagem, mapUsarProf, setMapUsarProf, rolarAcertoRapido } = ctx;

    return (
        <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap', border: '1px solid #f90' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h4 style={{ color: '#f90', margin: 0 }}>🎯 Ação Rápida</h4>
                <select className="input-neon" value={mapStat} onChange={e => setMapStat(e.target.value)} style={{ padding: '2px 4px', width: 90, height: 26, margin: 0 }}>
                    <option value="forca">Força</option><option value="destreza">Des</option><option value="inteligencia">Int</option><option value="sabedoria">Sab</option>
                    <option value="energiaEsp">Aura</option><option value="carisma">Car</option><option value="stamina">Sta</option><option value="constituicao">Con</option>
                </select>
                <input className="input-neon" type="number" value={mapQD} onChange={e => setMapQD(e.target.value)} style={{ width: 40, padding: 2, height: 26, margin: 0 }} /> <span style={{ color: '#aaa', fontWeight: 'bold' }}>D</span>
                <input className="input-neon" type="number" value={mapFD} onChange={e => setMapFD(e.target.value)} style={{ width: 45, padding: 2, height: 26, margin: 0 }} /> <span style={{ color: '#aaa', fontWeight: 'bold' }}>+</span>
                <input className="input-neon" type="number" value={mapBonus} onChange={e => setMapBonus(e.target.value)} style={{ width: 45, padding: 2, height: 26, margin: 0 }} />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: '1px solid #444', paddingLeft: 15 }}>
                <span style={{ color: '#0f0', fontWeight: 'bold', fontSize: '0.85em' }}>V:</span>
                <input className="input-neon" type="number" min="0" value={mapVantagens} onChange={changeVantagem} style={{ width: 40, padding: 2, height: 26, margin: 0, borderColor: '#0f0', color: '#0f0' }} />
                <span style={{ color: '#f00', fontWeight: 'bold', fontSize: '0.85em' }}>D:</span>
                <input className="input-neon" type="number" min="0" value={mapDesvantagens} onChange={changeDesvantagem} style={{ width: 40, padding: 2, height: 26, margin: 0, borderColor: '#f00', color: '#f00' }} />
                <label style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 5 }}><input type="checkbox" checked={mapUsarProf} onChange={e => setMapUsarProf(e.target.checked)} /> Prof</label>
            </div>

            <div style={{ flex: 1, textAlign: 'right' }}>
                <button className="btn-neon btn-gold" onClick={rolarAcertoRapido} style={{ margin: 0, padding: '4px 15px' }}>🎲 ROLAR</button>
            </div>
        </div>
    );
}

// 🔥 Acesso rápido, direto do Mapa, aos "Ataques Salvos" (ficha.ataqueConfig.formulasSalvas —
// mesmas fórmulas de Modo Deus salvas na aba Ataque, ver AtaqueSubComponents.jsx >
// AtaqueDanoCustomizado) — antes o jogador precisava sair do Mapa e ir pra aba Ataque só pra rolar
// uma fórmula que já tinha salvo. Reusa a MESMA rolarDanoCustomizado (AtaqueFormContext.jsx) —
// mesmo cálculo de dado/dano/consumo de energia e mesmo feed de combate — contra o `alvoSelecionado`
// atual (estado global compartilhado com o clique-pra-mirar dos tokens da própria grelha do Mapa,
// ver components/combat/DummieToken.jsx), então não existe uma segunda lógica de dano duplicada
// aqui. Precisa do seu próprio <AtaqueFormProvider> (ver MapaPanel.jsx) — é um provider TOTALMENTE
// à parte da instância que já vive (sempre montada) na aba Ataque, cada um com seu próprio estado
// local (o texto digitado no Modo Deus etc.); não há nada compartilhado entre as duas instâncias
// além do que já vem do Zustand (minhaFicha, alvoSelecionado).
export function MapaAtaquesSalvos() {
    const ataqueCtx = useAtaqueForm();
    if (!ataqueCtx) return null;
    const { minhaFicha, rolarDanoCustomizado, dummieAlvo } = ataqueCtx;
    const formulasSalvas = minhaFicha?.ataqueConfig?.formulasSalvas || [];

    return (
        <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #ff00ff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h4 style={{ color: '#ff00ff', margin: 0 }}>⚔️ Meus Ataques Salvos</h4>
                <span style={{ color: dummieAlvo ? '#0f0' : '#888', fontSize: '0.8em', fontStyle: 'italic' }}>
                    {dummieAlvo ? `🎯 Alvo: ${dummieAlvo.nome}` : 'Nenhum alvo selecionado'}
                </span>
            </div>

            {formulasSalvas.length === 0 ? (
                <p style={{ color: '#888', fontSize: '0.8em', margin: '8px 0 0 0' }}>
                    Nenhum ataque salvo ainda. Vá na aba <strong>Ataque</strong> → Modo Deus, monte sua fórmula e clique em 💾 pra poder disparar ela direto por aqui.
                </p>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {formulasSalvas.map(f => (
                        <button
                            key={f.id}
                            className="btn-neon"
                            onClick={() => rolarDanoCustomizado(f.formula, f.letalidade, f.energiaTipo, f.energiaCusto)}
                            title={`Fórmula: ${f.formula} | Letalidade: +${f.letalidade || 0}${f.energiaTipo && f.energiaTipo !== 'nenhum' && f.energiaCusto ? ` | Custo: ${f.energiaCusto}% ${f.energiaTipo}` : ''}`}
                            style={{ margin: 0, padding: '6px 14px', background: 'rgba(255,0,255,0.15)', borderColor: '#ff00ff', color: '#ff00ff', fontWeight: 'bold' }}
                        >
                            ▶ {f.nome}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// 🔥 Ataque com a Arma equipada, direto do Mapa — reusa o MESMO rolarDano (AtaqueFormContext.jsx)
// e a MESMA trava de Acerto (podeRolarDano/ignorarTravaAcerto) que o botão "ATACAR"/"ROLAR DANO"
// da aba Ataque já usa (ver AtaqueSubComponents.jsx > AtaqueBotoesAcao), inclusive o mesmo
// requisito de ter Acertado o alvo primeiro na aba Acerto (ou marcar "Ignorar Trava"). Não é uma
// segunda regra de combate — é o MESMO botão, só que sem precisar sair do Mapa pra clicar nele.
//
// 🗡️ Troca rápida de arma: o sistema só permite UMA arma equipada por vez (equipar uma desequipa
// a outra automaticamente, ver ArsenalFormContext.jsx > toggleEquiparItem — não existe "dual
// wielding"), então "múltiplas Armas Salvas" na prática significa poder TROCAR de arma rápido sem
// sair do Mapa pra ir na aba Arsenal. Lista todas as armas do inventário; clicar numa equipa ela
// (reusa o MESMO toggleEquiparItem do Arsenal, incluindo o recálculo de vitais que ele já faz) —
// a arma equipada aparece destacada e é a que o ATACAR/ROLAR DANO acima já usa.
export function MapaAtaqueArma() {
    const ataqueCtx = useAtaqueForm();
    const arsenalCtx = useArsenalForm();
    if (!ataqueCtx) return null;
    const { armaEquipada, podeRolarDano, ignorarTravaAcerto, setIgnorarTravaAcerto, rolarDano, dummieAlvo, minhaFicha } = ataqueCtx;
    const podeAtacar = podeRolarDano || ignorarTravaAcerto;
    const armas = (minhaFicha?.inventario || []).filter(i => i.tipo === 'arma');

    return (
        <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #f90' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <h4 style={{ color: '#f90', margin: 0 }}>🗡️ Ataque com Arma</h4>
                <label style={{ color: '#aaa', fontSize: '0.75em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }} title="Use pra Saving Throws ou ataques em Área, que não passam pela trava normal de Acerto">
                    <input type="checkbox" checked={ignorarTravaAcerto} onChange={e => setIgnorarTravaAcerto(e.target.checked)} />
                    Ignorar Trava de Acerto (P/ Saving Throws ou Área)
                </label>
            </div>

            {arsenalCtx && armas.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
                    {armas.map(arma => (
                        <button
                            key={arma.id}
                            className="btn-neon"
                            onClick={() => { if (!arma.equipado) arsenalCtx.toggleEquiparItem(arma.id); }}
                            title={arma.equipado ? 'Arma equipada atualmente' : 'Clique pra equipar (desequipa a arma atual)'}
                            style={{
                                margin: 0, padding: '4px 12px', fontSize: '0.85em', fontWeight: 'bold', borderColor: '#f90',
                                background: arma.equipado ? 'rgba(255,153,0,0.3)' : 'transparent',
                                color: arma.equipado ? '#fff' : '#f90',
                            }}
                        >
                            {arma.equipado ? '🗡️' : '⚪'} {arma.nome || 'Sem nome'}
                        </button>
                    ))}
                </div>
            )}

            <p style={{ color: '#888', fontSize: '0.8em', margin: '4px 0 8px 0' }}>
                {armaEquipada ? `Arma equipada: ${armaEquipada.nome}` : 'Nenhuma arma equipada — role assim mesmo com a config de dano atual da aba Ataque.'}
            </p>
            <button
                className={`btn-neon ${podeAtacar ? 'btn-red' : ''}`}
                onClick={rolarDano}
                disabled={!podeAtacar}
                style={{ width: '100%', margin: 0, opacity: podeAtacar ? 1 : 0.5 }}
            >
                {dummieAlvo ? (podeAtacar ? `⚔️ ATACAR ${dummieAlvo.nome.toUpperCase()}` : 'ACERTO NECESSÁRIO PRIMEIRO') : '⚔️ ROLAR DANO'}
            </button>
            {!podeAtacar && (
                <p style={{ color: '#f90', fontSize: '0.75em', margin: '4px 0 0 0', fontStyle: 'italic' }}>
                    Role um Acerto contra este alvo na aba Acerto primeiro, ou marque "Ignorar Trava" acima.
                </p>
            )}
        </div>
    );
}

const MAPA_TECNICAS_CATEGORIAS = {
    forma: { label: '🎭 Formas', cor: '#aa00ff' },
    habilidade: { label: '🗡️ Habilidades', cor: '#ff8800' },
    poder: { label: '✨ Poderes', cor: '#00ffcc' },
};
const MAPA_TECNICAS_SEM_PASTA = 'Sem Pasta';

// 🔥 Ativa/desativa Poderes/Formas/Habilidades criadas no Grimório direto do Mapa, sem precisar
// sair do combate — reusa o MESMO togglePoder (PoderesFormContext.jsx) que a aba Poderes/Grimório
// usa (mesmo p.ativa, mesmo recálculo de vitais ao ligar/desligar uma Forma). Não dispara dano
// sozinha (o Poder/Forma entra na conta do rolarDano/Modo Deus normalmente, do jeito que já
// funciona hoje) — é só o interruptor rápido pra ligar a técnica ANTES de atacar.
//
// 🗂️ Organização: agrupa primeiro por CATEGORIA (Formas/Habilidades/Poderes — as 3 abas do
// Grimório) e, dentro de cada uma, por PASTA (p.pasta, mesmo campo que a aba Poderes usa — ver
// PoderesFormContext.jsx). Formas sempre agrupam por pasta (mesmo comportamento de sempre na aba
// Poderes); Habilidades/Poderes só agrupam se algum item da categoria já tiver uma pasta
// atribuída, senão ficam em lista simples — pedido do usuário pra organizar a lista longa de
// técnicas que aparecia toda achatada no Mapa.
export function MapaTecnicasRapidas() {
    const poderesCtx = usePoderesForm();
    const [pastasFechadas, setPastasFechadas] = useState({});
    if (!poderesCtx) return null;
    const { minhaFicha, togglePoder } = poderesCtx;
    const poderes = minhaFicha?.poderes || [];
    const toggleFechada = (chave) => setPastasFechadas(prev => ({ ...prev, [chave]: !prev[chave] }));

    if (poderes.length === 0) {
        return (
            <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #aa00ff' }}>
                <h4 style={{ color: '#aa00ff', margin: 0 }}>📖 Minhas Técnicas (Grimório)</h4>
                <p style={{ color: '#888', fontSize: '0.8em', margin: '8px 0 0 0' }}>
                    Nenhuma técnica criada ainda. Vá no <strong>Grimório</strong> (Livro dos Poderes) pra criar Poderes/Formas/Habilidades e ativá-las direto por aqui.
                </p>
            </div>
        );
    }

    const renderChip = (p) => (
        <button
            key={p.id}
            className="btn-neon"
            onClick={() => togglePoder(p.id)}
            title={p.descricao || ''}
            style={{
                margin: 0, padding: '6px 14px', fontWeight: 'bold', borderColor: '#aa00ff',
                background: p.ativa ? 'rgba(170,0,255,0.3)' : 'transparent',
                color: p.ativa ? '#fff' : '#aa00ff',
            }}
        >
            {p.ativa ? '★' : '☆'} {p.nome || 'Sem nome'}
        </button>
    );

    return (
        <div className="def-box" style={{ marginTop: 15, padding: '8px 12px', border: '1px solid #aa00ff' }}>
            <h4 style={{ color: '#aa00ff', margin: '0 0 8px 0' }}>📖 Minhas Técnicas (Grimório)</h4>
            {Object.keys(MAPA_TECNICAS_CATEGORIAS).map(cat => {
                const itensCat = poderes.filter(p => p && ((p.categoria || 'poder').toLowerCase() === cat));
                if (itensCat.length === 0) return null;
                const info = MAPA_TECNICAS_CATEGORIAS[cat];

                let grupos = null;
                if (cat === 'forma' || itensCat.some(p => (p.pasta || '').trim())) {
                    const mapa = {};
                    itensCat.forEach(p => {
                        const nome = (p.pasta || '').trim() || MAPA_TECNICAS_SEM_PASTA;
                        if (!mapa[nome]) mapa[nome] = [];
                        mapa[nome].push(p);
                    });
                    const nomes = Object.keys(mapa).filter(n => n !== MAPA_TECNICAS_SEM_PASTA).sort((a, b) => a.localeCompare(b, 'pt-BR'));
                    if (mapa[MAPA_TECNICAS_SEM_PASTA]) nomes.push(MAPA_TECNICAS_SEM_PASTA);
                    grupos = nomes.map(nome => ({ nome, itens: mapa[nome] }));
                }

                return (
                    <div key={cat} style={{ marginTop: 10 }}>
                        <div style={{ color: info.cor, fontWeight: 'bold', fontSize: '0.85em', marginBottom: 6, borderBottom: `1px dashed ${info.cor}`, paddingBottom: 4 }}>
                            {info.label}
                        </div>
                        {grupos ? grupos.map(({ nome, itens }) => {
                            const chave = `${cat}::${nome}`;
                            const fechada = !!pastasFechadas[chave];
                            return (
                                <div key={nome} style={{ marginBottom: 8 }}>
                                    <button
                                        onClick={() => toggleFechada(chave)}
                                        style={{ background: 'none', border: 'none', color: info.cor, fontWeight: 'bold', fontSize: '0.8em', padding: '2px 0', cursor: 'pointer' }}
                                    >
                                        {fechada ? '▶' : '▼'} 📁 {nome} <span style={{ opacity: 0.6, fontWeight: 'normal' }}>({itens.length})</span>
                                    </button>
                                    {!fechada && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                                            {itens.map(renderChip)}
                                        </div>
                                    )}
                                </div>
                            );
                        }) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {itensCat.map(renderChip)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// 🔥 Barrinha de vida/energia da moldura de combate — desenha o quão cheio "atual" está em
// relação ao teto EXIBIDO do vital (getVitalMxDisplay, core/vitals.js — a mesma "única fonte de
// verdade" que a própria Ficha Definitiva e a Regeneração automática já usam). O número de
// Máximo em si não é mostrado ao lado do Atual (só a barra) por pedido explícito do usuário —
// mostrar os dois juntos gerava confusão. Pra HP (perigo=true) a cor muda pra amarelo/vermelho
// conforme a vida cai, já que é o recurso que mais importa saber "quão perto da morte" está.
//
// ⚠️ Residual conhecido: a Ficha Definitiva (Ficha Def/Marcados.jsx > handleRegenerarTudo/
// LinhaVital) aplica, por cima do teto de cada vital, um fator extra de Ascensão específico
// daquele vital (fatoresVitaisAtual/calcularFatorCategoria) — um bônus praticamente sempre >1
// pra qualquer personagem com pontos de Ascensão naquele vital, não um caso raro. Esse fator
// NÃO existe em getVitalMxDisplay, então pra um personagem já beneficiado por ele, "atual"
// (gravado pela Ficha JÁ com o fator) ainda pode legitimamente exceder o teto calculado aqui —
// a barra fica clampada em 100% (não estoura visualmente), mas o threshold de cor "perigo"
// (<=20%/<=50%) usa um denominador um pouco menor do que o real pra esses personagens. Replicar
// esse fator aqui foi tentado e revertido nesta mesma investigação por quebrar 11 testes já
// validados de core/vitals.js (o fator afeta a fonte única de verdade usada por drenos/clamps
// no app inteiro, não só esta exibição) — ver histórico do commit para detalhes.
function BarraVital({ atual, maximo, cor, perigo = false }) {
    const atualSeguro = Number(atual) || 0;
    const maximoSeguro = Number(maximo) || 0;
    const pct = maximoSeguro > 0 ? Math.max(0, Math.min(100, (atualSeguro / maximoSeguro) * 100)) : (atualSeguro > 0 ? 100 : 0);
    let corBarra = cor;
    if (perigo) { if (pct <= 20) corBarra = '#ff3030'; else if (pct <= 50) corBarra = '#ffcc00'; }
    return (
        <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 3 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: corBarra, borderRadius: 3, transition: 'width 0.6s ease, background 0.3s ease', boxShadow: `0 0 6px ${corBarra}` }} />
        </div>
    );
}

export function MapaHologramaAcao() {
    const ctx = useMapaForm();
    const divisorPoderMesa = useStore(s => s.divisorPoderMesa);
    if (!ctx) return null;
    const { ordemIniciativa, feedCombate, feedIndexTurnoAtual, jogadorDaVez, jogadores, overridesCompendio, getAvatarInfo, fmt, meuNome, minhaFicha } = ctx;

    const feedSeguro = feedCombate || [];
    const ordemSegura = ordemIniciativa || [];
    const emCombate = ordemSegura.length > 0;

    const acaoNovaNoTurno = feedSeguro.length > feedIndexTurnoAtual ? feedSeguro[feedSeguro.length - 1] : null;
    const acaoGeralForaDeCombate = feedSeguro.length > 0 ? feedSeguro[feedSeguro.length - 1] : null;
    const acaoExibir = emCombate ? acaoNovaNoTurno : acaoGeralForaDeCombate;

    if (!emCombate && !acaoExibir) {
        return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontStyle: 'italic', border: '2px dashed #333', borderRadius: 8 }}>O campo de batalha aguarda...</div>;
    }

    let nomeBase = jogadorDaVez ? jogadorDaVez.nome : (acaoExibir ? acaoExibir.nome : '');
    let fichaBase = jogadorDaVez ? jogadorDaVez.ficha : (acaoExibir ? jogadores[acaoExibir.nome] : null);
    let infoBase = getAvatarInfo(fichaBase);

    // 🔥 Poder Atual (o mesmo número do Scouter na ficha), pra saber a força do alvo sem sair do mapa
    // Nota: sem useMemo de propósito — este ponto do componente já vem depois de dois `return`
    // condicionais acima, então um hook aqui violaria a Regra dos Hooks (nº de hooks variável entre renders).
    const poderAtualBase = fichaBase ? calcularPoderAtual(fichaBase, divisorPoderMesa).poderGlobal : 0;

    // 🔥 Teto EXIBIDO de cada vital pras barrinhas de recurso — getVitalMxDisplay (core/vitals.js)
    // é a mesma "única fonte de verdade" que a própria Ficha Definitiva usa pra mostrar o Máximo
    // na tela de Status e que a Regeneração automática de turno usa como teto. Usar aqui o
    // getMaximo() bruto (sem a escala de notação nem o fator de Ascensão por vital) fazia a barra
    // comparar "atual" (guardado já nessa escala/fator) contra um teto em outra unidade — o mesmo
    // vazamento de escala já documentado no topo de core/vitals.js.
    const vidaMaxima = fichaBase ? getVitalMxDisplay('vida', fichaBase) : 0;
    const manaMaxima = fichaBase ? getVitalMxDisplay('mana', fichaBase) : 0;
    const auraMaxima = fichaBase ? getVitalMxDisplay('aura', fichaBase) : 0;
    const chakraMaximo = fichaBase ? getVitalMxDisplay('chakra', fichaBase) : 0;
    const corpoMaximo = fichaBase ? getVitalMxDisplay('corpo', fichaBase) : 0;

    let classId = fichaBase?.bio?.classe;
    if ((classId === 'pretender' || classId === 'alterego') && fichaBase?.bio?.subClasse) classId = fichaBase?.bio?.subClasse;
    let mesaBase = fichaBase?.bio?.mesa || 'presente';
    
    const isGrand = classId && overridesCompendio?.grands?.[`${classId}_${mesaBase}`] === nomeBase;
    const listaCands = overridesCompendio?.grands?.[`${classId}_${mesaBase}_candidatos`] || [];
    const isCandidato = classId && !isGrand && listaCands.includes(nomeBase);
    const grandIconUrl = overridesCompendio?.grands?.[`${classId}_${mesaBase}_icone`];
    const customClassIcon = classId ? overridesCompendio?.classes?.[classId]?.iconeUrl : null;
    const defaultClassSymbol = getClassIconById(classId);

    let isCritNormal = false, isCritFatal = false, isFalha = false;
    if (acaoExibir && acaoExibir.rolagem && (acaoExibir.tipo === 'acerto' || acaoExibir.tipo === 'dano')) {
        let maxDado = 0;
        let regexStrong = /<strong>(\d+)<\/strong>/g;
        let match;
        while ((match = regexStrong.exec(acaoExibir.rolagem)) !== null) {
            let v = parseInt(match[1]);
            if (v > maxDado) maxDado = v;
        }
        if (maxDado === 0) {
            let regexArr = /\[(.*?)\]/;
            let mArr = regexArr.exec(acaoExibir.rolagem);
            if (mArr) {
                let clean = mArr[1].replace(/<[^>]*>?/gm, ''); 
                let nums = clean.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
                if (nums.length > 0) maxDado = Math.max(...nums);
            }
        }
        const acCfg = fichaBase?.ataqueConfig || minhaFicha?.ataqueConfig || {};
        const cNMin = acCfg.criticoNormalMin || 16, cNMax = acCfg.criticoNormalMax || 18;
        const cFMin = acCfg.criticoFatalMin || 19, cFMax = acCfg.criticoFatalMax || 20;
        
        if (maxDado >= cFMin && maxDado <= cFMax) isCritFatal = true;
        else if (maxDado >= cNMin && maxDado <= cNMax) isCritNormal = true;
        else if (maxDado === 1) isFalha = true;

        if (acaoExibir.tipo === 'dano') {
            if (acaoExibir.armaStr?.includes('FATAL')) { isCritFatal = true; isCritNormal = false; }
            else if (acaoExibir.armaStr?.includes('CRÍTICO')) { isCritNormal = true; isCritFatal = false; }
        }
    }

    const isForaDeCombate = acaoExibir && emCombate && (!ordemSegura.find(j => j.nome === acaoExibir.nome));
    const isForaDeTurno = acaoExibir && emCombate && !isForaDeCombate && acaoExibir.nome !== nomeBase;

    let corImpacto = '#333', corHeader = '#00ffcc', corTextoHeader = '#000', tituloImpacto = 'AÇÃO', valorImpacto = 0;
    if (acaoExibir) {
        switch (acaoExibir.tipo) {
            case 'dano': corImpacto = '#ff003c'; tituloImpacto = 'DANO'; valorImpacto = acaoExibir.dano; break;
            case 'acerto': corImpacto = '#f90'; tituloImpacto = 'ACERTO'; valorImpacto = acaoExibir.acertoTotal; break;
            case 'evasiva': corImpacto = '#0088ff'; tituloImpacto = 'ESQUIVA'; valorImpacto = acaoExibir.total; break;
            case 'resistencia': corImpacto = '#ccc'; tituloImpacto = 'BLOQUEIO'; valorImpacto = acaoExibir.total; break;
            case 'escudo': corImpacto = '#f0f'; tituloImpacto = 'ESCUDO'; valorImpacto = acaoExibir.escudoReduzido; break;
            case 'sistema': corImpacto = '#ffcc00'; tituloImpacto = 'AVISO DO SISTEMA'; valorImpacto = 0; break;
            default: break;
        }
    }

    if (isCritFatal) { corImpacto = '#ff003c'; corHeader = '#ff003c'; corTextoHeader = '#fff'; tituloImpacto = '🔥 CRÍTICO FATAL 🔥'; }
    else if (isCritNormal) { corImpacto = '#ffcc00'; corHeader = '#ffcc00'; corTextoHeader = '#000'; tituloImpacto = '⚡ CRÍTICO NORMAL ⚡'; }
    else if (isFalha) { corImpacto = '#660000'; corHeader = '#660000'; corTextoHeader = '#ff003c'; tituloImpacto = '☠️ FALHA CRÍTICA ☠️'; }
    else if (acaoExibir) {
        corHeader = corImpacto; corTextoHeader = '#000';
        if (acaoExibir.tipo === 'sistema' && acaoExibir.texto.includes('É a vez de')) {
            tituloImpacto = `⚡ TURNO DE ${nomeBase} ⚡`;
            corHeader = '#00ffcc';
            corImpacto = '#00ffcc';
        } else if (acaoExibir.tipo === 'sistema') {
            tituloImpacto = 'AVISO DO SISTEMA';
        } else if (jogadorDaVez && !isForaDeTurno && !isForaDeCombate) {
            tituloImpacto = `TURNO DE ${nomeBase}`;
        } else {
            tituloImpacto = 'AÇÃO LIVRE';
        }
    } else {
        tituloImpacto = `⚡ TURNO DE ${nomeBase} ⚡`;
    }

    return (
        <>
            {/* 🔥 A moldura pulsa ao chegar uma ação nova — o key={feedSeguro.length} força o
                React a remontar esta div a cada item novo no feed, o que reinicia a animação
                CSS do zero (o mesmo truque de "resetar com key" usado pra qualquer elemento,
                não só itens de lista). Sem isso a moldura só troca o número na hora, estática. */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes hologramaImpacto {
                    0% { transform: scale(1.035); filter: brightness(1.6); }
                    100% { transform: scale(1); filter: brightness(1); }
                }
                .holograma-impacto {
                    animation: hologramaImpacto 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                }
            `}} />
            <div key={feedSeguro.length} className="def-box holograma-impacto" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: isGrand ? `3px solid #ffcc00` : (isCandidato ? `2px solid #00ccff` : `2px solid ${corImpacto}`), boxShadow: isGrand ? `0 0 30px rgba(255,0,60,0.6), inset 0 0 20px rgba(255,204,0,0.3)` : (isCandidato ? `0 0 20px rgba(0,204,255,0.4)` : `0 0 20px ${corImpacto}40`) }}>
            <div style={{ background: corHeader, color: corTextoHeader, padding: '10px', textAlign: 'center', fontWeight: '900', letterSpacing: 2, fontSize: '1.2em', textTransform: 'uppercase' }}>{tituloImpacto}</div>
            {acaoExibir?.tipo === 'sistema' && !acaoExibir.texto.includes('É a vez de') ? (
                 <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', background: 'rgba(0,0,0,0.8)' }}>
                    <h2 style={{ color: '#ffcc00', textShadow: '0 0 20px #ffcc00' }}>{acaoExibir.texto}</h2>
                 </div>
            ) : (
                <>
                    <div style={{ flex: '1', minHeight: '250px', backgroundImage: urlSeguraParaCss(infoBase?.img) || 'none', backgroundSize: 'cover', backgroundPosition: 'top center', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', boxShadow: 'inset 0 -100px 50px -20px rgba(0,0,0,0.9)' }}>
                        <div style={{ padding: '20px', zIndex: 2, background: isGrand ? 'linear-gradient(to top, rgba(255,0,60,0.9), transparent)' : (isCandidato ? 'linear-gradient(to top, rgba(0,136,255,0.8), transparent)' : 'none') }}>
                            {isGrand && <div style={{ color: '#ffcc00', fontSize: '0.85em', fontWeight: 'bold', textShadow: '0 0 5px #ff003c', letterSpacing: 2, marginBottom: '5px' }}>👑 GRAND {classId?.toUpperCase()}</div>}
                            {isCandidato && <div style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold', textShadow: '0 0 5px #0088ff', letterSpacing: 2, marginBottom: '5px' }}>🌟 CANDIDATO A {classId?.toUpperCase()}</div>}
                            <h2 style={{ margin: 0, color: '#fff', fontSize: '2em', textShadow: isGrand ? '0 0 15px #ffcc00, 2px 2px 0px #000' : '0 0 10px #000, 2px 2px 0px #000', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isGrand && grandIconUrl ? <img src={grandIconUrl} alt="Grand" style={{ height: '1.5em', width: '1.5em', objectFit: 'cover', borderRadius: '50%', border: '2px solid #ffcc00', boxShadow: '0 0 10px #ff003c' }} /> : customClassIcon ? <img src={customClassIcon} alt={classId} style={{ height: '1.2em', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 5px rgba(0,255,204,0.5))' }} /> : defaultClassSymbol ? <span style={{ fontSize: '0.9em', filter: 'drop-shadow(0 0 5px rgba(0,255,204,0.5))' }}>{defaultClassSymbol}</span> : null}
                                {nomeBase}
                            </h2>
                            {infoBase?.forma && <div style={{ color: '#00ffcc', fontSize: '1.2em', fontWeight: 'bold', textShadow: '0 0 5px #000' }}>☄️ {infoBase.forma}</div>}
                        </div>
                    </div>
                    {acaoExibir && (
                        <div style={{ padding: '20px', background: 'rgba(0,0,0,0.85)', textAlign: 'center', borderTop: `1px solid ${corImpacto}` }}>
                            {isForaDeCombate && <div style={{ background: 'rgba(255,204,0,0.1)', color: '#ffcc00', border: '1px solid #ffcc00', padding: 4, fontSize: '0.8em', marginBottom: 10, borderRadius: 4 }}>⚠️ Rolagem Fora de Combate</div>}
                            {isForaDeTurno && <div style={{ background: 'rgba(255,0,60,0.1)', color: '#ff003c', border: '1px solid #ff003c', padding: 4, fontSize: '0.8em', marginBottom: 10, borderRadius: 4 }}>❌ Ação Fora de Turno</div>}
                            
                            <div style={{ fontSize: '0.9em', color: '#aaa', marginBottom: '5px', textTransform: 'uppercase' }}>
                                {tituloImpacto} {(!isForaDeCombate && !isForaDeTurno && acaoExibir.tipo !== 'sistema') ? '' : `(${acaoExibir.nome})`}
                            </div>

                            {acaoExibir.tipo === 'sistema' ? (
                                <h2 style={{ margin: '15px 0', color: '#ffcc00', textShadow: '0 0 10px #ffcc00' }}>{acaoExibir.texto}</h2>
                            ) : (
                                <>
                                    <h1 style={{ margin: 0, fontSize: '4em', color: corImpacto, textShadow: `0 0 20px ${corImpacto}` }}>{fmt(valorImpacto)}</h1>
                                    {acaoExibir.tipo === 'dano' && acaoExibir.letalidade !== undefined && <div style={{ color: '#ffcc00', fontSize: '1.2em', fontWeight: 'bold', marginTop: '10px', textShadow: '0 0 5px #ffcc00' }}>LETALIDADE: +{acaoExibir.letalidade}</div>}
                                </>
                            )}
                            
                            {acaoExibir.alvosArea && acaoExibir.alvosArea.length > 0 && (
                                <div style={{ marginTop: 15, padding: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 4, borderLeft: `3px solid ${acaoExibir.alvosArea.some(a=>a.acertou) ? '#0f0' : '#f00'}`, textAlign: 'left' }}>
                                    {acaoExibir.areaEf > 0 && <div style={{ color: '#00ccff', fontSize: '0.85em', marginBottom: 6, fontWeight: 'bold', textTransform: 'uppercase' }}>💥 Explosão atingiu {acaoExibir.alvosArea.length} alvo(s):</div>}
                                    {acaoExibir.alvosArea.map((a, i) => (
                                        <div key={i} style={{ color: a.acertou ? '#0f0' : '#f00', fontWeight: 'bold', fontSize: '0.9em', marginBottom: 2 }}>
                                            {a.acertou ? `🎯 Superou ${a.nome} (Def: ${a.defesa})!` : `❌ Falhou vs ${a.nome} (Def: ${a.defesa})!`}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {fichaBase && acaoExibir?.tipo !== 'sistema' && (
                        <div style={{ padding: '15px', background: '#050505' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffcc00', fontWeight: 'bold', paddingBottom: 8, marginBottom: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>⚡ PODER</span><span style={{ textShadow: '0 0 6px #ffcc00' }}>{formatarPoderCosmico(poderAtualBase)}</span></div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff4d4d', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>HP</span><span>{fmt(fichaBase.vida?.atual)}</span></div>
                                    <BarraVital atual={fichaBase.vida?.atual} maximo={vidaMaxima} cor="#ff4d4d" perigo />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4dffff', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>MP</span><span>{fmt(fichaBase.mana?.atual)}</span></div>
                                    <BarraVital atual={fichaBase.mana?.atual} maximo={manaMaxima} cor="#4dffff" />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffff4d', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>AU</span><span>{fmt(fichaBase.aura?.atual)}</span></div>
                                    <BarraVital atual={fichaBase.aura?.atual} maximo={auraMaxima} cor="#ffff4d" />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#00ffcc', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>CK</span><span>{fmt(fichaBase.chakra?.atual)}</span></div>
                                    <BarraVital atual={fichaBase.chakra?.atual} maximo={chakraMaximo} cor="#00ffcc" />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff66ff', fontWeight: 'bold' }}><span style={{ fontSize: '0.8em', alignSelf: 'center' }}>CP</span><span>{fmt(fichaBase.corpo?.atual)}</span></div>
                                    <BarraVital atual={fichaBase.corpo?.atual} maximo={corpoMaximo} cor="#ff66ff" />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: '#0088ff', fontWeight: 'bold', fontSize: '0.9em', textShadow: '0 0 5px #0088ff' }}>🛡️ EVA: {calcularCA(fichaBase, 'evasiva')}</div>
                                    <div style={{ color: '#ccc', fontWeight: 'bold', fontSize: '0.9em', textShadow: '0 0 5px #ccc' }}>🛡️ RES: {calcularCA(fichaBase, 'resistencia')}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
            </div>
        </>
    );
}