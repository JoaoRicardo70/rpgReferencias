import React from 'react';
import useStore from '../../stores/useStore';
import { getPercepcaoPoder, enxergaEfetividade, descreverEfetividade } from '../../core/percepcaoPoder';

export default function FeedCombate({ className }) {
    const feedCombate = useStore(s => s.feedCombate);
    const isMestre = useStore(s => s.isMestre);
    const minhaFicha = useStore(s => s.minhaFicha);

    if (feedCombate.length === 0) {
        return (
            <div id="feed-combate" className={className}>
                <p style={{ color: '#888', textAlign: 'center', fontStyle: 'italic' }}>
                    Aguardando acoes de combate...
                </p>
            </div>
        );
    }

    const reversed = [...feedCombate].reverse();
    // O dano recalculado pela Disputa de Poder é só do Mestre; o jogador vê a rolagem e, com
    // Percepção de Poder suficiente, se o golpe foi efetivo (core/percepcaoPoder.js).
    const veEfetividade = !isMestre && enxergaEfetividade(getPercepcaoPoder(minhaFicha));

    return (
        <div id="feed-combate" className={className}>
            {reversed.map((d, idx) => {
                
                // 🔥 NOVO: TRATAMENTO DE ÁREA DE EFEITO (AoE) 🔥
                const alvosArray = d.alvosArea || (d.alvoNome ? [{ nome: d.alvoNome, defesa: d.alvoDefesa, acertou: d.acertouAlvo }] : []);

                // 🔥 NOVO: TESTE DE HABILIDADE (PERÍCIA)
                if (d.tipo === 'skill') {
                    return (
                        <div key={idx} className="damage-log" style={{ borderLeftColor: '#0088ff', background: 'rgba(0,136,255,0.1)' }}>
                            <p style={{ color: '#0088ff' }}>
                                <span dangerouslySetInnerHTML={{ __html: `🎯 <strong>${d.nome}</strong> fez um Teste de <strong>${d.nomeTeste}</strong>:` }} />
                            </p>
                            <h1 className="damage-number" style={{ color: '#0088ff', textShadow: '0 0 20px rgba(0,136,255,0.8)' }}>
                                {d.total}
                            </h1>
                            <div className="log-details" dangerouslySetInnerHTML={{ __html: d.detalheCalc }} />
                        </div>
                    );
                }

                // 🔥 NOVO: SAVING THROW (RESISTÊNCIA PURA)
                if (d.tipo === 'saving') {
                    return (
                        <div key={idx} className="damage-log" style={{ borderLeftColor: '#ffcc00', background: 'rgba(255,204,0,0.1)' }}>
                            <p style={{ color: '#ffcc00' }}>
                                <span dangerouslySetInnerHTML={{ __html: `🛡️ <strong>${d.nome}</strong> rolou um Saving Throw de <strong>${d.nomeTeste}</strong>:` }} />
                            </p>
                            <h1 className="damage-number" style={{ color: '#ffcc00', textShadow: '0 0 20px rgba(255,204,0,0.8)' }}>
                                {d.total}
                            </h1>
                            <div className="log-details" dangerouslySetInnerHTML={{ __html: d.detalheCalc }} />
                        </div>
                    );
                }

                if (d.tipo === 'acerto') {
                    return (
                        <div key={idx} className="damage-log" style={{ borderLeftColor: '#f90', background: 'rgba(255,153,0,0.1)' }}>
                            <p style={{ color: '#f90' }}>
                                <span dangerouslySetInnerHTML={{ __html: `&#x1F3AF; <strong>${d.nome}</strong> rolou Acerto usando <strong>${d.atributosUsados}</strong>${d.armaStr || ''}:` }} />
                            </p>
                            <h1 className="damage-number" style={{ color: '#f90', textShadow: '0 0 20px rgba(255,153,0,0.8)' }}>
                                {d.acertoTotal}
                            </h1>
                            <p className="lethality" style={{ color: '#fff' }}>{d.profBonusTexto}</p>
                            <div className="log-details" dangerouslySetInnerHTML={{ __html: `&#x1F3B2; Rolagem Base: ${d.rolagem}` }} />
                            
                            {/* 🔥 FEEDBACK VISUAL PARA MÚLTIPLOS ALVOS E ÁREA 🔥 */}
                            {alvosArray.length > 0 && (
                                <div style={{ marginTop: 8, padding: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 4, borderLeft: `3px solid ${alvosArray.some(a=>a.acertou) ? '#0f0' : '#f00'}`, textAlign: 'left' }}>
                                    {d.areaEf > 0 && <div style={{ color: '#00ccff', fontSize: '0.85em', marginBottom: 6, fontWeight: 'bold', textTransform: 'uppercase' }}>💥 Explosão em Área ({d.areaEf} Quadrados) atingiu {alvosArray.length} alvo(s):</div>}
                                    {alvosArray.map((a, i) => (
                                        <div key={i} style={{ color: a.acertou ? '#0f0' : '#f00', fontWeight: 'bold', fontSize: '0.9em', marginBottom: 2 }}>
                                            {a.acertou ? `🎯 Superou ${a.nome} (Def: ${a.defesa})!` : `❌ Falhou vs ${a.nome} (Def: ${a.defesa})!`}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }

                if (d.tipo === 'evasiva') {
                    return (
                        <div key={idx} className="damage-log" style={{ borderLeftColor: '#0088ff', background: 'rgba(0,136,255,0.1)' }}>
                            <p style={{ color: '#0088ff' }}>
                                <span dangerouslySetInnerHTML={{ __html: `&#x1F4A8; <strong>${d.nome}</strong> declarou Esquiva${d.armaStr || ''}:` }} />
                            </p>
                            <h1 className="damage-number" style={{ color: '#0088ff', textShadow: '0 0 20px rgba(0,136,255,0.8)' }}>
                                {d.total}
                            </h1>
                            <div className="log-details" dangerouslySetInnerHTML={{ __html: d.baseCalc }} />
                        </div>
                    );
                }

                if (d.tipo === 'resistencia') {
                    return (
                        <div key={idx} className="damage-log" style={{ borderLeftColor: '#ccc', background: 'rgba(200,200,200,0.1)' }}>
                            <p style={{ color: '#ccc' }}>
                                <span dangerouslySetInnerHTML={{ __html: `&#x1F6E1;&#xFE0F; <strong>${d.nome}</strong> declarou Bloqueio${d.armaStr || ''}:` }} />
                            </p>
                            <h1 className="damage-number" style={{ color: '#ccc', textShadow: '0 0 20px rgba(200,200,200,0.8)' }}>
                                {d.total}
                            </h1>
                            <div className="log-details" dangerouslySetInnerHTML={{ __html: d.baseCalc }} />
                        </div>
                    );
                }

                if (d.tipo === 'escudo') {
                    const tg = d.vitalidade > 0 ? ` <span style="color:#ffcc00;">(Vit: +${d.vitalidade})</span>` : '';
                    return (
                        <div key={idx} className="damage-log" style={{ borderLeftColor: '#f0f', background: 'rgba(255,0,255,0.1)' }}>
                            <p style={{ color: '#f0f' }}>
                                <span dangerouslySetInnerHTML={{ __html: `&#x2728; <strong>${d.nome}</strong> ativou Escudo${d.armaStr || ''}:` }} />
                            </p>
                            <h1 className="damage-number" style={{ color: '#f0f', textShadow: '0 0 20px rgba(255,0,255,0.8)' }}>
                                <span dangerouslySetInnerHTML={{ __html: `${(d.escudoReduzido || 0).toLocaleString('pt-BR')}${tg}` }} />
                            </h1>
                            <div className="log-details" dangerouslySetInnerHTML={{ __html: d.detalhe }} />
                        </div>
                    );
                }

                if (d.tipo === 'sistema') {
                    return (
                        <div key={idx} className="damage-log" style={{ borderLeftColor: '#ffcc00', background: 'rgba(255,204,0,0.1)', textAlign: 'center' }}>
                            <h3 style={{ color: '#ffcc00', margin: '10px 0', textShadow: '0 0 10px rgba(255,204,0,0.8)' }}>{d.texto}</h3>
                            {isMestre && d.textoMestre && <div className="feed-texto-mestre">🔒 {d.textoMestre}</div>}
                        </div>
                    );
                }

                // Default: dano
                return (
                    <div key={idx} className="damage-log">
                        <p dangerouslySetInnerHTML={{ __html: `&#x1F4A5; <strong>${d.nome}</strong> atacou usando <strong>${d.atributosUsados}</strong>${d.armaStr || ''}:` }} />
                        <h1 className="damage-number">
                            {(d.dano || 0).toLocaleString('pt-BR')}
                        </h1>
                        <p className="lethality">
                            LETALIDADE: {d.letalidade > 0 ? '+' + d.letalidade : '0'}
                        </p>
                        <div className="log-details" dangerouslySetInnerHTML={{
                            __html: `&#x1F3B2; Rolagem de Dados: ${d.rolagem || ''}${d.rolagemMagica || ''}${d.detalheEnergia || ''}${d.detalheConta || ''}`
                        }} />

                        {/* ⚖️ Dano em área: o recalculo por alvo é do Mestre; o jogador só vê a efetividade, se perceber */}
                        {isMestre && d.detalheDisputa && <div className="feed-disputa-poder">🔒 {d.detalheDisputa}</div>}
                        {veEfetividade && Array.isArray(d.efetividadeAlvos) && d.efetividadeAlvos.map((a, i) => {
                            const ef = descreverEfetividade(a.efetividade);
                            return ef ? <div key={i} className={`feed-efetividade feed-efetividade--${ef.nivel}`}>{a.nome}: {ef.texto}</div> : null;
                        })}

                        {/* 🔥 FEEDBACK VISUAL DO DANO E DO OVERKILL NO ALVO */}
                        {d.alvoNome && (
                            <div style={{ marginTop: 8, padding: 5, background: 'rgba(0,0,0,0.5)', borderRadius: 4, borderLeft: `3px solid #ff003c` }}>
                                <span style={{ color: '#ff003c', fontWeight: 'bold' }}>
                                    {isMestre
                                        ? `🩸 Causou ${(d.danoAplicado ?? d.dano ?? 0).toLocaleString('pt-BR')} de dano em ${d.alvoNome}!`
                                        : `🩸 Golpe em ${d.alvoNome}!`} {d.alvoSobreviveu ? '' : '(💀 MORTO!)'}
                                </span>
                                {/* ⚖️ Disputa de Poder (core/disputaPoder.js): o Mestre vê o recalculo; o jogador, só a efetividade (se perceber) */}
                                {isMestre && d.textoDisputa && <div className="feed-disputa-poder">{d.textoDisputa}</div>}
                                {isMestre && d.danoAplicado !== undefined && d.danoAplicado !== d.dano && (
                                    <div className="feed-disputa-poder">🔒 Rolagem {(d.dano || 0).toLocaleString('pt-BR')}{d.fatorVida && d.fatorVida !== 1 ? ` × ${(Math.round(d.fatorVida * 100) / 100).toLocaleString('pt-BR')} (Vida do alvo)` : ''} → aplicado {d.danoAplicado.toLocaleString('pt-BR')}</div>
                                )}
                                {veEfetividade && d.efetividade && (() => {
                                    const ef = descreverEfetividade(d.efetividade);
                                    return ef ? <div className={`feed-efetividade feed-efetividade--${ef.nivel}`}>{ef.texto}</div> : null;
                                })()}
                                {isMestre && d.overkill > 0 && (
                                    <div style={{ color: '#ffcc00', fontSize: '0.9em', marginTop: 4, fontWeight: 'bold', textShadow: '0 0 5px #ffcc00' }}>
                                        💥 OVERKILL: +{d.overkill.toLocaleString('pt-BR')} de dano excedente!
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}