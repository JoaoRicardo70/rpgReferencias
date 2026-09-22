import React, { useState } from 'react';
import useStore from '../../stores/useStore';
import { getDatabase, ref, update } from 'firebase/database';
import { calcularEficaciaCura } from '../../core/engine';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';
import { calcularPoderAtual } from '../../core/poder';
import { formatarPoderCosmico } from '../../core/utils';
import DiarioNPC from './DiarioNPC';

export const TODAS_CONDICOES_BASE = [
    { id: 'sangrando', icone: '🩸', cor: '#ff003c', nome: 'Sangrando' },
    { id: 'queimado', icone: '🔥', cor: '#ff4400', nome: 'Queimado' },
    { id: 'exausto', icone: '😮‍💨', cor: '#aaaaaa', nome: 'Exausto' },
    { id: 'envenenado', icone: '🤢', cor: '#00ff00', nome: 'Envenenado' },
    { id: 'criogenia', icone: '❄️', cor: '#00ffff', nome: 'Criogenia' },
    { id: 'lento', icone: '🐢', cor: '#aadd00', nome: 'Lento' },
    { id: 'imobilizado', icone: '⛓️', cor: '#888888', nome: 'Imobilizado' },
    { id: 'incapacitado', icone: '☠️', cor: '#444444', nome: 'Incapacitado' },
    { id: 'vulneravel', icone: '🛡️', cor: '#ffaa00', nome: 'Vulnerável' },
    { id: 'amedrontado', icone: '👻', cor: '#8a2be2', nome: 'Amedrontado' },
    { id: 'enlouquecido', icone: '🌀', cor: '#ff00ff', nome: 'Enlouquecido' },
    { id: 'necrosado', icone: '💀', cor: '#222222', nome: 'Necrosado' },
    { id: 'cegosurdo', icone: '🙈', cor: '#dddddd', nome: 'Cego/Surdo' },
    { id: 'petrificado', icone: '🗿', cor: '#555555', nome: 'Petrificado' },
    { id: 'charmado', icone: '💖', cor: '#ff66b2', nome: 'Charmado' },
    { id: 'provocado', icone: '💢', cor: '#ff5500', nome: 'Provocado' }
];

// 🔥 OTIMIZAÇÃO (Domínio do Mestre): antes este componente assinava a árvore INTEIRA de
// `personagens` do Zustand (useStore(s => s.personagens)) só pra recalcular a lista de
// condições -- como cada card de entidade no Visor monta um PainelMestreSandbox próprio, QUALQUER
// atualização de QUALQUER personagem na mesa (ex.: um jogador tomando dano) fazia TODOS os
// sandboxes (mesmo os fechados/de outras entidades) re-renderizar e recalcular esse merge.
// Agora `condicoesGlobais` já vem pronto do pai (MestreSubComponents.jsx > MestreVisorJogadores),
// calculado UMA vez pra todos os cards, e os `personagens` que os handlers abaixo ainda precisam
// pra gravar (spread otimista) são lidos sob demanda via useStore.getState() -- sem assinar
// re-renders por isso.
export default function PainelMestreSandbox({ personagemId, ficha, condicoesGlobais }) {
    const mesaId = useStore(s => s.mesaId);
    const meuNome = useStore(s => s.meuNome);
    const setPersonagens = useStore(s => s.setPersonagens);
    const updateFicha = useStore(s => s.updateFicha);
    const divisorPoderMesa = useStore(s => s.divisorPoderMesa);
    const db = getDatabase();

    const [expandido, setExpandido] = useState(false);
    const [valorRapido, setValorRapido] = useState('');
    const [energiaAlvo, setEnergiaAlvo] = useState('vida');

    // 🔥 ESTADO DO MODAL DE TELA CHEIA PARA O GRIMÓRIO
    const [grimorioAberto, setGrimorioAberto] = useState(false);

    // ⚡ Poder Calculado — mesma conta do Scouter na Ficha (core/poder.js > calcularPoderAtual),
    // pro Mestre ver a força da entidade sem precisar abrir o Grimório dela. Só calcula com o
    // painel expandido (só aí a badge aparece) -- este cálculo não é trivial (percorre status,
    // poderes, seres selados e a arma espiritual), e todo card do Visor de Entidades monta um
    // PainelMestreSandbox próprio (ver comentário no topo do arquivo); recalcular à toa em cada
    // um, a cada atualização de QUALQUER personagem da mesa, reintroduziria o mesmo desperdício
    // que esse comentário já documenta ter sido eliminado pro resto do card.
    const poderCalculado = expandido ? calcularPoderAtual(ficha, divisorPoderMesa).poderGlobal : 0;

    const condicoesDinamicas = condicoesGlobais || TODAS_CONDICOES_BASE;

    const aplicarCuraDano = (tipo) => {
        let val = parseInt(valorRapido);
        if (!val || isNaN(val) || val <= 0) return;

        if (tipo === 'cura' && energiaAlvo === 'vida') {
            const eficacia = calcularEficaciaCura(ficha); 
            const valOriginal = val;
            val = Math.floor(val * eficacia);

            if (eficacia < 1.0) {
                alert(`🩸 Ferimentos Graves! Eficácia de cura reduzida para ${Math.round(eficacia * 100)}%.\nValor original: ${valOriginal} ➔ Curou apenas: ${val}`);
            } else if (eficacia > 1.0) {
                alert(`✨ SOBRECURA! Eficácia de cura aumentada para ${Math.round(eficacia * 100)}%!\nValor original: ${valOriginal} ➔ Curou monstruosos: ${val}`);
            }
        }

        // 🔥 Reformulação de Vida/Energias: "val" (e os alertas de eficácia de cura acima) ficam na
        // escala EXIBIDA (a mesma que o Mestre vê no card do jogador) -- só aqui, na hora de
        // aplicar de fato, é que vira o valor bruto gravado em ficha[energiaAlvo].atual. energiaAlvo
        // só assume vida/mana/aura/chakra/corpo (ver <select> abaixo), todos dentro da reformulação.
        const valBruto = val * FATOR_EXIBICAO_VITAIS;
        let valorAtual = ficha?.[energiaAlvo]?.atual !== undefined ? ficha[energiaAlvo].atual : 0;
        let novoValor = tipo === 'dano' ? valorAtual - valBruto : valorAtual + valBruto;

        if (novoValor < 0) novoValor = 0;

        update(ref(db, `mesas/${mesaId}/personagens/${personagemId}/${energiaAlvo}`), {
            atual: novoValor
        }).catch(err => alert("Erro ao atualizar recursos: " + err.message));

        setPersonagens({
            ...useStore.getState().personagens,
            [personagemId]: {
                ...ficha,
                [energiaAlvo]: {
                    ...ficha[energiaAlvo],
                    atual: novoValor
                }
            }
        });

        if (personagemId === meuNome) {
            updateFicha(f => {
                if (!f[energiaAlvo]) f[energiaAlvo] = {};
                f[energiaAlvo].atual = novoValor;
            });
        }

        setValorRapido('');
    };

    const modificarCondicaoSandbox = (condId, delta) => {
        let condicoesAtuais = ficha?.condicoes ? JSON.parse(JSON.stringify(ficha.condicoes)) : [];
        const index = condicoesAtuais.findIndex(c => c.id === condId);

        if (index > -1) {
            condicoesAtuais[index].stacks += delta;
            if (condicoesAtuais[index].stacks <= 0) {
                condicoesAtuais.splice(index, 1);
            }
        } else if (delta > 0) {
            condicoesAtuais.push({ id: condId, stacks: 1 });
        }

        update(ref(db, `mesas/${mesaId}/personagens/${personagemId}`), {
            condicoes: condicoesAtuais
        }).catch(e => console.error(e));

        setPersonagens({
            ...useStore.getState().personagens,
            [personagemId]: {
                ...ficha,
                condicoes: condicoesAtuais
            }
        });

        if (personagemId === meuNome) {
            updateFicha(f => {
                f.condicoes = condicoesAtuais;
            });
        }
    };

    const condicoesDaFicha = ficha?.condicoes || [];

    return (
        <div style={{ marginTop: '15px', width: '100%' }}>
            
            {/* 👑 MODAL DE TELA CHEIA DO GRIMÓRIO */}
            {grimorioAberto && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }}>
                    <div className="fade-in" style={{ width: '100%', maxWidth: '1400px', height: '95vh', overflowY: 'auto', position: 'relative' }}>
                        
                        <button 
                            onClick={() => setGrimorioAberto(false)} 
                            style={{ position: 'absolute', top: '10px', right: '30px', background: '#ff003c', color: '#fff', border: '3px solid #000', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2em', cursor: 'pointer', zIndex: 100, boxShadow: '4px 4px 0px rgba(0,0,0,0.5)', transition: 'transform 0.2s' }}
                            onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                        >
                            ❌ FECHAR LIVRO
                        </button>
                        
                        <DiarioNPC 
                            npcData={{ ...ficha, nome: personagemId }} 
                            onSaveNpc={(novosDados) => {
                                const fichaAtualizada = { ...novosDados };
                                delete fichaAtualizada.nome;
                                update(ref(db, `mesas/${mesaId}/personagens/${personagemId}`), fichaAtualizada).catch(err => alert("Erro ao salvar NPC: " + err.message));
                                setPersonagens({
                                    ...useStore.getState().personagens,
                                    [personagemId]: fichaAtualizada
                                });
                            }} 
                        />
                    </div>
                </div>
            )}

            <button 
                onClick={() => setExpandido(!expandido)}
                style={{ 
                    width: '100%', background: expandido ? 'rgba(255, 204, 0, 0.2)' : 'rgba(0,0,0,0.6)', 
                    border: expandido ? '2px solid #ffcc00' : '1px solid #ffcc00', color: '#ffcc00', padding: '10px', 
                    borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1em',
                    transition: 'all 0.3s', textShadow: expandido ? '0 0 5px #ffcc00' : 'none'
                }}
            >
                {expandido ? '▼ FECHAR PAINEL DE CONTROLE' : '⚡ EXPANDIR SANDBOX DO MESTRE'}
            </button>

            {expandido && (
                <div className="fade-in" style={{ background: 'rgba(10,10,15,0.95)', border: '2px solid #ffcc00', borderTop: 'none', padding: '15px', borderRadius: '0 0 8px 8px', boxShadow: '0 5px 15px rgba(0,0,0,0.8)' }}>

                    {/* ⚡ PODER CALCULADO — mesmo número do Scouter na Ficha desta entidade */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,204,0,0.08)', border: '1px solid #ffcc00', borderRadius: '6px', padding: '10px 15px', marginBottom: '15px', fontWeight: 'bold' }}>
                        <span style={{ color: '#ffcc00' }}>⚡ Poder Calculado</span>
                        <span style={{ color: '#ffcc00', fontSize: '1.2em', textShadow: '0 0 6px #ffcc00' }}>{formatarPoderCosmico(poderCalculado)}</span>
                    </div>

                    {/* BOTÃO PARA ABRIR O GRIMÓRIO (TELA CHEIA) */}
                    <button 
                        onClick={() => setGrimorioAberto(true)}
                        style={{ width: '100%', background: 'linear-gradient(45deg, #aa00ff, #ff007f)', border: 'none', color: '#fff', padding: '15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2em', marginBottom: '20px', boxShadow: '0 4px 15px rgba(170,0,255,0.4)', textShadow: '1px 1px 2px #000' }}
                    >
                        📖 ABRIR GRIMÓRIO DA ENTIDADE
                    </button>

                    {/* MODIFICADOR DE RECURSOS RÁPIDO */}
                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '6px', border: '1px solid #333', marginBottom: '15px' }}>
                        <div style={{ fontSize: '0.8em', color: '#ffcc00', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase' }}>Manipulação Rápida de Recursos</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <select 
                                value={energiaAlvo} 
                                onChange={e => setEnergiaAlvo(e.target.value)} 
                                style={{ flex: '1 1 90px', padding: '8px', background: '#111', color: '#00ffcc', border: '1px solid #00ffcc', borderRadius: '4px', fontWeight: 'bold' }}
                            >
                                <option value="vida">HP (Vida)</option>
                                <option value="mana">Mana</option>
                                <option value="aura">Aura</option>
                                <option value="chakra">Chakra</option>
                                <option value="corpo">Corpo</option>
                            </select>
                            
                            <input 
                                type="number" 
                                placeholder="Ex: 500"
                                value={valorRapido} 
                                onChange={e => setValorRapido(e.target.value)} 
                                style={{ flex: '2 1 120px', padding: '8px', background: '#000', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '1.1em', textAlign: 'center' }} 
                            />
                            
                            <button 
                                onClick={() => aplicarCuraDano('dano')} 
                                style={{ flex: '1 1 80px', background: 'rgba(255, 0, 60, 0.2)', color: '#ff003c', border: '1px solid #ff003c', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1em', transition: '0.2s' }}
                            >
                                - DRENAR
                            </button>
                            <button 
                                onClick={() => aplicarCuraDano('cura')} 
                                style={{ flex: '1 1 80px', background: 'rgba(0, 255, 204, 0.2)', color: '#00ffcc', border: '1px solid #00ffcc', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1em', transition: '0.2s' }}
                            >
                                + CURAR
                            </button>
                        </div>
                    </div>

                    {/* MODIFICADOR DE CONDIÇÕES GERAIS */}
                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '6px', border: '1px solid #333' }}>
                        <div style={{ fontSize: '0.8em', color: '#ff003c', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase' }}>Injeção de Condições</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' }}>
                            {condicoesDinamicas.map(c => {
                                const ativa = condicoesDaFicha.find(ca => ca.id === c.id);
                                const corDef = c.cor || '#fff';
                                return (
                                    <div key={c.id} title={c.nome} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: ativa ? `${corDef}20` : 'rgba(255,255,255,0.02)', border: `1px solid ${ativa ? corDef : '#222'}`, padding: '8px 4px', borderRadius: '6px', transition: '0.3s' }}>
                                        <div style={{ fontSize: '1.5em', marginBottom: '4px' }}>{c.icone}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '15px' }}>
                                            <button onClick={() => modificarCondicaoSandbox(c.id, -1)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: 0, fontSize: '1.2em', fontWeight: 'bold' }}>-</button>
                                            <strong style={{ color: ativa ? corDef : '#555', fontSize: '1em', minWidth: '12px', textAlign: 'center' }}>{ativa ? ativa.stacks : 0}</strong>
                                            <button onClick={() => modificarCondicaoSandbox(c.id, 1)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '1.2em', fontWeight: 'bold' }}>+</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}